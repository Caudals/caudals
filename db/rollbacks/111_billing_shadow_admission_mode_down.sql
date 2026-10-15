-- Rollback for db/migrations/111_billing_shadow_admission_mode.sql.
--
-- Restores the 089 shadow diff and drops billing.run_admission_mode, the
-- run trigger and evals.run.billing_admission_mode. It refuses once any run
-- recorded the mode it was admitted under: that is billing evidence (which
-- ledger a run was reconciled against); repair forward instead. Run it as a
-- role that bypasses row-level security, or the count could not see every
-- row. One transaction.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  IF EXISTS (SELECT 1 FROM evals.run WHERE billing_admission_mode IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback blocked: runs recorded their credit admission mode; repair forward instead.';
  END IF;
END $$;

-- The 089 body.
CREATE OR REPLACE FUNCTION billing.shadow_diff(p_day date, p_org_id uuid DEFAULT NULL)
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


DROP FUNCTION billing.run_admission_mode(uuid, uuid);
DROP TRIGGER frozen_billing_admission_mode ON evals.run;
DROP FUNCTION evals.freeze_billing_admission_mode();
ALTER TABLE evals.run DROP COLUMN billing_admission_mode;

COMMIT;
