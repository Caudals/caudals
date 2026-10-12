-- Rollback for db/migrations/081_evals_terms_acceptance.sql.
--
-- Acceptance records are legal evidence, so this refuses while any exist:
-- switch SIGNUP_TERMS_REQUIRED off, redeploy a compatible image and repair
-- forward instead. It must run as a role that bypasses row-level security, or
-- the count below could not see every row. One transaction, so the guard
-- holds even when psql runs without ON_ERROR_STOP.
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
  -- Dynamic SQL: a static reference would fail to plan once the table is gone.
  IF to_regclass('evals.terms_acceptance') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM evals.terms_acceptance' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % terms acceptance records exist. They are evidence; repair forward instead.', remaining;
  END IF;
END $$;

DROP FUNCTION IF EXISTS evals.record_terms_acceptance(uuid, text, text, text, text, text);
DROP TABLE IF EXISTS evals.terms_acceptance;
DROP FUNCTION IF EXISTS evals.terms_acceptance_immutable();
DELETE FROM public.evals_migration_history WHERE name = '081_evals_terms_acceptance.sql';

COMMIT;
