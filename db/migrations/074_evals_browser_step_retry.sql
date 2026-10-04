-- The browser executor retries a missed website reply in a fresh browser and
-- waits out a target's request rate; both defer the step with not_before.
-- Forward repair: older browser images never write the column; keep the grant.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_browser') THEN
    GRANT UPDATE(not_before) ON evals.workflow_step TO evals_browser;
  END IF;
END $$;
COMMIT;
