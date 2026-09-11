-- Rollback for db/migrations/030_evaluation_requests.sql.
--
-- Deploy the pre-030 /contact intake first: the current
-- lib/public/evaluation-request-intake.ts inserts into evaluation_request.
-- One transaction, so the guard still holds when psql runs without
-- ON_ERROR_STOP. Dropping the table also drops its trigger, policy and indexes.

BEGIN;

DO $$
DECLARE
  active_rows bigint := 0;
BEGIN
  -- Dynamic SQL: a static reference would fail to plan once the table is gone.
  IF to_regclass('public.evaluation_request') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM evaluation_request WHERE deleted_at IS NULL'
      INTO active_rows;
  END IF;

  IF active_rows > 0 THEN
    RAISE EXCEPTION
      'Rollback blocked: % active evaluation_request rows exist. Export them, or soft-delete them after export, before dropping evaluation requests.',
      active_rows;
  END IF;
END;
$$;

DROP TABLE IF EXISTS evaluation_request;

COMMIT;
