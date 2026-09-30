-- A browser execution failure must invalidate readiness even when a legacy
-- validated recipe has no connection_check on its derived target revision.
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_browser') THEN
  GRANT INSERT ON evals.connection_check TO evals_browser;
 END IF;
END $$;
COMMIT;
