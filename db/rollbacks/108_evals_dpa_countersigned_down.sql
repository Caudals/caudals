-- Rollback for db/migrations/108_evals_dpa_countersigned.sql.
--
-- Countersigned DPA records are contract evidence, so this refuses while any
-- exist (live or removed): switch DATA_CONTROLS_ENABLED off and repair forward
-- instead. It must run as a role that bypasses row-level security, or the
-- count below could not see every row. One transaction, so the guard holds
-- even when psql runs without ON_ERROR_STOP.
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
  IF to_regclass('evals.dpa_countersigned') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM evals.dpa_countersigned' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % countersigned DPA records exist. Switch DATA_CONTROLS_ENABLED off and repair forward instead.', remaining;
  END IF;
END $$;

DROP FUNCTION IF EXISTS evals.remove_dpa_countersigned(uuid, uuid, text);
DROP FUNCTION IF EXISTS evals.attach_dpa_countersigned(uuid, uuid, text, text, integer, text);
DROP TABLE IF EXISTS evals.dpa_countersigned;
DROP FUNCTION IF EXISTS evals.guard_dpa_countersigned();

COMMIT;
