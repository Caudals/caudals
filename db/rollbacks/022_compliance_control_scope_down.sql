-- One transaction, so the guard still holds when psql runs without
-- ON_ERROR_STOP.

BEGIN;

DO $$
DECLARE
  active_rows bigint := 0;
BEGIN
  -- Dynamic SQL: a static reference would fail to plan once the table is gone.
  IF to_regclass('public.compliance_control_scope') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM compliance_control_scope WHERE deleted_at IS NULL'
      INTO active_rows;
  END IF;

  IF active_rows > 0 THEN
    RAISE EXCEPTION 'Cannot roll back compliance control scopes while active rows exist';
  END IF;
END;
$$;

DROP TABLE IF EXISTS compliance_control_scope;

COMMIT;
