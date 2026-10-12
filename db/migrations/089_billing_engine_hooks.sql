-- Engine hooks for the credit ledger (launch spec v2 §6.1, §6.3, §6.8,
-- §6.10, §6.18; G8; package L-11).
--
-- 1. Price-book snapshot. Every run and generation job freezes the price-book
--    revision in effect when it is created, next to its model routes
--    (migration 078), so a running or scheduled run never changes price.
-- 2. Pause reasons. credits_exhausted ("Paused — add credits to continue")
--    and cap_reached join the reason codes a step, workflow, run or
--    generation job can carry. Reason codes stay free text; the catalogue is
--    recorded on the columns.
-- 3. Pricing context. billing.engine_pricing and billing.action_pricing give
--    the worker roles, in one call, the workspace's billing mode and balance,
--    the run the work belongs to, the frozen revision and the rate to apply.
-- 4. Shadow ledger. With BILLING_ENFORCE=shadow the engine records what it
--    would hold, capture, release and charge in billing.shadow_entry instead
--    of moving credits. Shadow functions never lock the credit account, never
--    touch a balance and never raise for a short balance (would_block records
--    it); their lock waits are bounded. The daily diff report compares them
--    with budget_reservation and the recorded usage (billing.shadow_report).
-- 5. Run refunds. billing.run_refund_candidates lists failed runs that still
--    carry charges, for the scheduler's reconciler (key run-refund:<run_id>).
-- 6. Monthly window for the workspace euro budget (G8). period_start and
--    period_base turn the lifetime `settled` total into a monthly window:
--    reserve() and settle() roll the window at the first UTC month boundary
--    they see, and the ceiling applies to settled − period_base.
--
-- Forward repair: additive only. The rollback refuses once a run or job has
-- frozen a revision or a shadow entry or report exists.
BEGIN;
-- Short, rare locks on hot tables (runs, jobs, budgets): fail fast rather
-- than queue the workers behind a long transaction.
SET LOCAL lock_timeout = '10s';

/* ------------------------------------------------- price-book snapshot --- */

ALTER TABLE evals.run ADD COLUMN price_book_revision_id uuid REFERENCES billing.price_book_revision(id);
ALTER TABLE evals.generation_job ADD COLUMN price_book_revision_id uuid REFERENCES billing.price_book_revision(id);

-- Frozen on creation, like model_routes: the revision in effect when the job
-- is created. Nobody chooses it and nothing changes it afterwards. Rows from
-- before this migration stay NULL; the engine prices them at the revision in
-- effect when they were created.
CREATE FUNCTION evals.freeze_price_book() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.price_book_revision_id IS DISTINCT FROM OLD.price_book_revision_id THEN
      RAISE EXCEPTION 'immutable job price book' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  NEW.price_book_revision_id := (billing.price_book_at(now())).id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION evals.freeze_price_book() FROM PUBLIC;
CREATE TRIGGER frozen_price_book BEFORE INSERT OR UPDATE OF price_book_revision_id ON evals.run
  FOR EACH ROW EXECUTE FUNCTION evals.freeze_price_book();
CREATE TRIGGER frozen_price_book BEFORE INSERT OR UPDATE OF price_book_revision_id ON evals.generation_job
  FOR EACH ROW EXECUTE FUNCTION evals.freeze_price_book();

/* -------------------------------------------------------- pause reasons --- */

COMMENT ON COLUMN evals.run.reason_code IS
  'Why the run waits or stopped. Billing (L-11): credits_exhausted = paused until credits are added (resume re-queues); cap_reached = a spending cap was reached.';
COMMENT ON COLUMN evals.execution_workflow.reason_code IS
  'Why the workflow is paused. Billing (L-11): credits_exhausted, cap_reached.';
COMMENT ON COLUMN evals.workflow_step.reason_code IS
  'Why the step waits, failed or paused. Billing (L-11): credits_exhausted, cap_reached.';
COMMENT ON COLUMN evals.generation_job.reason_code IS
  'Why the job paused or failed. Billing (L-11): credits_exhausted, cap_reached.';

/* ----------------------------------------- monthly workspace budget (G8) --- */

ALTER TABLE evals.execution_budget
  ADD COLUMN period_start timestamptz,
  ADD COLUMN period_base numeric(24,9) NOT NULL DEFAULT 0;
-- The current window started at the first instant of period_start's UTC
-- month; spend in the window is settled − period_base (settled stays the
-- lifetime total). Run budgets keep no window.
ALTER TABLE evals.execution_budget ADD CONSTRAINT execution_budget_period CHECK (
  period_base >= 0 AND period_base <= settled AND (kind = 'workspace' OR (period_start IS NULL AND period_base = 0)));
-- Backfill: the window opens at the current UTC month with this month's
-- settled cost; everything before it is the base.
UPDATE evals.execution_budget b SET
  period_start = date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
  period_base = greatest(b.settled - coalesce((
    SELECT sum(ce.amount) FROM evals.execution_cost_entry ce
    JOIN evals.budget_reservation r ON (r.org_id, r.id) = (ce.org_id, ce.reservation_id)
    WHERE r.org_id = b.org_id AND r.workspace_budget_id = b.id
      AND ce.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0), 0)
WHERE b.kind = 'workspace';

/* ---------------------------------------------------- pricing context --- */

-- The workspace's billing mode and balance (a snapshot, never locked), the
-- run the work belongs to and the price-book revision that prices it: the
-- given one, else the run's or generation job's frozen revision, else the
-- revision in effect when that run or job was created, else now.
CREATE FUNCTION billing._pricing_context(p_org_id uuid, p_run_id uuid, p_generation_job_id uuid, p_judge_job_id uuid,
  p_narrative_job_id uuid, p_revision_id uuid,
  OUT billing_mode text, OUT available_ucr bigint, OUT run_id uuid, OUT price_book_revision_id uuid)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE candidate uuid; run_rev uuid; run_at timestamptz; job_rev uuid; job_at timestamptz;
BEGIN
  SELECT a.billing_mode, a.available_ucr INTO billing_mode, available_ucr FROM billing.credit_account a WHERE a.org_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_MISSING'; END IF;
  -- Judge and report-narrative passes name their run; a run's own workflow uses the run id.
  IF p_judge_job_id IS NOT NULL THEN
    SELECT j.run_id INTO candidate FROM evals.judge_job j WHERE j.org_id = p_org_id AND j.id = p_judge_job_id;
  ELSIF p_narrative_job_id IS NOT NULL THEN
    SELECT rr.run_id INTO candidate FROM evals.report_narrative_job n
      JOIN evals.report_revision rr ON (rr.org_id, rr.id) = (n.org_id, n.report_revision_id)
      WHERE n.org_id = p_org_id AND n.id = p_narrative_job_id;
  END IF;
  candidate := coalesce(candidate, p_run_id);
  IF candidate IS NOT NULL THEN
    SELECT r.id, r.price_book_revision_id, r.created_at INTO run_id, run_rev, run_at
    FROM evals.run r WHERE r.org_id = p_org_id AND r.id = candidate;
  END IF;
  IF p_generation_job_id IS NOT NULL THEN
    SELECT g.price_book_revision_id, g.created_at INTO job_rev, job_at
    FROM evals.generation_job g WHERE g.org_id = p_org_id AND g.id = p_generation_job_id;
  END IF;
  price_book_revision_id := coalesce(p_revision_id, run_rev, job_rev,
    (billing.price_book_at(coalesce(run_at, job_at, now()))).id, (billing.price_book_at(now())).id);
END $$;

-- An engine call's pricing: context plus the model's rate for the given
-- number of input tokens (prompt-size tier). Free models carry no rate.
CREATE FUNCTION billing.engine_pricing(p_org_id uuid, p_provider_revision_id uuid, p_input_tokens integer,
  p_run_id uuid DEFAULT NULL, p_generation_job_id uuid DEFAULT NULL, p_judge_job_id uuid DEFAULT NULL,
  p_narrative_job_id uuid DEFAULT NULL, p_price_book_revision_id uuid DEFAULT NULL)
RETURNS TABLE (billing_mode text, available_ucr bigint, run_id uuid, price_book_revision_id uuid, provider text, model_key text,
  free_model boolean, rate_id uuid, input_ucr_per_m bigint, output_ucr_per_m bigint, cached_ucr_per_m bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c record; k record; m billing.model_rate;
BEGIN
  PERFORM billing._tenant(p_org_id);
  IF p_provider_revision_id IS NULL OR p_input_tokens IS NULL OR p_input_tokens < 0 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT * INTO c FROM billing._pricing_context(p_org_id, p_run_id, p_generation_job_id, p_judge_job_id, p_narrative_job_id, p_price_book_revision_id);
  SELECT * INTO k FROM billing.provider_revision_rate_key(p_provider_revision_id);
  IF k.provider IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF NOT k.free_model AND c.price_book_revision_id IS NOT NULL THEN
    m := billing.rate_for(c.price_book_revision_id, k.provider, k.model_key, p_input_tokens);
  END IF;
  RETURN QUERY SELECT c.billing_mode, c.available_ucr, c.run_id, c.price_book_revision_id, k.provider, k.model_key, k.free_model,
    m.id, m.input_ucr_per_m, m.output_ucr_per_m, m.cached_ucr_per_m;
END $$;

-- A platform meter's pricing (§6.3): context plus µcr per unit.
CREATE FUNCTION billing.action_pricing(p_org_id uuid, p_meter text, p_run_id uuid DEFAULT NULL, p_price_book_revision_id uuid DEFAULT NULL)
RETURNS TABLE (billing_mode text, available_ucr bigint, run_id uuid, price_book_revision_id uuid, ucr_per_unit bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c record; rate bigint;
BEGIN
  PERFORM billing._tenant(p_org_id);
  IF p_meter IS NULL OR p_meter !~ '^[a-z][a-z0-9_]{1,63}$' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT * INTO c FROM billing._pricing_context(p_org_id, p_run_id, NULL, NULL, NULL, p_price_book_revision_id);
  SELECT ar.ucr_per_unit INTO rate FROM billing.action_rate ar WHERE ar.revision_id = c.price_book_revision_id AND ar.meter = p_meter;
  RETURN QUERY SELECT c.billing_mode, c.available_ucr, c.run_id, c.price_book_revision_id, rate;
END $$;

/* ------------------------------------------------------- shadow ledger --- */

CREATE TABLE billing.shadow_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No foreign key: a key-share lock on the credit account would make shadow
  -- writes wait behind billing transactions. _shadow_insert checks the account.
  org_id uuid NOT NULL,
  -- What enforce mode would have done: admit a run, hold, capture or release
  -- an engine call, charge a platform meter, or refund a failed run.
  kind text NOT NULL CHECK (kind IN ('admission','hold','capture','release','action','refund')),
  -- The idempotency key enforce mode uses (attempt:<id>, unit:<id>, …).
  entry_key text NOT NULL CHECK (length(entry_key) BETWEEN 3 AND 200),
  billing_mode text NOT NULL CHECK (billing_mode IN ('free','credits','contract')),
  -- Held, captured, released, charged, required (admission) or refunded µcr.
  amount_ucr bigint NOT NULL CHECK (amount_ucr >= 0),
  -- Capture: rate × usage before the cap at the hold. Admission: the p90.
  requested_ucr bigint CHECK (requested_ucr IS NULL OR requested_ucr >= 0),
  -- Capture: the part of the hold that would have been released.
  released_ucr bigint CHECK (released_ucr IS NULL OR released_ucr >= 0),
  -- The real available balance when recorded (a snapshot, never locked).
  available_ucr bigint,
  -- Enforce mode would have refused (short balance on a credits or free account).
  would_block boolean NOT NULL DEFAULT false,
  meter text CHECK (meter IS NULL OR meter ~ '^[a-z][a-z0-9_]{1,63}$'),
  quantity numeric(18,6) CHECK (quantity IS NULL OR quantity > 0),
  run_id uuid,
  attempt_id uuid,
  case_unit_id uuid,
  price_book_revision_id uuid,
  provider_revision_id uuid,
  -- Capture: {input, output, cached, provenance} as charged.
  usage jsonb CHECK (usage IS NULL OR jsonb_typeof(usage) = 'object'),
  reason text CHECK (reason IS NULL OR length(reason) BETWEEN 2 AND 200),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'capture' OR (requested_ucr IS NOT NULL AND released_ucr IS NOT NULL))
);
-- One entry per kind and key; a hold settles (capture or release) once.
CREATE UNIQUE INDEX shadow_entry_once ON billing.shadow_entry (org_id, kind, entry_key);
CREATE UNIQUE INDEX shadow_entry_settled_once ON billing.shadow_entry (org_id, entry_key) WHERE kind IN ('capture','release');
CREATE INDEX shadow_entry_day ON billing.shadow_entry (created_at);
CREATE INDEX shadow_entry_run ON billing.shadow_entry (org_id, run_id) WHERE run_id IS NOT NULL;
CREATE TRIGGER shadow_entry_append_only BEFORE UPDATE OR DELETE ON billing.shadow_entry
  FOR EACH ROW EXECUTE FUNCTION billing.reject_ledger_mutation();
CREATE TRIGGER shadow_entry_no_truncate BEFORE TRUNCATE ON billing.shadow_entry
  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_ledger_mutation();
ALTER TABLE billing.shadow_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.shadow_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON billing.shadow_entry FOR SELECT
  USING (org_id = nullif(current_setting('evals.org_id', true), '')::uuid);

-- Daily shadow diff reports (platform-level: workspace ids and counts only).
CREATE TABLE billing.shadow_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  actor_id text NOT NULL,
  mismatches integer NOT NULL CHECK (mismatches >= 0),
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object')
);
CREATE INDEX shadow_report_recent ON billing.shadow_report (generated_at DESC);
CREATE TRIGGER shadow_report_append_only BEFORE UPDATE OR DELETE ON billing.shadow_report
  FOR EACH ROW EXECUTE FUNCTION billing.reject_ledger_mutation();
ALTER TABLE billing.shadow_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.shadow_report FORCE ROW LEVEL SECURITY;

-- Appends one shadow entry unless its key is already recorded. Reads the
-- account without locking it; would_block is computed for holds, actions and
-- admissions on credits and free accounts.
CREATE FUNCTION billing._shadow_insert(p_org_id uuid, p_kind text, p_key text, p_amount bigint, p_requested bigint,
  p_released bigint, p_refs jsonb) RETURNS boolean
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE a billing.credit_account; n integer;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/@-]{2,199}$' OR p_amount IS NULL OR p_amount < 0
     OR p_amount > 1000000000000000 THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  SELECT * INTO a FROM billing.credit_account WHERE org_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_MISSING'; END IF;
  INSERT INTO billing.shadow_entry (org_id, kind, entry_key, billing_mode, amount_ucr, requested_ucr, released_ucr, available_ucr,
    would_block, meter, quantity, run_id, attempt_id, case_unit_id, price_book_revision_id, provider_revision_id, usage, reason,
    metadata, actor_id)
  VALUES (p_org_id, p_kind, p_key, a.billing_mode, p_amount, p_requested, p_released, a.available_ucr,
    p_kind IN ('hold','action','admission') AND a.billing_mode <> 'contract' AND p_amount > a.available_ucr,
    p_refs->>'meter', (p_refs->>'quantity')::numeric, (p_refs->>'run_id')::uuid, (p_refs->>'attempt_id')::uuid,
    (p_refs->>'case_unit_id')::uuid, (p_refs->>'price_book_revision_id')::uuid, (p_refs->>'provider_revision_id')::uuid,
    nullif(p_refs->'usage', 'null'::jsonb), p_refs->>'reason', coalesce(nullif(p_refs->'metadata', 'null'::jsonb), '{}'::jsonb),
    billing._actor())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

-- What billing.hold would reserve for one unit of work (key attempt:<id>).
CREATE FUNCTION billing.shadow_hold(p_org_id uuid, p_key text, p_amount_ucr bigint, p_run_id uuid DEFAULT NULL,
  p_attempt_id uuid DEFAULT NULL, p_case_unit_id uuid DEFAULT NULL, p_price_book_revision_id uuid DEFAULT NULL,
  p_provider_revision_id uuid DEFAULT NULL, p_metadata jsonb DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog SET lock_timeout = '500ms' AS $$
BEGIN
  PERFORM billing._tenant(p_org_id);
  RETURN billing._shadow_insert(p_org_id, 'hold', p_key, p_amount_ucr, NULL, NULL, jsonb_build_object(
    'run_id', p_run_id, 'attempt_id', p_attempt_id, 'case_unit_id', p_case_unit_id,
    'price_book_revision_id', p_price_book_revision_id, 'provider_revision_id', p_provider_revision_id, 'metadata', p_metadata));
END $$;

-- What billing.capture would charge: min(requested, hold), the rest released.
-- Without a shadow hold, or once it settled, nothing is recorded.
CREATE FUNCTION billing.shadow_capture(p_org_id uuid, p_key text, p_requested_ucr bigint, p_usage jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog SET lock_timeout = '500ms' AS $$
DECLARE h billing.shadow_entry; captured bigint;
BEGIN
  PERFORM billing._tenant(p_org_id);
  IF p_requested_ucr IS NULL OR p_requested_ucr < 0 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT * INTO h FROM billing.shadow_entry WHERE org_id = p_org_id AND kind = 'hold' AND entry_key = p_key;
  IF NOT FOUND THEN RETURN false; END IF;
  captured := least(p_requested_ucr, h.amount_ucr);
  RETURN billing._shadow_insert(p_org_id, 'capture', p_key, captured, p_requested_ucr, h.amount_ucr - captured, jsonb_build_object(
    'run_id', h.run_id, 'attempt_id', h.attempt_id, 'case_unit_id', h.case_unit_id,
    'price_book_revision_id', h.price_book_revision_id, 'provider_revision_id', h.provider_revision_id,
    'usage', p_usage, 'metadata', p_metadata));
END $$;

-- What billing.release would return: the whole hold (failed, cancelled, not dispatched).
CREATE FUNCTION billing.shadow_release(p_org_id uuid, p_key text, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog SET lock_timeout = '500ms' AS $$
DECLARE h billing.shadow_entry;
BEGIN
  PERFORM billing._tenant(p_org_id);
  SELECT * INTO h FROM billing.shadow_entry WHERE org_id = p_org_id AND kind = 'hold' AND entry_key = p_key;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN billing._shadow_insert(p_org_id, 'release', p_key, h.amount_ucr, NULL, NULL, jsonb_build_object(
    'run_id', h.run_id, 'attempt_id', h.attempt_id, 'case_unit_id', h.case_unit_id,
    'price_book_revision_id', h.price_book_revision_id, 'provider_revision_id', h.provider_revision_id,
    'reason', left(coalesce(p_reason, 'released'), 200)));
END $$;

-- What billing.charge_action would charge (kind action), or what admission
-- would require (kind admission: the run's p90 estimate).
CREATE FUNCTION billing.shadow_charge(p_org_id uuid, p_kind text, p_key text, p_meter text, p_amount_ucr bigint,
  p_quantity numeric DEFAULT NULL, p_run_id uuid DEFAULT NULL, p_case_unit_id uuid DEFAULT NULL,
  p_price_book_revision_id uuid DEFAULT NULL, p_metadata jsonb DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog SET lock_timeout = '500ms' AS $$
BEGIN
  PERFORM billing._tenant(p_org_id);
  IF p_kind IS NULL OR p_kind NOT IN ('action','admission') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  RETURN billing._shadow_insert(p_org_id, p_kind, p_key, p_amount_ucr, CASE WHEN p_kind = 'admission' THEN p_amount_ucr END, NULL,
    jsonb_build_object('meter', p_meter, 'quantity', p_quantity, 'run_id', p_run_id, 'case_unit_id', p_case_unit_id,
      'price_book_revision_id', p_price_book_revision_id, 'metadata', p_metadata));
END $$;

-- What billing.refund_run would return for a failed run: every shadow
-- capture and action of the run, once (key run-refund:<run_id>).
CREATE FUNCTION billing.shadow_refund_run(p_org_id uuid, p_run_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog SET lock_timeout = '500ms' AS $$
DECLARE total bigint;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  IF p_run_id IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT coalesce(sum(amount_ucr), 0)::bigint INTO total FROM billing.shadow_entry
  WHERE org_id = p_org_id AND run_id = p_run_id AND kind IN ('capture','action');
  IF total = 0 THEN RETURN false; END IF;
  RETURN billing._shadow_insert(p_org_id, 'refund', 'run-refund:' || p_run_id, total, NULL, NULL,
    jsonb_build_object('run_id', p_run_id, 'reason', left(coalesce(p_reason, 'run_failed'), 200)));
END $$;

-- Hourly reconciler: shadow holds unsettled after 24 h (unknown outcomes)
-- are released, as billing.expire_due releases real holds.
CREATE FUNCTION billing.shadow_expire_holds(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog SET lock_timeout = '500ms' AS $$
DECLARE h billing.shadow_entry; n integer := 0;
BEGIN
  PERFORM billing._privileged();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  FOR h IN SELECT * FROM billing.shadow_entry s WHERE s.kind = 'hold' AND s.created_at <= now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM billing.shadow_entry x WHERE x.org_id = s.org_id AND x.entry_key = s.entry_key
        AND x.kind IN ('capture','release'))
      ORDER BY s.created_at LIMIT p_limit
  LOOP
    IF billing._shadow_insert(h.org_id, 'release', h.entry_key, h.amount_ucr, NULL, NULL, jsonb_build_object(
        'run_id', h.run_id, 'attempt_id', h.attempt_id, 'case_unit_id', h.case_unit_id,
        'price_book_revision_id', h.price_book_revision_id, 'provider_revision_id', h.provider_revision_id,
        'reason', 'hold_expired')) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

/* --------------------------------------------------------- run refunds --- */

-- Failed runs (no usable result) that still carry charges: real captures or
-- actions not yet reversed, or shadow charges not yet shadow-refunded.
CREATE FUNCTION billing.run_refund_candidates(p_limit integer DEFAULT 100)
RETURNS TABLE (org_id uuid, run_id uuid, ledger boolean, shadow boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._privileged();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  RETURN QUERY
  SELECT c.org_id, c.run_id, c.ledger, c.shadow FROM (
    SELECT r.org_id, r.id AS run_id, r.updated_at,
      EXISTS (SELECT 1 FROM billing.ledger_entry e WHERE e.org_id = r.org_id AND e.run_id = r.id
        AND e.entry_type IN ('capture','action') AND e.amount_ucr < 0
        AND NOT EXISTS (SELECT 1 FROM billing.ledger_entry x WHERE x.org_id = e.org_id AND x.reverses_entry_id = e.id)) AS ledger,
      EXISTS (SELECT 1 FROM billing.shadow_entry s WHERE s.org_id = r.org_id AND s.run_id = r.id AND s.kind IN ('capture','action')
        AND s.amount_ucr > 0)
        AND NOT EXISTS (SELECT 1 FROM billing.shadow_entry s WHERE s.org_id = r.org_id AND s.kind = 'refund'
          AND s.entry_key = 'run-refund:' || r.id) AS shadow
    FROM evals.run r
    WHERE r.status = 'failed' AND r.updated_at > now() - interval '30 days'
  ) c WHERE c.ledger OR c.shadow
  ORDER BY c.updated_at LIMIT p_limit;
END $$;

/* ------------------------------------------------------- shadow report --- */

-- The shadow diff for one UTC day: what enforce mode would have held,
-- captured, released and charged, against budget_reservation and the
-- recorded attempts, units and usage. Checks count disagreements; they must
-- all be zero before enforcement.
CREATE FUNCTION billing.shadow_diff(p_day date, p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE lo timestamptz; hi timestamptz; totals jsonb; meters jsonb; euro jsonb; checks jsonb; accounts jsonb;
BEGIN
  PERFORM billing._privileged();
  IF p_day IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  lo := p_day::timestamp AT TIME ZONE 'UTC';
  hi := lo + interval '1 day';
  SELECT jsonb_build_object(
      'admissions', count(*) FILTER (WHERE kind = 'admission'),
      'admission_ucr', coalesce(sum(amount_ucr) FILTER (WHERE kind = 'admission'), 0),
      'admissions_blocked', count(*) FILTER (WHERE kind = 'admission' AND would_block),
      'holds', count(*) FILTER (WHERE kind = 'hold'),
      'held_ucr', coalesce(sum(amount_ucr) FILTER (WHERE kind = 'hold'), 0),
      'holds_blocked', count(*) FILTER (WHERE kind = 'hold' AND would_block),
      'captures', count(*) FILTER (WHERE kind = 'capture'),
      'captured_ucr', coalesce(sum(amount_ucr) FILTER (WHERE kind = 'capture'), 0),
      'capture_requested_ucr', coalesce(sum(requested_ucr) FILTER (WHERE kind = 'capture'), 0),
      'capture_released_ucr', coalesce(sum(released_ucr) FILTER (WHERE kind = 'capture'), 0),
      'captures_over_hold', count(*) FILTER (WHERE kind = 'capture' AND requested_ucr > amount_ucr),
      'releases', count(*) FILTER (WHERE kind = 'release'),
      'released_ucr', coalesce(sum(amount_ucr) FILTER (WHERE kind = 'release'), 0),
      'releases_expired', count(*) FILTER (WHERE kind = 'release' AND reason = 'hold_expired'),
      'actions', count(*) FILTER (WHERE kind = 'action'),
      'action_ucr', coalesce(sum(amount_ucr) FILTER (WHERE kind = 'action'), 0),
      'actions_blocked', count(*) FILTER (WHERE kind = 'action' AND would_block),
      'refunds', count(*) FILTER (WHERE kind = 'refund'),
      'refund_ucr', coalesce(sum(amount_ucr) FILTER (WHERE kind = 'refund'), 0),
      'contract_entries', count(*) FILTER (WHERE billing_mode = 'contract'),
      'charged_ucr', coalesce(sum(amount_ucr) FILTER (WHERE kind IN ('capture','action')), 0)
        - coalesce(sum(amount_ucr) FILTER (WHERE kind = 'refund'), 0))
    INTO totals FROM billing.shadow_entry WHERE created_at >= lo AND created_at < hi AND (p_org_id IS NULL OR org_id = p_org_id);
  SELECT coalesce(jsonb_object_agg(meter, jsonb_build_object('count', n, 'quantity', q, 'ucr', u)), '{}'::jsonb) INTO meters
  FROM (SELECT meter, count(*) AS n, sum(quantity) AS q, sum(amount_ucr) AS u FROM billing.shadow_entry
        WHERE kind = 'action' AND created_at >= lo AND created_at < hi AND (p_org_id IS NULL OR org_id = p_org_id) GROUP BY meter) m;
  -- Our euro side for the same attempts.
  SELECT jsonb_build_object(
      'attempts', count(*),
      'reserved_eur', coalesce(sum(r.amount), 0)::text,
      'settled_eur', coalesce(sum(r.actual) FILTER (WHERE r.state = 'settled'), 0)::text,
      'released', count(*) FILTER (WHERE r.state = 'released'),
      'unresolved', count(*) FILTER (WHERE r.state = 'unresolved'),
      'missing', count(*) FILTER (WHERE r.id IS NULL))
    INTO euro
  FROM billing.shadow_entry h LEFT JOIN evals.budget_reservation r ON (r.org_id, r.attempt_id) = (h.org_id, h.attempt_id)
  WHERE h.kind = 'hold' AND h.created_at >= lo AND h.created_at < hi AND (p_org_id IS NULL OR h.org_id = p_org_id);
  SELECT jsonb_build_object(
    -- A call that completed with a complete answer must be captured.
    'completed_without_capture', (SELECT count(*) FROM billing.shadow_entry h
      JOIN evals.execution_attempt a ON (a.org_id, a.id) = (h.org_id, h.attempt_id)
      JOIN evals.execution_result x ON (x.org_id, x.attempt_id) = (a.org_id, a.id)
      WHERE h.kind = 'hold' AND h.created_at >= lo AND h.created_at < hi AND (p_org_id IS NULL OR h.org_id = p_org_id) AND a.status = 'completed' AND x.output->>'complete' = 'true'
        AND NOT EXISTS (SELECT 1 FROM billing.shadow_entry c WHERE c.org_id = h.org_id AND c.entry_key = h.entry_key AND c.kind = 'capture')),
    -- Failed, cancelled, incomplete and unknown calls are charged 0.
    'capture_without_completion', (SELECT count(*) FROM billing.shadow_entry c
      LEFT JOIN evals.execution_attempt a ON (a.org_id, a.id) = (c.org_id, c.attempt_id)
      LEFT JOIN evals.execution_result x ON (x.org_id, x.attempt_id) = (c.org_id, c.attempt_id)
      WHERE c.kind = 'capture' AND c.created_at >= lo AND c.created_at < hi AND (p_org_id IS NULL OR c.org_id = p_org_id)
        AND (a.status IS DISTINCT FROM 'completed' OR x.output->>'complete' IS DISTINCT FROM 'true')),
    -- Captured credits equal rate × recorded usage, recomputed here from the frozen revision.
    'capture_rate_mismatch', (SELECT count(*) FROM billing.shadow_entry c
      CROSS JOIN LATERAL billing.provider_revision_rate_key(c.provider_revision_id) k
      LEFT JOIN LATERAL billing.rate_for(c.price_book_revision_id, k.provider, k.model_key, (c.usage->>'input')::integer) m ON true
      WHERE c.kind = 'capture' AND c.created_at >= lo AND c.created_at < hi AND (p_org_id IS NULL OR c.org_id = p_org_id)
        AND c.requested_ucr IS DISTINCT FROM CASE WHEN k.free_model OR m.id IS NULL THEN 0 ELSE
          (((c.usage->>'input')::bigint - coalesce((c.usage->>'cached')::bigint, 0)) * m.input_ucr_per_m
            + coalesce((c.usage->>'cached')::bigint, 0) * coalesce(m.cached_ucr_per_m, m.input_ucr_per_m)
            + (c.usage->>'output')::bigint * m.output_ucr_per_m + 999999) / 1000000 END),
    -- Platform meters only for succeeded units.
    'action_without_success', (SELECT count(*) FROM billing.shadow_entry x
      JOIN evals.case_unit u ON (u.org_id, u.id) = (x.org_id, x.case_unit_id)
      WHERE x.kind = 'action' AND x.created_at >= lo AND x.created_at < hi AND (p_org_id IS NULL OR x.org_id = p_org_id) AND u.status <> 'succeeded'),
    -- Every succeeded unit of a run admitted in shadow mode carries its meter.
    'success_without_action', (SELECT count(*) FROM evals.case_unit u
      JOIN evals.run r ON (r.org_id, r.id) = (u.org_id, u.run_id)
      WHERE u.status = 'succeeded' AND u.updated_at >= lo AND u.updated_at < hi AND (p_org_id IS NULL OR u.org_id = p_org_id) AND r.execution_mode = 'deployed_system'
        AND EXISTS (SELECT 1 FROM billing.shadow_entry s WHERE s.org_id = r.org_id AND s.kind = 'admission' AND s.entry_key = 'admission:' || r.id)
        AND NOT EXISTS (SELECT 1 FROM billing.shadow_entry s WHERE s.org_id = u.org_id AND s.kind = 'action' AND s.entry_key = 'unit:' || u.id)),
    -- Unknown outcomes keep their hold up to 24 h; the hourly reconciler releases them.
    'holds_open_over_25h', (SELECT count(*) FROM billing.shadow_entry h
      WHERE h.kind = 'hold' AND h.created_at < now() - interval '25 hours' AND (p_org_id IS NULL OR h.org_id = p_org_id)
        AND NOT EXISTS (SELECT 1 FROM billing.shadow_entry x WHERE x.org_id = h.org_id AND x.entry_key = h.entry_key AND x.kind IN ('capture','release'))))
    INTO checks;
  SELECT coalesce(jsonb_agg(jsonb_build_object('org_id', org_id, 'billing_mode', billing_mode, 'entries', n,
      'held_ucr', held, 'captured_ucr', captured, 'released_ucr', released, 'action_ucr', actions, 'refund_ucr', refunds,
      'would_block', blocked) ORDER BY org_id), '[]'::jsonb) INTO accounts
  FROM (SELECT org_id, max(billing_mode) AS billing_mode, count(*) AS n,
          coalesce(sum(amount_ucr) FILTER (WHERE kind = 'hold'), 0) AS held,
          coalesce(sum(amount_ucr) FILTER (WHERE kind = 'capture'), 0) AS captured,
          coalesce(sum(amount_ucr) FILTER (WHERE kind = 'release'), 0) AS released,
          coalesce(sum(amount_ucr) FILTER (WHERE kind = 'action'), 0) AS actions,
          coalesce(sum(amount_ucr) FILTER (WHERE kind = 'refund'), 0) AS refunds,
          count(*) FILTER (WHERE would_block) AS blocked
        FROM billing.shadow_entry WHERE created_at >= lo AND created_at < hi AND (p_org_id IS NULL OR org_id = p_org_id) GROUP BY org_id) a;
  RETURN jsonb_build_object('day', p_day, 'org_id', p_org_id, 'totals', totals, 'meters', meters, 'euro', euro, 'checks', checks, 'accounts', accounts,
    'mismatches', (checks->>'completed_without_capture')::int + (checks->>'capture_without_completion')::int
      + (checks->>'capture_rate_mismatch')::int + (checks->>'action_without_success')::int
      + (checks->>'success_without_action')::int + (checks->>'holds_open_over_25h')::int);
END $$;

-- The scheduler's daily report: computes the diff for a day and keeps it.
CREATE FUNCTION billing.record_shadow_report(p_day date)
RETURNS billing.shadow_report
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE d jsonb; r billing.shadow_report;
BEGIN
  PERFORM billing._privileged();
  d := billing.shadow_diff(p_day, NULL);
  INSERT INTO billing.shadow_report (day, actor_id, mismatches, report) VALUES (p_day, billing._actor(), (d->>'mismatches')::int, d)
  RETURNING * INTO r;
  RETURN r;
END $$;

/* ------------------------------------------------------------- grants --- */

REVOKE ALL ON billing.shadow_entry, billing.shadow_report FROM PUBLIC;
REVOKE ALL ON FUNCTION billing._pricing_context(uuid, uuid, uuid, uuid, uuid, uuid),
  billing._shadow_insert(uuid, text, text, bigint, bigint, bigint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  billing.engine_pricing(uuid, uuid, integer, uuid, uuid, uuid, uuid, uuid),
  billing.action_pricing(uuid, text, uuid, uuid),
  billing.shadow_hold(uuid, text, bigint, uuid, uuid, uuid, uuid, uuid, jsonb),
  billing.shadow_capture(uuid, text, bigint, jsonb, jsonb),
  billing.shadow_release(uuid, text, text),
  billing.shadow_charge(uuid, text, text, text, bigint, numeric, uuid, uuid, uuid, jsonb),
  billing.shadow_refund_run(uuid, uuid, text),
  billing.shadow_expire_holds(integer),
  billing.run_refund_candidates(integer),
  billing.shadow_diff(date, uuid),
  billing.record_shadow_report(date)
FROM PUBLIC;
-- Pricing and shadow recording on the run path: the web runtime (and the
-- scheduler inside it) and every worker role, like hold/capture/release.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['evals_runtime','evals_worker','evals_browser','evals_document'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON billing.shadow_entry TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION
        billing.engine_pricing(uuid, uuid, integer, uuid, uuid, uuid, uuid, uuid),
        billing.action_pricing(uuid, text, uuid, uuid),
        billing.shadow_hold(uuid, text, bigint, uuid, uuid, uuid, uuid, uuid, jsonb),
        billing.shadow_capture(uuid, text, bigint, jsonb, jsonb),
        billing.shadow_release(uuid, text, text),
        billing.shadow_charge(uuid, text, text, text, bigint, numeric, uuid, uuid, uuid, jsonb) TO %I', r);
    END IF;
  END LOOP;
END $$;
-- Reconciler and reports: the scheduler (a member of evals_runtime), and
-- inside it only service identities and platform admins.
GRANT EXECUTE ON FUNCTION
  billing.shadow_refund_run(uuid, uuid, text),
  billing.shadow_expire_holds(integer),
  billing.run_refund_candidates(integer),
  billing.shadow_diff(date, uuid),
  billing.record_shadow_report(date)
TO evals_runtime;

COMMIT;
