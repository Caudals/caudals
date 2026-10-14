-- Rollback for db/migrations/105_evals_retention_setting.sql.
--
-- Removes the L-32 retention setting, the observation purge and the workspace
-- export job. It refuses once any observation has been purged (the original
-- content is gone and the immutability trigger could not describe those rows
-- again), while any export row exists (stored files and the owner's request
-- history), or while any retention setting is recorded (owner decisions).
-- Switch DATA_CONTROLS_ENABLED off and repair forward instead. It must run as
-- a role that bypasses row-level security, or the counts could not see every
-- row. One transaction, so the guard holds even without ON_ERROR_STOP.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
  remaining bigint := 0;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  IF to_regclass('evals.workspace_export') IS NOT NULL THEN
    EXECUTE 'SELECT (SELECT count(*) FROM evals.observation WHERE purged_at IS NOT NULL)
      + (SELECT count(*) FROM evals.workspace_export)
      + (SELECT count(*) FROM evals.workspace_retention)
      + (SELECT count(*) FROM evals.recovery_control_event WHERE action IN (''observation_purged'',''export_deleted''))
      + (SELECT count(*) FROM evals.retention_job WHERE object_type IN (''observation_run'',''workspace_export''))' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % purged observations, exports, retention settings or their retention records exist. Switch DATA_CONTROLS_ENABLED off and repair forward instead.', remaining;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION evals.lifecycle_due_workspaces()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
  SELECT DISTINCT org_id FROM (
    SELECT org_id FROM evals.artifact WHERE state<>'deleted' AND expires_at<=now()
    UNION SELECT org_id FROM evals.retention_job WHERE status='pending' AND not_before<=now()
    UNION SELECT org_id FROM evals.deletion_request WHERE status IN ('requested','processing') AND not_before<=now()
  ) due LIMIT 200
$$;
DROP FUNCTION IF EXISTS evals.workspace_export_due_workspaces();
DROP TABLE IF EXISTS evals.workspace_export;

DROP FUNCTION IF EXISTS evals.purge_retained_observations(uuid, uuid, integer);
ALTER TABLE evals.recovery_control_event DROP CONSTRAINT IF EXISTS recovery_control_event_action_check;
ALTER TABLE evals.recovery_control_event ADD CONSTRAINT recovery_control_event_action_check
  CHECK (action IN ('share_revoked','credential_revoked','workspace_deleted','artifact_deleted','report_withdrawn'));
DROP FUNCTION IF EXISTS evals.observation_retention_due_workspaces();
DROP FUNCTION IF EXISTS evals.observation_retention_preview(uuid, integer);
DROP FUNCTION IF EXISTS evals.observation_retention_pinned(uuid, uuid, uuid);

DROP TRIGGER IF EXISTS observation_immutable ON evals.observation;
CREATE TRIGGER observation_immutable BEFORE UPDATE OR DELETE ON evals.observation
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
DROP FUNCTION IF EXISTS evals.guard_observation();
DROP FUNCTION IF EXISTS evals.purged_observation_document(jsonb, timestamptz);
DROP INDEX IF EXISTS evals.report_revision_run;
DROP INDEX IF EXISTS evals.observation_retention_due;
ALTER TABLE evals.observation DROP COLUMN IF EXISTS purged_at;

DROP FUNCTION IF EXISTS evals.set_observation_retention(uuid, integer);
DROP TABLE IF EXISTS evals.workspace_retention;

COMMIT;
