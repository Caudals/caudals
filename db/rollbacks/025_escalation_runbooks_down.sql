-- Rollback for db/migrations/025_escalation_runbooks.sql.

DO $$
BEGIN
  IF to_regclass('public.escalation_case') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM escalation_case
    WHERE deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Rollback blocked: active escalation_case rows exist. Resolve, archive, or export them before dropping escalation runbooks.';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS escalation_case_touch_updated_at ON escalation_case;
DROP TRIGGER IF EXISTS escalation_case_open_alert ON escalation_case;
DROP TRIGGER IF EXISTS escalation_case_prepare ON escalation_case;
DROP TRIGGER IF EXISTS runbook_touch_updated_at ON runbook;

DROP POLICY IF EXISTS escalation_case_operator_scope ON escalation_case;
DROP POLICY IF EXISTS runbook_operator_read ON runbook;

DROP FUNCTION IF EXISTS app_private.open_escalation_case_alert();
DROP FUNCTION IF EXISTS app_private.prepare_escalation_case();
DROP FUNCTION IF EXISTS app_private.escalation_sla_interval(text, text);
DROP FUNCTION IF EXISTS app_private.escalation_team_for_kind(text);
DROP FUNCTION IF EXISTS app_private.escalation_runbook_for_kind(text);

DROP INDEX IF EXISTS alert_open_escalation_case_idx;
DROP INDEX IF EXISTS escalation_case_runbook_idx;
DROP INDEX IF EXISTS escalation_case_org_state_idx;

DROP TABLE IF EXISTS escalation_case;
DROP TABLE IF EXISTS runbook;
