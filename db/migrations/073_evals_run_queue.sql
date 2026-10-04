-- Queue admission reads immutable workspace allowances under tenant RLS.
-- Forward repair: deploy the previous code while retaining the queue timestamp and read grants.
BEGIN;
ALTER TABLE evals.run ADD COLUMN queued_at timestamptz NOT NULL DEFAULT now();
UPDATE evals.run SET queued_at=created_at WHERE status='queued' OR (status='paused' AND reason_code='runner_wait');
CREATE INDEX run_queue_waiting ON evals.run(org_id,queued_at,id) WHERE status='queued';
GRANT UPDATE(queued_at) ON evals.run TO evals_runtime;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['evals_worker','evals_browser'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('GRANT SELECT ON evals.workspace_entitlement,evals.runner_job TO %I',role_name);
      EXECUTE format('GRANT UPDATE(reason_code) ON evals.run TO %I',role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
