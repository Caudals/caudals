-- Launch L-32 (spec v2 P-44): data controls.
--
-- 1. A per-workspace retention setting for observations (the answers a system
--    gave during test runs): 30, 90 or 365 days, or unset. Unset keeps the
--    behaviour before this migration: observations are never purged. Owners
--    change it only through evals.set_observation_retention(), which audits
--    every change.
-- 2. Purging an observation removes its content (messages, tool events,
--    artifact references) and stamps purged_at; the row, its ids, status,
--    timing metadata and its original content_hash stay, so assessments,
--    findings and run counts keep their provenance. The immutability trigger
--    still refuses every other UPDATE and every DELETE.
-- 3. Retention pins: observations of a run that is still active, that has
--    queued judge work, or that a kept report (not archived, not withdrawn)
--    was built from, and observations a regression case was drawn from, are
--    never purged (evals.observation_retention_pinned).
-- 4. The purge runs through the existing retention jobs (evals.retention_job,
--    object_type 'observation_run', action 'redact'); each purged observation
--    gets a recovery_control_event so a restore replays the purge.
-- 5. "Export all workspace data": evals.workspace_export, one background job
--    per request (CEF plus reports, zipped), stored privately until it
--    expires or the owner deletes it; expiry and deletion of the stored file
--    go through the same retention jobs (object_type 'workspace_export').
--
-- Forward repair: additive. The rollback refuses once an observation has been
-- purged or an export exists.
BEGIN;

-- 1. Retention setting -------------------------------------------------------

CREATE TABLE evals.workspace_retention (
  org_id uuid PRIMARY KEY REFERENCES evals.workspace(id),
  observation_days integer CONSTRAINT workspace_retention_days CHECK (observation_days IN (30, 90, 365)),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE evals.workspace_retention ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.workspace_retention FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_retention_read ON evals.workspace_retention FOR SELECT
  USING (org_id = evals.org_id());
REVOKE ALL ON evals.workspace_retention FROM PUBLIC;
GRANT SELECT ON evals.workspace_retention TO evals_runtime;

-- Owners only; the previous and new values are kept in the audit event.
CREATE FUNCTION evals.set_observation_retention(p_org_id uuid, p_days integer)
RETURNS TABLE (observation_days integer, version integer, updated_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE
  actor text := evals.actor_id();
  previous evals.workspace_retention%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_org_id IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM evals.membership m JOIN evals.workspace w ON w.id = m.org_id
    WHERE m.org_id = p_org_id AND m.user_id = actor AND m.role = 'owner' AND w.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NOT NULL AND p_days NOT IN (30, 90, 365) THEN
    RAISE EXCEPTION 'RETENTION_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO previous FROM evals.workspace_retention r WHERE r.org_id = p_org_id FOR UPDATE;
  IF FOUND AND previous.observation_days IS NOT DISTINCT FROM p_days THEN
    RETURN QUERY SELECT previous.observation_days, previous.version, previous.updated_at;
    RETURN;
  END IF;
  IF NOT FOUND AND p_days IS NULL THEN
    RETURN QUERY SELECT NULL::integer, 0, NULL::timestamptz;
    RETURN;
  END IF;
  INSERT INTO evals.workspace_retention AS r (org_id, observation_days, version, updated_by, updated_at)
    VALUES (p_org_id, p_days, 1, actor, now())
    ON CONFLICT (org_id) DO UPDATE
      SET observation_days = excluded.observation_days, version = r.version + 1,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org_id, actor, 'workspace.retention_changed', p_org_id::text,
      jsonb_build_object('observation_days', jsonb_build_object('before', previous.observation_days, 'after', p_days)));
  RETURN QUERY SELECT r.observation_days, r.version, r.updated_at FROM evals.workspace_retention r WHERE r.org_id = p_org_id;
END $$;
REVOKE ALL ON FUNCTION evals.set_observation_retention(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.set_observation_retention(uuid, integer) TO evals_runtime;

-- 2. Observation purge --------------------------------------------------------

ALTER TABLE evals.observation ADD COLUMN purged_at timestamptz;
CREATE INDEX observation_retention_due ON evals.observation (org_id, created_at) WHERE purged_at IS NULL;
CREATE INDEX report_revision_run ON evals.report_revision (org_id, run_id);

-- The content an observation keeps once purged: identity, status, timing and
-- usage metadata; no messages, tool events or artifact references. The
-- content_hash keeps fingerprinting the original content.
CREATE FUNCTION evals.purged_observation_document(p_document jsonb, p_purged_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, evals AS $$
  SELECT p_document || jsonb_build_object(
    'messages', '[]'::jsonb,
    'tool_events', '[]'::jsonb,
    'artifacts', '[]'::jsonb,
    'extensions', COALESCE(p_document -> 'extensions', '{}'::jsonb) || jsonb_build_object(
      'caudals.evals/retention', jsonb_build_object(
        'purged_at', to_char(p_purged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'reason', 'workspace_retention',
        'content_hash', 'original')))
$$;
REVOKE ALL ON FUNCTION evals.purged_observation_document(jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.purged_observation_document(jsonb, timestamptz) TO evals_runtime;

-- Observations stay immutable; the one permitted change is the purge itself.
CREATE FUNCTION evals.guard_observation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, evals AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.purged_at IS NULL AND NEW.purged_at IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['document', 'purged_at']) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['document', 'purged_at'])
     AND NEW.document IS NOT DISTINCT FROM evals.purged_observation_document(OLD.document, NEW.purged_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'immutable evidence: create a new revision' USING ERRCODE = '55000';
END $$;
DROP TRIGGER observation_immutable ON evals.observation;
CREATE TRIGGER observation_immutable BEFORE UPDATE OR DELETE ON evals.observation
  FOR EACH ROW EXECUTE FUNCTION evals.guard_observation();

-- Retention pins: evidence that a kept report or other work still depends on.
CREATE FUNCTION evals.observation_retention_pinned(p_org_id uuid, p_run_id uuid, p_observation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, evals AS $$
  SELECT EXISTS (
      SELECT 1 FROM evals.run r WHERE r.org_id = p_org_id AND r.id = p_run_id
        AND r.status IN ('queued', 'running', 'pause_requested', 'paused', 'cancel_requested'))
    OR EXISTS (
      SELECT 1 FROM evals.report_revision rr JOIN evals.report p ON p.org_id = rr.org_id AND p.id = rr.report_id
      WHERE rr.org_id = p_org_id AND rr.run_id = p_run_id AND p.archived_at IS NULL AND p.publication_status <> 'withdrawn')
    OR EXISTS (
      SELECT 1 FROM evals.judge_job j WHERE j.org_id = p_org_id AND j.run_id = p_run_id AND j.status = 'queued')
    OR EXISTS (
      SELECT 1 FROM evals.regression_case c WHERE c.org_id = p_org_id AND c.source_observation_id = p_observation_id)
$$;
REVOKE ALL ON FUNCTION evals.observation_retention_pinned(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.observation_retention_pinned(uuid, uuid, uuid) TO evals_runtime;

-- Read-only counts for a retention period: what a purge would remove now,
-- what the pins keep, and what is already purged. Runs as the caller (RLS).
CREATE FUNCTION evals.observation_retention_preview(p_org_id uuid, p_days integer)
RETURNS TABLE (due bigint, pinned bigint, purged bigint)
LANGUAGE sql STABLE SET search_path = pg_catalog, evals AS $$
  WITH old AS (
    SELECT o.id, o.run_id, o.purged_at,
      p_days IS NOT NULL AND o.created_at < now() - make_interval(days => p_days) AS expired
    FROM evals.observation o WHERE o.org_id = p_org_id
  )
  SELECT
    count(*) FILTER (WHERE expired AND purged_at IS NULL AND NOT evals.observation_retention_pinned(p_org_id, run_id, id)),
    count(*) FILTER (WHERE expired AND purged_at IS NULL AND evals.observation_retention_pinned(p_org_id, run_id, id)),
    count(*) FILTER (WHERE purged_at IS NOT NULL)
  FROM old
$$;
REVOKE ALL ON FUNCTION evals.observation_retention_preview(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.observation_retention_preview(uuid, integer) TO evals_runtime;

-- Workspaces whose setting makes unpinned observations due; IDs only.
CREATE FUNCTION evals.observation_retention_due_workspaces()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT s.org_id FROM evals.workspace_retention s JOIN evals.workspace w ON w.id = s.org_id AND w.deleted_at IS NULL
  WHERE s.observation_days IS NOT NULL AND EXISTS (
    SELECT 1 FROM evals.observation o
    WHERE o.org_id = s.org_id AND o.purged_at IS NULL
      AND o.created_at < now() - make_interval(days => s.observation_days)
      AND NOT evals.observation_retention_pinned(o.org_id, o.run_id, o.id))
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION evals.observation_retention_due_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.observation_retention_due_workspaces() TO evals_runtime;

-- Purge actions are recorded per observation so a restore can replay them.
ALTER TABLE evals.recovery_control_event DROP CONSTRAINT recovery_control_event_action_check;
ALTER TABLE evals.recovery_control_event ADD CONSTRAINT recovery_control_event_action_check
  CHECK (action IN ('share_revoked','credential_revoked','workspace_deleted','artifact_deleted','report_withdrawn','observation_purged','export_deleted'));

-- Purges the unpinned observations older than the workspace's setting (of one
-- run, or of the whole workspace when p_run_id is NULL). Unset: nothing.
CREATE FUNCTION evals.purge_retained_observations(p_org_id uuid, p_run_id uuid, p_limit integer DEFAULT 1000)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  keep_days integer;
  purged_ids uuid[];
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_org_id IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'retention scope denied' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN RAISE EXCEPTION 'retention_limit_invalid' USING ERRCODE = '22023'; END IF;
  SELECT r.observation_days INTO keep_days FROM evals.workspace_retention r
    JOIN evals.workspace w ON w.id = r.org_id AND w.deleted_at IS NULL
    WHERE r.org_id = p_org_id;
  IF keep_days IS NULL THEN RETURN 0; END IF;
  WITH due AS (
    SELECT o.id FROM evals.observation o
    WHERE o.org_id = p_org_id AND (p_run_id IS NULL OR o.run_id = p_run_id) AND o.purged_at IS NULL
      AND o.created_at < now() - make_interval(days => keep_days)
      AND NOT evals.observation_retention_pinned(o.org_id, o.run_id, o.id)
    ORDER BY o.created_at, o.id
    LIMIT p_limit
    FOR UPDATE OF o SKIP LOCKED
  ), purged AS (
    UPDATE evals.observation o
       SET purged_at = now(), document = evals.purged_observation_document(o.document, now())
      FROM due WHERE o.org_id = p_org_id AND o.id = due.id
    RETURNING o.id
  )
  SELECT array_agg(id) INTO purged_ids FROM purged;
  IF purged_ids IS NULL THEN RETURN 0; END IF;
  INSERT INTO evals.recovery_control_event (org_id, action, subject_type, subject_id, actor_id, payload_hash)
    SELECT p_org_id, 'observation_purged', 'observation', id, actor,
           encode(sha256(convert_to('observation_purged:' || id::text, 'UTF8')), 'hex')
    FROM unnest(purged_ids) AS id
    ON CONFLICT DO NOTHING;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org_id, actor, 'retention.observations_purged', COALESCE(p_run_id::text, p_org_id::text),
      jsonb_build_object('observations', cardinality(purged_ids), 'observation_days', keep_days, 'run_id', p_run_id));
  RETURN cardinality(purged_ids);
END $$;
REVOKE ALL ON FUNCTION evals.purge_retained_observations(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.purge_retained_observations(uuid, uuid, integer) TO evals_runtime;

-- 3. Export all workspace data ------------------------------------------------

CREATE TABLE evals.workspace_export (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'deleted', 'expired')),
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es')),
  -- As the owner saw it when asking; the scheduler that builds the file cannot read workspaces.
  workspace_name text NOT NULL CHECK (length(workspace_name) BETWEEN 1 AND 160),
  requested_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  object_key text UNIQUE,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 134217728),
  file_name text CHECK (file_name IS NULL OR file_name ~ '^[A-Za-z0-9._-]{1,120}$'),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_code text CHECK (reason_code IS NULL OR reason_code ~ '^[a-z_]{1,60}$'),
  expires_at timestamptz,
  deleted_at timestamptz,
  object_deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  CONSTRAINT workspace_export_completed CHECK (
    status NOT IN ('completed', 'expired') OR (object_key IS NOT NULL AND sha256 IS NOT NULL AND byte_size IS NOT NULL AND expires_at IS NOT NULL))
);
CREATE UNIQUE INDEX workspace_export_open ON evals.workspace_export (org_id) WHERE status IN ('queued', 'running');
CREATE INDEX workspace_export_org ON evals.workspace_export (org_id, requested_at DESC);
CREATE INDEX workspace_export_due ON evals.workspace_export (status, updated_at) WHERE status IN ('queued', 'running');
ALTER TABLE evals.workspace_export ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.workspace_export FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_export_tenant ON evals.workspace_export
  USING (org_id = evals.org_id()) WITH CHECK (org_id = evals.org_id());
REVOKE ALL ON evals.workspace_export FROM PUBLIC;
GRANT SELECT, INSERT ON evals.workspace_export TO evals_runtime;
GRANT UPDATE (status, started_at, completed_at, attempts, object_key, sha256, byte_size, file_name, summary,
  reason_code, expires_at, deleted_at, object_deleted_at, updated_at) ON evals.workspace_export TO evals_runtime;

-- Workspaces with an export to build (or one whose worker stopped); IDs only.
CREATE FUNCTION evals.workspace_export_due_workspaces()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT DISTINCT org_id FROM evals.workspace_export
  WHERE status = 'queued' OR (status = 'running' AND updated_at < now() - interval '15 minutes')
  LIMIT 50
$$;
REVOKE ALL ON FUNCTION evals.workspace_export_due_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.workspace_export_due_workspaces() TO evals_runtime;

-- Expired exports join the lifecycle pass, whatever the feature flag says.
CREATE OR REPLACE FUNCTION evals.lifecycle_due_workspaces()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
  SELECT DISTINCT org_id FROM (
    SELECT org_id FROM evals.artifact WHERE state<>'deleted' AND expires_at<=now()
    UNION SELECT org_id FROM evals.retention_job WHERE status='pending' AND not_before<=now()
    UNION SELECT org_id FROM evals.deletion_request WHERE status IN ('requested','processing') AND not_before<=now()
    UNION SELECT org_id FROM evals.workspace_export WHERE object_key IS NOT NULL AND object_deleted_at IS NULL AND expires_at<=now()
  ) due LIMIT 200
$$;

COMMIT;
