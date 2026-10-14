-- Launch L-32, follow-up of L-30 (spec v2 P-42): Caudals operations attach a
-- countersigned copy of the DPA (a PDF) to a workspace's DPA acceptance, for
-- managed customers who sign on paper.
--
-- evals.dpa_countersigned links one stored PDF to one acceptance record of
-- evals.terms_acceptance (document 'dpa', migration 081). Rows are written
-- only through two SECURITY DEFINER functions that require a platform
-- operator or administrator (evals.is_operator()) and write an audit event:
-- evals.attach_dpa_countersigned() and evals.remove_dpa_countersigned(). A
-- row is never deleted or changed except by that removal, which keeps who
-- removed it, when and why. Reading (and so downloading) is limited by RLS to
-- the workspace's owners and to platform operators and administrators;
-- editors, viewers and other workspaces see nothing.
--
-- Forward repair: purely additive. The rollback refuses while any row exists,
-- because the rows are contract records.
BEGIN;

CREATE TABLE evals.dpa_countersigned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  acceptance_id uuid NOT NULL REFERENCES evals.terms_acceptance(id),
  version text NOT NULL,
  object_key text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by text,
  removal_reason text CHECK (removal_reason IS NULL OR length(removal_reason) BETWEEN 3 AND 500),
  UNIQUE (org_id, id),
  CONSTRAINT dpa_countersigned_removal CHECK ((removed_at IS NULL) = (removed_by IS NULL) AND (removed_at IS NULL) = (removal_reason IS NULL))
);
-- One live copy per acceptance; a replaced copy is removed first.
CREATE UNIQUE INDEX dpa_countersigned_live ON evals.dpa_countersigned (acceptance_id) WHERE removed_at IS NULL;
CREATE INDEX dpa_countersigned_org ON evals.dpa_countersigned (org_id, uploaded_at DESC);

ALTER TABLE evals.dpa_countersigned ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.dpa_countersigned FORCE ROW LEVEL SECURITY;
CREATE POLICY dpa_countersigned_read ON evals.dpa_countersigned FOR SELECT USING (
  org_id = evals.org_id() AND (
    evals.is_operator()
    OR EXISTS (SELECT 1 FROM evals.membership m
               WHERE m.org_id = dpa_countersigned.org_id AND m.user_id = evals.actor_id() AND m.role = 'owner'))
);
REVOKE ALL ON evals.dpa_countersigned FROM PUBLIC;
GRANT SELECT ON evals.dpa_countersigned TO evals_runtime;

-- The removal is the only change a row accepts; nothing is ever deleted.
CREATE FUNCTION evals.guard_dpa_countersigned() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, evals AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['removed_at', 'removed_by', 'removal_reason'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['removed_at', 'removed_by', 'removal_reason']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'immutable countersigned DPA record' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER dpa_countersigned_immutable BEFORE UPDATE OR DELETE ON evals.dpa_countersigned
  FOR EACH ROW EXECUTE FUNCTION evals.guard_dpa_countersigned();
CREATE TRIGGER dpa_countersigned_no_truncate BEFORE TRUNCATE ON evals.dpa_countersigned
  FOR EACH STATEMENT EXECUTE FUNCTION evals.guard_dpa_countersigned();

CREATE FUNCTION evals.attach_dpa_countersigned(
  p_org_id uuid, p_acceptance_id uuid, p_object_key text, p_sha256 text, p_byte_size integer, p_file_name text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  accepted_version text;
  attached uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'OPERATOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_org_id IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.workspace w WHERE w.id = p_org_id AND w.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT t.version INTO accepted_version FROM evals.terms_acceptance t
    WHERE t.id = p_acceptance_id AND t.org_id = p_org_id AND t.document = 'dpa';
  IF accepted_version IS NULL THEN RAISE EXCEPTION 'ACCEPTANCE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM evals.dpa_countersigned c WHERE c.acceptance_id = p_acceptance_id AND c.removed_at IS NULL) THEN
    RAISE EXCEPTION 'ALREADY_ATTACHED' USING ERRCODE = '23505';
  END IF;
  INSERT INTO evals.dpa_countersigned (org_id, acceptance_id, version, object_key, sha256, byte_size, file_name, uploaded_by)
    VALUES (p_org_id, p_acceptance_id, accepted_version, p_object_key, p_sha256, p_byte_size, p_file_name, actor)
    RETURNING id INTO attached;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org_id, actor, 'legal.dpa_countersigned_attached', attached::text,
      jsonb_build_object('acceptance_id', p_acceptance_id, 'version', accepted_version, 'sha256', p_sha256,
        'byte_size', p_byte_size, 'file_name', p_file_name));
  RETURN attached;
END $$;
REVOKE ALL ON FUNCTION evals.attach_dpa_countersigned(uuid, uuid, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.attach_dpa_countersigned(uuid, uuid, text, text, integer, text) TO evals_runtime;

-- Marks a live copy removed and returns its storage key, so the caller can
-- delete the stored file. Idempotent: an already removed copy answers NULL.
CREATE FUNCTION evals.remove_dpa_countersigned(p_org_id uuid, p_id uuid, p_reason text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  removed evals.dpa_countersigned%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'OPERATOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_org_id IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.dpa_countersigned c WHERE c.org_id = p_org_id AND c.id = p_id) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  UPDATE evals.dpa_countersigned c SET removed_at = now(), removed_by = actor, removal_reason = trim(p_reason)
    WHERE c.org_id = p_org_id AND c.id = p_id AND c.removed_at IS NULL
    RETURNING c.* INTO removed;
  IF removed.id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org_id, actor, 'legal.dpa_countersigned_removed', removed.id::text,
      jsonb_build_object('acceptance_id', removed.acceptance_id, 'version', removed.version, 'sha256', removed.sha256,
        'reason', removed.removal_reason));
  RETURN removed.object_key;
END $$;
REVOKE ALL ON FUNCTION evals.remove_dpa_countersigned(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.remove_dpa_countersigned(uuid, uuid, text) TO evals_runtime;

COMMIT;
