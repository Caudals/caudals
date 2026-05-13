-- Section 27 build cost envelopes and sub-budget controls.

ALTER TABLE build
  ADD COLUMN IF NOT EXISTS llm_budget_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS llm_used_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_api_budget_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_api_used_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_soft_limit_bps integer NOT NULL DEFAULT 8000,
  ADD COLUMN IF NOT EXISTS cost_hard_limit_bps integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS cost_envelope_state text NOT NULL DEFAULT 'within_budget',
  ADD COLUMN IF NOT EXISTS cost_override_reason text,
  ADD COLUMN IF NOT EXISTS cost_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS margin_retrospective_required boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'build_cost_envelope_nonnegative_check'
  ) THEN
    ALTER TABLE build
      ADD CONSTRAINT build_cost_envelope_nonnegative_check CHECK (
        cost_budget_cents >= 0 AND
        cost_used_cents >= 0 AND
        llm_budget_cents >= 0 AND
        llm_used_cents >= 0 AND
        external_api_budget_cents >= 0 AND
        external_api_used_cents >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'build_cost_envelope_limits_check'
  ) THEN
    ALTER TABLE build
      ADD CONSTRAINT build_cost_envelope_limits_check CHECK (
        cost_soft_limit_bps BETWEEN 1 AND 10000 AND
        cost_hard_limit_bps = 10000 AND
        cost_soft_limit_bps <= cost_hard_limit_bps
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'build_cost_envelope_state_check'
  ) THEN
    ALTER TABLE build
      ADD CONSTRAINT build_cost_envelope_state_check CHECK (
        cost_envelope_state IN (
          'unbudgeted',
          'within_budget',
          'soft_alert',
          'hard_limit',
          'override_approved'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cost_entry_amount_nonnegative_check'
  ) THEN
    ALTER TABLE cost_entry
      ADD CONSTRAINT cost_entry_amount_nonnegative_check CHECK (amount_cents >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cost_entry_build_idx ON cost_entry (build_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alert_open_build_idx
  ON alert (org_id, target_type, target_id, title)
  WHERE deleted_at IS NULL AND state <> 'resolved';

CREATE OR REPLACE FUNCTION app_private.cost_entry_bucket(category text, metadata jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(metadata ->> 'costBucket', '')) IN (
      'compute', 'storage', 'network', 'llm', 'external_api', 'other'
    )
      THEN lower(metadata ->> 'costBucket')
    WHEN lower(COALESCE(category, '')) LIKE '%llm%'
      OR lower(COALESCE(category, '')) LIKE '%openai%'
      OR lower(COALESCE(category, '')) LIKE '%embedding%'
      OR lower(COALESCE(category, '')) LIKE '%prompt%'
      THEN 'llm'
    WHEN lower(COALESCE(category, '')) LIKE '%api%'
      OR lower(COALESCE(category, '')) LIKE '%geocod%'
      OR lower(COALESCE(category, '')) LIKE '%third_party%'
      OR lower(COALESCE(category, '')) LIKE '%vendor%'
      THEN 'external_api'
    WHEN lower(COALESCE(category, '')) LIKE '%storage%'
      OR lower(COALESCE(category, '')) LIKE '%s3%'
      OR lower(COALESCE(category, '')) LIKE '%spaces%'
      THEN 'storage'
    WHEN lower(COALESCE(category, '')) LIKE '%network%'
      OR lower(COALESCE(category, '')) LIKE '%egress%'
      THEN 'network'
    WHEN lower(COALESCE(category, '')) LIKE '%compute%'
      OR lower(COALESCE(category, '')) LIKE '%gpu%'
      OR lower(COALESCE(category, '')) LIKE '%cpu%'
      THEN 'compute'
    ELSE 'other'
  END
$$;

CREATE OR REPLACE FUNCTION app_private.open_cost_envelope_alert(
  alert_org_id text,
  alert_build_id text,
  alert_actor_id text,
  alert_severity text,
  alert_title text,
  audit_action text,
  audit_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  new_alert_id text;
  new_audit_id text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM alert
    WHERE org_id = alert_org_id
      AND target_type = 'build'
      AND target_id = alert_build_id
      AND title = alert_title
      AND state <> 'resolved'
      AND deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  new_alert_id := 'al_' || upper(replace(gen_random_uuid()::text, '-', ''));
  new_audit_id := 'ae_' || upper(replace(gen_random_uuid()::text, '-', ''));

  INSERT INTO alert (
    id, org_id, severity, title, target_type, target_id, state, created_by
  )
  VALUES (
    new_alert_id,
    alert_org_id,
    alert_severity,
    alert_title,
    'build',
    alert_build_id,
    'open',
    alert_actor_id
  );

  INSERT INTO audit_event (
    id, org_id, actor_id, action, target_type, target_id, metadata
  )
  VALUES (
    new_audit_id,
    alert_org_id,
    alert_actor_id,
    audit_action,
    'build',
    alert_build_id,
    COALESCE(audit_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_cost_entry_budget()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_build build%ROWTYPE;
  existing_total bigint;
  existing_llm bigint;
  existing_external bigint;
  projected_total bigint;
  projected_llm bigint;
  projected_external bigint;
  entry_bucket text;
  override_reason text;
BEGIN
  IF NEW.build_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.amount_cents < 0 THEN
    RAISE EXCEPTION 'cost envelope constraint: cost amount must be non-negative';
  END IF;

  SELECT *
  INTO target_build
  FROM build
  WHERE id = NEW.build_id
    AND org_id = NEW.org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cost envelope constraint: build % is not available for this organization', NEW.build_id;
  END IF;

  SELECT
    COALESCE(sum(amount_cents), 0),
    COALESCE(sum(amount_cents) FILTER (
      WHERE app_private.cost_entry_bucket(category, metadata) = 'llm'
    ), 0),
    COALESCE(sum(amount_cents) FILTER (
      WHERE app_private.cost_entry_bucket(category, metadata) = 'external_api'
    ), 0)
  INTO existing_total, existing_llm, existing_external
  FROM cost_entry
  WHERE build_id = NEW.build_id
    AND id <> NEW.id;

  entry_bucket := app_private.cost_entry_bucket(NEW.category, NEW.metadata);
  projected_total := existing_total + NEW.amount_cents;
  projected_llm := existing_llm + CASE WHEN entry_bucket = 'llm' THEN NEW.amount_cents ELSE 0 END;
  projected_external := existing_external + CASE WHEN entry_bucket = 'external_api' THEN NEW.amount_cents ELSE 0 END;
  override_reason := NULLIF(BTRIM(COALESCE(
    NEW.metadata ->> 'budgetOverrideReason',
    NEW.metadata ->> 'overrideReason',
    ''
  )), '');

  IF target_build.cost_budget_cents > 0
    AND projected_total > target_build.cost_budget_cents
    AND override_reason IS NULL
  THEN
    RAISE EXCEPTION
      'cost envelope constraint: build % would exceed approved budget (% > %)',
      NEW.build_id, projected_total, target_build.cost_budget_cents;
  END IF;

  IF target_build.llm_budget_cents > 0
    AND projected_llm > target_build.llm_budget_cents
    AND override_reason IS NULL
  THEN
    RAISE EXCEPTION
      'cost envelope constraint: build % would exceed LLM sub-budget (% > %)',
      NEW.build_id, projected_llm, target_build.llm_budget_cents;
  END IF;

  IF target_build.external_api_budget_cents > 0
    AND projected_external > target_build.external_api_budget_cents
    AND override_reason IS NULL
  THEN
    RAISE EXCEPTION
      'cost envelope constraint: build % would exceed external API sub-budget (% > %)',
      NEW.build_id, projected_external, target_build.external_api_budget_cents;
  END IF;

  IF override_reason IS NOT NULL THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'budgetOverrideReason', override_reason,
      'budgetOverrideApprovedAt', now()
    );
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'costBucket', entry_bucket
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.refresh_build_cost_envelope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_build_id text;
  target_org_id text;
  actor_id text;
  total_amount bigint;
  llm_amount bigint;
  external_amount bigint;
  budget record;
  new_state text;
  override_reason text;
  retrospective_required boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_build_id := OLD.build_id;
    target_org_id := OLD.org_id;
    actor_id := COALESCE(OLD.created_by, app_private.current_operator_id());
  ELSE
    target_build_id := NEW.build_id;
    target_org_id := NEW.org_id;
    actor_id := COALESCE(NEW.created_by, app_private.current_operator_id());
  END IF;

  IF target_build_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(sum(amount_cents), 0),
    COALESCE(sum(amount_cents) FILTER (
      WHERE app_private.cost_entry_bucket(category, metadata) = 'llm'
    ), 0),
    COALESCE(sum(amount_cents) FILTER (
      WHERE app_private.cost_entry_bucket(category, metadata) = 'external_api'
    ), 0),
    NULLIF(BTRIM(max(metadata ->> 'budgetOverrideReason')), '')
  INTO total_amount, llm_amount, external_amount, override_reason
  FROM cost_entry
  WHERE build_id = target_build_id;

  SELECT
    cost_budget_cents,
    llm_budget_cents,
    external_api_budget_cents,
    cost_soft_limit_bps,
    cost_hard_limit_bps
  INTO budget
  FROM build
  WHERE id = target_build_id
    AND org_id = target_org_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  new_state := CASE
    WHEN budget.cost_budget_cents = 0 THEN 'unbudgeted'
    WHEN total_amount * 10000 >= budget.cost_budget_cents * budget.cost_hard_limit_bps
      AND override_reason IS NOT NULL THEN 'override_approved'
    WHEN total_amount * 10000 >= budget.cost_budget_cents * budget.cost_hard_limit_bps
      THEN 'hard_limit'
    WHEN total_amount * 10000 >= budget.cost_budget_cents * budget.cost_soft_limit_bps
      THEN 'soft_alert'
    ELSE 'within_budget'
  END;
  retrospective_required :=
    budget.cost_budget_cents > 0
    AND total_amount * 10000 > budget.cost_budget_cents * 11500;

  UPDATE build
  SET
    cost_used_cents = total_amount,
    llm_used_cents = llm_amount,
    external_api_used_cents = external_amount,
    cost_envelope_state = new_state,
    cost_override_reason = COALESCE(override_reason, cost_override_reason),
    cost_override_at = CASE
      WHEN override_reason IS NOT NULL THEN COALESCE(cost_override_at, now())
      ELSE cost_override_at
    END,
    margin_retrospective_required = retrospective_required,
    updated_at = now()
  WHERE id = target_build_id
    AND org_id = target_org_id
    AND deleted_at IS NULL;

  IF budget.cost_budget_cents > 0
    AND total_amount * 10000 >= budget.cost_budget_cents * budget.cost_soft_limit_bps
  THEN
    PERFORM app_private.open_cost_envelope_alert(
      target_org_id,
      target_build_id,
      actor_id,
      'warning',
      'Build budget soft threshold reached',
      'build_cost_envelope.soft_alert',
      jsonb_build_object(
        'cost_used_cents', total_amount,
        'cost_budget_cents', budget.cost_budget_cents,
        'threshold_bps', budget.cost_soft_limit_bps
      )
    );
  END IF;

  IF new_state = 'override_approved' THEN
    PERFORM app_private.open_cost_envelope_alert(
      target_org_id,
      target_build_id,
      actor_id,
      'critical',
      'Build budget override active',
      'build_cost_envelope.hard_limit_override',
      jsonb_build_object(
        'cost_used_cents', total_amount,
        'cost_budget_cents', budget.cost_budget_cents,
        'override_reason', override_reason
      )
    );
  END IF;

  IF budget.llm_budget_cents > 0 AND llm_amount > budget.llm_budget_cents THEN
    PERFORM app_private.open_cost_envelope_alert(
      target_org_id,
      target_build_id,
      actor_id,
      'critical',
      'LLM sub-budget override active',
      'build_cost_envelope.llm_budget_override',
      jsonb_build_object(
        'llm_used_cents', llm_amount,
        'llm_budget_cents', budget.llm_budget_cents,
        'override_reason', override_reason
      )
    );
  END IF;

  IF budget.external_api_budget_cents > 0
    AND external_amount > budget.external_api_budget_cents
  THEN
    PERFORM app_private.open_cost_envelope_alert(
      target_org_id,
      target_build_id,
      actor_id,
      'critical',
      'External API sub-budget override active',
      'build_cost_envelope.external_api_budget_override',
      jsonb_build_object(
        'external_api_used_cents', external_amount,
        'external_api_budget_cents', budget.external_api_budget_cents,
        'override_reason', override_reason
      )
    );
  END IF;

  IF retrospective_required THEN
    PERFORM app_private.open_cost_envelope_alert(
      target_org_id,
      target_build_id,
      actor_id,
      'warning',
      'Margin retrospective required',
      'build_cost_envelope.margin_retrospective_required',
      jsonb_build_object(
        'cost_used_cents', total_amount,
        'cost_budget_cents', budget.cost_budget_cents,
        'deviation_bps', 11500
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

WITH ledger_totals AS (
  SELECT
    build_id,
    COALESCE(sum(amount_cents), 0) AS ledger_amount
  FROM cost_entry
  WHERE build_id IS NOT NULL
  GROUP BY build_id
),
missing_ledger AS (
  SELECT
    b.id AS build_id,
    b.org_id,
    b.created_by,
    b.cost_used_cents - COALESCE(ledger_totals.ledger_amount, 0) AS missing_amount
  FROM build b
  LEFT JOIN ledger_totals ON ledger_totals.build_id = b.id
  WHERE b.cost_used_cents > COALESCE(ledger_totals.ledger_amount, 0)
)
INSERT INTO cost_entry (
  id, org_id, build_id, category, amount_cents, currency, metadata, created_by
)
SELECT
  'ce_' || upper(replace(gen_random_uuid()::text, '-', '')),
  org_id,
  build_id,
  'budget_baseline',
  missing_amount,
  'USD',
  jsonb_build_object(
    'summary', 'Backfilled from existing build cost usage before cost envelope enforcement.',
    'costBucket', 'other'
  ),
  created_by
FROM missing_ledger
WHERE missing_amount > 0;

DROP TRIGGER IF EXISTS cost_entry_budget_guard ON cost_entry;
CREATE TRIGGER cost_entry_budget_guard
  BEFORE INSERT OR UPDATE ON cost_entry
  FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_cost_entry_budget();

DROP TRIGGER IF EXISTS cost_entry_refresh_build_cost_envelope ON cost_entry;
CREATE TRIGGER cost_entry_refresh_build_cost_envelope
  AFTER INSERT OR UPDATE OR DELETE ON cost_entry
  FOR EACH ROW
  EXECUTE FUNCTION app_private.refresh_build_cost_envelope();

WITH cost_totals AS (
  SELECT
    build_id,
    COALESCE(sum(amount_cents), 0) AS total_amount,
    COALESCE(sum(amount_cents) FILTER (
      WHERE app_private.cost_entry_bucket(category, metadata) = 'llm'
    ), 0) AS llm_amount,
    COALESCE(sum(amount_cents) FILTER (
      WHERE app_private.cost_entry_bucket(category, metadata) = 'external_api'
    ), 0) AS external_amount
  FROM cost_entry
  WHERE build_id IS NOT NULL
  GROUP BY build_id
)
UPDATE build b
SET
  cost_used_cents = COALESCE(cost_totals.total_amount, b.cost_used_cents),
  llm_used_cents = COALESCE(cost_totals.llm_amount, b.llm_used_cents),
  external_api_used_cents = COALESCE(cost_totals.external_amount, b.external_api_used_cents),
  cost_envelope_state = CASE
    WHEN b.cost_budget_cents = 0 THEN 'unbudgeted'
    WHEN COALESCE(cost_totals.total_amount, b.cost_used_cents) * 10000 >= b.cost_budget_cents * b.cost_hard_limit_bps
      THEN 'hard_limit'
    WHEN COALESCE(cost_totals.total_amount, b.cost_used_cents) * 10000 >= b.cost_budget_cents * b.cost_soft_limit_bps
      THEN 'soft_alert'
    ELSE 'within_budget'
  END,
  margin_retrospective_required =
    b.cost_budget_cents > 0 AND
    COALESCE(cost_totals.total_amount, b.cost_used_cents) * 10000 > b.cost_budget_cents * 11500
FROM cost_totals
WHERE b.id = cost_totals.build_id;
