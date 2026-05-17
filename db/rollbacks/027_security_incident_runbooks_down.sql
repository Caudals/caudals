-- Rollback for db/migrations/027_security_incident_runbooks.sql.

DO $$
BEGIN
  IF to_regclass('public.escalation_case') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM escalation_case
    WHERE runbook_key IN ('R-11', 'R-12', 'R-13')
      AND deleted_at IS NULL
  ) THEN
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
