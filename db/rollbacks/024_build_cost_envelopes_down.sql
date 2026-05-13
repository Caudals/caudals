-- Rollback for db/migrations/024_build_cost_envelopes.sql.

DROP TRIGGER IF EXISTS cost_entry_refresh_build_cost_envelope ON cost_entry;
DROP TRIGGER IF EXISTS cost_entry_budget_guard ON cost_entry;

DROP FUNCTION IF EXISTS app_private.refresh_build_cost_envelope();
DROP FUNCTION IF EXISTS app_private.enforce_cost_entry_budget();
DROP FUNCTION IF EXISTS app_private.open_cost_envelope_alert(
  text, text, text, text, text, text, jsonb
);
DROP FUNCTION IF EXISTS app_private.cost_entry_bucket(text, jsonb);

DROP INDEX IF EXISTS alert_open_build_idx;
DROP INDEX IF EXISTS cost_entry_build_idx;

ALTER TABLE cost_entry
  DROP CONSTRAINT IF EXISTS cost_entry_amount_nonnegative_check;

ALTER TABLE build
  DROP CONSTRAINT IF EXISTS build_cost_envelope_state_check,
  DROP CONSTRAINT IF EXISTS build_cost_envelope_limits_check,
  DROP CONSTRAINT IF EXISTS build_cost_envelope_nonnegative_check;

ALTER TABLE build
  DROP COLUMN IF EXISTS margin_retrospective_required,
  DROP COLUMN IF EXISTS cost_override_at,
  DROP COLUMN IF EXISTS cost_override_reason,
  DROP COLUMN IF EXISTS cost_envelope_state,
  DROP COLUMN IF EXISTS cost_hard_limit_bps,
  DROP COLUMN IF EXISTS cost_soft_limit_bps,
  DROP COLUMN IF EXISTS external_api_used_cents,
  DROP COLUMN IF EXISTS external_api_budget_cents,
  DROP COLUMN IF EXISTS llm_used_cents,
  DROP COLUMN IF EXISTS llm_budget_cents;
