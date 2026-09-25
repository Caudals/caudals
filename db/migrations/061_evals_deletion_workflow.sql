-- Durable data lifecycle (spec §16.4, §17.5, §22.2 scenario 10).
--
-- A workspace deletion is a request followed by an audited workflow: revoke
-- shares and credentials, stop jobs, withdraw reports, delete live objects,
-- then keep only a tombstone and the minimal recovery-control ledger. Archive
-- (not modelled here) is distinct from deletion.
BEGIN;

ALTER TABLE evals.workspace ADD COLUMN deleted_at timestamptz;

CREATE TABLE evals.deletion_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  scope text NOT NULL CHECK (scope IN ('workspace')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','completed','failed')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 2000),
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  not_before timestamptz NOT NULL,
  completed_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (org_id,id)
);
CREATE UNIQUE INDEX deletion_request_open ON evals.deletion_request(org_id) WHERE status IN ('requested','processing');
ALTER TABLE evals.deletion_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.deletion_request FORCE ROW LEVEL SECURITY;
CREATE POLICY deletion_request_tenant ON evals.deletion_request
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.deletion_request FROM PUBLIC;
GRANT SELECT,INSERT ON evals.deletion_request TO evals_runtime;
GRANT UPDATE (status,completed_at,summary) ON evals.deletion_request TO evals_runtime;

-- Only the deletion workflow marks a workspace deleted; it never un-deletes.
CREATE FUNCTION evals.tombstone_workspace(p_org_id uuid, p_request_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
BEGIN
  IF p_org_id IS DISTINCT FROM evals.org_id() THEN
    RAISE EXCEPTION 'deletion scope denied' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.deletion_request WHERE org_id=p_org_id AND id=p_request_id AND status='processing') THEN
    RAISE EXCEPTION 'deletion request is not processing' USING ERRCODE='55000';
  END IF;
  UPDATE evals.workspace SET deleted_at=COALESCE(deleted_at,now()) WHERE id=p_org_id;
END $$;
REVOKE ALL ON FUNCTION evals.tombstone_workspace(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.tombstone_workspace(uuid,uuid) TO evals_runtime;

-- Retention and deletion must run for every workspace, not only the dispatch
-- allowlist. This returns IDs with due lifecycle work and nothing else.
CREATE FUNCTION evals.lifecycle_due_workspaces()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
  SELECT DISTINCT org_id FROM (
    SELECT org_id FROM evals.artifact WHERE state<>'deleted' AND expires_at<=now()
    UNION SELECT org_id FROM evals.retention_job WHERE status='pending' AND not_before<=now()
    UNION SELECT org_id FROM evals.deletion_request WHERE status IN ('requested','processing') AND not_before<=now()
  ) due LIMIT 200
$$;
REVOKE ALL ON FUNCTION evals.lifecycle_due_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.lifecycle_due_workspaces() TO evals_runtime;

-- Lifecycle processing revokes credentials and withdraws reports for the tenant.
GRANT UPDATE (revoked_at) ON evals.secret_record TO evals_runtime;
-- A deletion request moves already-scheduled object deletions forward.
GRANT UPDATE (not_before) ON evals.retention_job TO evals_runtime;

-- Opt-in email notifications (spec §15.5): one delivery record per
-- notification and recipient, so each state transition emails at most once.
CREATE TABLE evals.notification_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  notification_id uuid NOT NULL,
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  provider_message_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (org_id,notification_id,user_id),
  FOREIGN KEY (org_id,notification_id) REFERENCES evals.notification(org_id,id)
);
ALTER TABLE evals.notification_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.notification_email FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_email_tenant ON evals.notification_email
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.notification_email FROM PUBLIC;
GRANT SELECT,INSERT ON evals.notification_email TO evals_runtime;
GRANT UPDATE (status,attempts,provider_message_id,last_error_code,sent_at) ON evals.notification_email TO evals_runtime;

-- Recipients who opted in for this kind; emails are never exposed otherwise.
CREATE FUNCTION evals.notification_email_recipients(p_org_id uuid, p_kind text)
RETURNS TABLE (user_id text, email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals,public AS $$
  SELECT m.user_id, u.email
  FROM evals.membership m
  JOIN public.auth_user u ON u.id=m.user_id AND u."emailVerified"
  JOIN evals.notification_preference p ON p.org_id=m.org_id AND p.user_id=m.user_id AND p.email
  WHERE m.org_id=p_org_id AND p_org_id=evals.org_id()
    AND CASE p_kind WHEN 'report_published' THEN p.completion WHEN 'run_failed' THEN p.failure WHEN 'input_required' THEN p.required_input ELSE false END
$$;
REVOKE ALL ON FUNCTION evals.notification_email_recipients(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.notification_email_recipients(uuid,text) TO evals_runtime;

CREATE FUNCTION evals.notification_due_workspaces()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
  SELECT DISTINCT n.org_id FROM evals.notification n
  WHERE n.created_at>now()-interval '3 days' AND n.kind IN ('report_published','run_failed','input_required')
    AND EXISTS (SELECT 1 FROM evals.notification_preference p WHERE p.org_id=n.org_id AND p.email)
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION evals.notification_due_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.notification_due_workspaces() TO evals_runtime;

COMMIT;
