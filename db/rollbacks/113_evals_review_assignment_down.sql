-- Rollback for db/migrations/113_evals_review_assignment.sql.
--
-- Refuses while any review assignment exists: the rows are the record of who
-- held which queue item. Hide the "Assign to me" control by redeploying a
-- compatible image and repair forward instead. It must run as a role that
-- bypasses row-level security, or the count below could not see every row.
-- One transaction, so the guard holds even when psql runs without
-- ON_ERROR_STOP.
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
  IF to_regclass('evals.review_assignment') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM evals.review_assignment' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % review assignments exist. Repair forward instead.', remaining;
  END IF;
END $$;

DROP FUNCTION IF EXISTS evals.review_assignments(uuid);
DROP FUNCTION IF EXISTS evals.review_assignment_change(uuid, text, uuid, text, boolean);
DROP FUNCTION IF EXISTS evals.review_assignment_staff(uuid);
DROP TABLE IF EXISTS evals.review_assignment;
DELETE FROM public.evals_migration_history WHERE name = '113_evals_review_assignment.sql';

COMMIT;
