-- One transaction, so the guard still holds when psql runs without
-- ON_ERROR_STOP.

BEGIN;

DO $$
DECLARE
  active_rows bigint := 0;
BEGIN
  -- Dynamic SQL: a static reference would fail to plan once the table is gone.
  IF to_regclass('public.release_documentation_bundle') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM release_documentation_bundle WHERE deleted_at IS NULL'
      INTO active_rows;
  END IF;

  IF active_rows > 0 THEN
    RAISE EXCEPTION 'Cannot roll back release documentation bundles while active rows exist';
  END IF;
END;
$$;

DROP TABLE IF EXISTS release_documentation_bundle;

COMMIT;
