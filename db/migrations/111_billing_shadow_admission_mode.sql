-- The credit mode each run was admitted under (launch L-16b; repairs L-11's
-- shadow diff for L-14's per-workspace override).
--
-- The shadow-admission pass (lib/billing/jobs.ts runShadowAdmissions) read the
-- workspace's *current* mode, and the shadow diff treated every run with a
-- shadow admission as a shadow run. A run admitted under an `enforce`
-- override whose workspace went back to `inherit` (shadow) within five
-- minutes got a shadow admission after the fact, and the diff then counted
-- its real-ledger meters as missing shadow meters (2026-10-14: three
-- `success_without_action` in the shadow report and the reconciliation).
--
-- 1. evals.run.billing_admission_mode: the mode a run was admitted under,
--    frozen when the row is inserted, like price_book_revision_id (089) and
--    model_routes (078). The trigger applies the rule of
--    lib/billing/engine.ts workspaceEngineMode: the process mode
--    (BILLING_CREDITS_ENABLED / BILLING_ENFORCE, which withTenant passes as
--    the transaction setting billing.engine_mode), overridden by the
--    workspace's `shadow` or `enforce` override unless the credit layer is
--    off. A writer that does not pass the setting (older code, scripts,
--    fixtures) leaves it NULL. The override row is read FOR SHARE, so an
--    override change waits for a run being created and then sees it in
--    flight (WORKSPACE_BUSY, 093).
-- 2. billing.run_admission_mode(org, run): the frozen mode, or for a run
--    without one (created before this migration) the mode its charges show:
--    real-ledger holds, captures or meters → enforce; else a shadow
--    admission → shadow; else unknown (NULL).
-- 3. billing.shadow_diff: succeeded units are expected to carry a shadow
--    meter only for runs admitted in shadow mode (with their shadow
--    admission, as before), and a real-ledger meter (action:unit:<id>) for
--    runs admitted in enforce mode on credit and free accounts (new check
--    enforced_success_without_action). Contract workspaces never hold
--    credits, so their enforce-mode runs carry no meters. The report also
--    counts the day's runs by admission mode. Every other check is unchanged.
--    The daily reconciliation (094) reads the diff, so its shadow_drift
--    follows.
--
-- Additive. Rollback: db/rollbacks/111_billing_shadow_admission_mode_down.sql
-- restores the 089 diff and drops the column, refusing once a run recorded
-- its admission mode (billing evidence): repair forward then.
BEGIN;
SET LOCAL lock_timeout = '10s';

/* ------------------------------------------------- run admission mode --- */

ALTER TABLE evals.run ADD COLUMN billing_admission_mode text
  CHECK (billing_admission_mode IS NULL OR billing_admission_mode IN ('off','shadow','enforce'));
COMMENT ON COLUMN evals.run.billing_admission_mode IS
  'Credit mode the run was admitted under (launch L-16b): the process mode (BILLING_CREDITS_ENABLED/BILLING_ENFORCE) or the workspace override (L-14), frozen at insert. NULL: created before migration 111 or by a writer that did not pass billing.engine_mode.';

CREATE FUNCTION evals.freeze_billing_admission_mode() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE process text; workspace text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.billing_admission_mode IS DISTINCT FROM OLD.billing_admission_mode THEN
      RAISE EXCEPTION 'immutable run admission mode' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  process := nullif(current_setting('billing.engine_mode', true), '');
  IF process IS NULL OR process NOT IN ('off','shadow','enforce') THEN
    NEW.billing_admission_mode := NULL;
  ELSIF process = 'off' THEN
    -- BILLING_CREDITS_ENABLED=false is the kill switch for every workspace.
    NEW.billing_admission_mode := 'off';
  ELSE
    SELECT o.enforcement INTO workspace FROM billing.workspace_override o WHERE o.org_id = NEW.org_id FOR SHARE;
    NEW.billing_admission_mode := CASE WHEN workspace IN ('shadow','enforce') THEN workspace ELSE process END;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION evals.freeze_billing_admission_mode() FROM PUBLIC;
CREATE TRIGGER frozen_billing_admission_mode BEFORE INSERT OR UPDATE OF billing_admission_mode ON evals.run
  FOR EACH ROW EXECUTE FUNCTION evals.freeze_billing_admission_mode();

-- The mode a run was admitted under: frozen since this migration, otherwise
-- inferred from its charges. Runs with the caller's rights (row-level
-- security applies to the scheduler; the diff calls it as the owner).
CREATE FUNCTION billing.run_admission_mode(p_org_id uuid, p_run_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(r.billing_admission_mode,
    CASE
      WHEN EXISTS (SELECT 1 FROM billing.ledger_entry e WHERE e.org_id = r.org_id AND e.run_id = r.id
        AND e.entry_type IN ('hold','capture','action')) THEN 'enforce'
      WHEN EXISTS (SELECT 1 FROM billing.shadow_entry s WHERE s.org_id = r.org_id AND s.kind = 'admission'
        AND s.entry_key = 'admission:' || r.id) THEN 'shadow'
    END)
  FROM evals.run r WHERE r.org_id = p_org_id AND r.id = p_run_id
$$;
REVOKE ALL ON FUNCTION billing.run_admission_mode(uuid, uuid) FROM PUBLIC;
-- The scheduler's shadow-admission pass (a member of evals_runtime) and the
-- roles that already read the run, the ledger and the shadow ledger.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['evals_runtime','evals_worker','evals_browser','evals_document'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION billing.run_admission_mode(uuid, uuid) TO %I', r);
    END IF;
  END LOOP;
END $$;

/* ------------------------------------------------------- shadow report --- */

-- As 089, with succeeded units classified by the run's admission mode.
CREATE OR REPLACE FUNCTION billing.shadow_diff(p_day date, p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE lo timestamptz; hi timestamptz; totals jsonb; meters jsonb; euro jsonb; checks jsonb; accounts jsonb; runs jsonb;
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
  -- The day's runs by the mode they were admitted under (unknown: not recorded and nothing charged).
  SELECT jsonb_build_object(
      'shadow', count(*) FILTER (WHERE m = 'shadow'),
      'enforce', count(*) FILTER (WHERE m = 'enforce'),
      'off', count(*) FILTER (WHERE m = 'off'),
      'unknown', count(*) FILTER (WHERE m IS NULL))
    INTO runs
  FROM (SELECT billing.run_admission_mode(r.org_id, r.id) AS m FROM evals.run r
        WHERE r.created_at >= lo AND r.created_at < hi AND (p_org_id IS NULL OR r.org_id = p_org_id)) x;
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
    -- Every succeeded unit of a run admitted in shadow mode (with its shadow admission) carries its shadow meter.
    'success_without_action', (SELECT count(*) FROM evals.case_unit u
      JOIN evals.run r ON (r.org_id, r.id) = (u.org_id, u.run_id)
      WHERE u.status = 'succeeded' AND u.updated_at >= lo AND u.updated_at < hi AND (p_org_id IS NULL OR u.org_id = p_org_id) AND r.execution_mode = 'deployed_system'
        AND EXISTS (SELECT 1 FROM billing.shadow_entry s WHERE s.org_id = r.org_id AND s.kind = 'admission' AND s.entry_key = 'admission:' || r.id)
        AND billing.run_admission_mode(r.org_id, r.id) = 'shadow'
        AND NOT EXISTS (SELECT 1 FROM billing.shadow_entry s WHERE s.org_id = u.org_id AND s.kind = 'action' AND s.entry_key = 'unit:' || u.id)),
    -- Every succeeded unit of a run admitted in enforce mode (credit and free accounts) carries its real-ledger meter.
    'enforced_success_without_action', (SELECT count(*) FROM evals.case_unit u
      JOIN evals.run r ON (r.org_id, r.id) = (u.org_id, u.run_id)
      JOIN billing.credit_account ca ON ca.org_id = r.org_id AND ca.billing_mode <> 'contract'
      WHERE u.status = 'succeeded' AND u.updated_at >= lo AND u.updated_at < hi AND (p_org_id IS NULL OR u.org_id = p_org_id) AND r.execution_mode = 'deployed_system'
        AND billing.run_admission_mode(r.org_id, r.id) = 'enforce'
        AND NOT EXISTS (SELECT 1 FROM billing.ledger_entry e WHERE e.org_id = u.org_id AND e.idempotency_key = 'action:unit:' || u.id)),
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
  RETURN jsonb_build_object('day', p_day, 'org_id', p_org_id, 'totals', totals, 'meters', meters, 'euro', euro, 'runs', runs,
    'checks', checks, 'accounts', accounts,
    'mismatches', (checks->>'completed_without_capture')::int + (checks->>'capture_without_completion')::int
      + (checks->>'capture_rate_mismatch')::int + (checks->>'action_without_success')::int
      + (checks->>'success_without_action')::int + (checks->>'enforced_success_without_action')::int
      + (checks->>'holds_open_over_25h')::int);
END $$;

COMMIT;
