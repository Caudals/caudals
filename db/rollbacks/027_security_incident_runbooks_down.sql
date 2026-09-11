-- Rollback for db/migrations/027_security_incident_runbooks.sql.
--
-- One transaction, so the guard still holds when psql runs without
-- ON_ERROR_STOP.

BEGIN;

DO $$
DECLARE
  active_rows bigint := 0;
BEGIN
  -- Dynamic SQL: a static reference would fail to plan once the table is gone.
  IF to_regclass('public.escalation_case') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM escalation_case
      WHERE runbook_key IN ('R-11', 'R-12', 'R-13')
        AND deleted_at IS NULL
    $sql$
      INTO active_rows;
  END IF;

  IF active_rows > 0 THEN
    RAISE EXCEPTION
      'Rollback blocked: active security escalation cases reference R-11..R-13.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.escalation_runbook_for_kind(kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE kind
    WHEN 'privacy_incident' THEN 'R-06'
    WHEN 'provenance_dispute' THEN 'R-01'
    WHEN 'supplier_delivery_failure' THEN 'R-05'
    WHEN 'buyer_dispute' THEN 'R-03'
    WHEN 'security_event' THEN 'R-08'
    ELSE 'R-08'
  END
$$;

DELETE FROM runbook
WHERE key IN ('R-11', 'R-12', 'R-13');

COMMIT;
