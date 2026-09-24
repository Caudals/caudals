-- The browser worker timestamps an attempt when its reserved ledger row is dispatched.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_browser') THEN
    GRANT UPDATE (dispatched_at) ON evals.target_attempt TO evals_browser;
  END IF;
END $$;
