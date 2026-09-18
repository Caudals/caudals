-- WP-08: lifecycle controls and independently replayable recovery policy ledger.
BEGIN;
ALTER TABLE evals.artifact DROP CONSTRAINT IF EXISTS artifact_state_check;
ALTER TABLE evals.artifact ADD CONSTRAINT artifact_state_check CHECK(state IN ('pending','ready','deleted'));
GRANT UPDATE(state,expires_at) ON evals.artifact TO evals_runtime;
CREATE OR REPLACE FUNCTION evals.guard_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='deleted' AND OLD.state IN ('pending','ready') AND (to_jsonb(NEW)-ARRAY['state','expires_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','expires_at']) THEN RETURN NEW; END IF;
 IF OLD.state<>'pending' OR NEW.state<>'ready' OR (to_jsonb(NEW)-ARRAY['state','object_key','expires_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','object_key','expires_at']) THEN RAISE EXCEPTION 'immutable artifact metadata' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TABLE evals.retention_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 object_type text NOT NULL, object_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('expire','redact','delete')),
 not_before timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
 reason_code text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(org_id,id), UNIQUE(org_id,object_type,object_id,action)
);
CREATE INDEX retention_due ON evals.retention_job(status,not_before,id);
CREATE TABLE evals.recovery_control_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id uuid NOT NULL REFERENCES evals.workspace(id),
 action text NOT NULL CHECK(action IN ('share_revoked','credential_revoked','workspace_deleted','artifact_deleted','report_withdrawn')),
 subject_type text NOT NULL, subject_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), actor_id text NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'), UNIQUE(org_id,action,subject_type,subject_id,occurred_at)
);
CREATE TABLE evals.recovery_rehearsal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 snapshot_at timestamptz NOT NULL, workers_paused boolean NOT NULL DEFAULT true, ledger_replayed_through bigint,
 records_verified integer NOT NULL DEFAULT 0, artifacts_verified integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','passed','failed')), evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE evals.retention_job ENABLE ROW LEVEL SECURITY; ALTER TABLE evals.retention_job FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.retention_job USING(org_id=nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK(org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
ALTER TABLE evals.recovery_control_event ENABLE ROW LEVEL SECURITY; ALTER TABLE evals.recovery_control_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.recovery_control_event USING(org_id=nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK(org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals.retention_job,evals.recovery_control_event TO evals_runtime;
GRANT UPDATE(status,reason_code,completed_at) ON evals.retention_job TO evals_runtime;
CREATE TRIGGER recovery_event_immutable BEFORE UPDATE OR DELETE ON evals.recovery_control_event FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
COMMIT;
