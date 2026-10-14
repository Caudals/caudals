-- Rollback for db/migrations/106_evals_report_questions.sql.
--
-- Drops the L-36 report-question table and its functions. It refuses while
-- any question exists (asked, refused or erased): the rows carry the credit
-- ledger references of their engine calls. Switch REPORT_QUESTIONS_ENABLED
-- off and repair forward instead. It must run as a role that bypasses
-- row-level security, or the count could not see every row. One
-- transaction, so the guard holds even without ON_ERROR_STOP.
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
  IF to_regclass('evals.report_question') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM evals.report_question' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % report questions exist. Switch REPORT_QUESTIONS_ENABLED off and repair forward instead.', remaining;
  END IF;
END $$;

DROP FUNCTION IF EXISTS evals.delete_report_question(uuid);
DROP TABLE IF EXISTS evals.report_question;
DROP FUNCTION IF EXISTS evals.report_question_no_delete();
DROP FUNCTION IF EXISTS evals.report_question_guard();
DROP FUNCTION IF EXISTS evals.report_question_asker();
DROP FUNCTION IF EXISTS evals.report_question_reader();

COMMIT;
