-- Billing alert settings and two ops reviews (launch gap package G2: the
-- L-10, L-12 and L-15 follow-ups; spec v2 §6.4, §6.10, §6.12, §6.13, §6.14).
--
-- 1. Low-balance threshold (§6.10, §6.12 "Limits and alerts"). An owner sets
--    the balance below which the workspace is alerted. billing.alert_setting
--    keeps it per workspace; no row, or a NULL threshold, keeps the default
--    (500 credits, or 20 % of the last pack bought when that is more).
--    billing.set_low_balance_threshold accepts the workspace's owners,
--    platform admins and services and audits every change.
-- 2. Unusual-spend emails (§6.10: alerts by email and in the app).
--    evals.notification_email_recipients lists 'unusual_spend' with the other
--    billing alerts: owners who keep billing email on.
-- 3. Provider-price check acknowledgements (§6.4, L-10). The weekly check
--    stores what moved (billing.price_check); a platform admin acknowledges
--    a check once they have decided what to do (billing.price_check_ack).
--    An acknowledgement covers the check's findings (a fingerprint of the
--    revision and of every rate that moved or is due for recomputation), so
--    next week's identical findings stay acknowledged and anything new opens
--    the alert again. billing.price_check_status() is what the health check
--    (scripts/evals/health-alerts.sh, price_check_changes) and the console
--    read.
-- 4. Manual tax review (§6.14, L-12). A profile whose treatment waits for a
--    review (VIES unavailable; a Spanish address in the Canary Islands,
--    Ceuta or Melilla) cannot buy credits. billing.tax_review_queue lists
--    those profiles with the purchases refused meanwhile
--    (billing.record_blocked_top_up, and the auto-recharge's own
--    auto_recharge_blocked state); billing.resolve_tax_review lets a platform
--    admin set the treatment after the review, within the §6.14 rules, so the
--    buyer can complete Checkout. Audited with before and after values.
--
-- Additive. Rollback: db/rollbacks/112_billing_low_balance_threshold_down.sql
-- (refuses once a threshold or an acknowledgement is stored).
BEGIN;
SET LOCAL lock_timeout = '10s';

/* -------------------------------------------- low-balance threshold --- */

CREATE TABLE billing.alert_setting (
  org_id uuid PRIMARY KEY REFERENCES billing.credit_account(org_id),
  -- µcr; NULL = the default rule (500 credits, or 20 % of the last pack).
  low_balance_threshold_ucr bigint CHECK (low_balance_threshold_ucr IS NULL
    OR low_balance_threshold_ucr BETWEEN 1000000 AND 10000000000000),
  version bigint NOT NULL DEFAULT 1,
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 255),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing.alert_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.alert_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON billing.alert_setting FOR SELECT
  USING (org_id = nullif(current_setting('evals.org_id', true), '')::uuid);
REVOKE ALL ON billing.alert_setting FROM PUBLIC;
GRANT SELECT ON billing.alert_setting TO evals_runtime;

-- Saves the workspace's low-balance threshold (whole credits as µcr; NULL =
-- the default rule). Owners, platform admins and services; audited.
CREATE FUNCTION billing.set_low_balance_threshold(p_org_id uuid, p_threshold_ucr bigint, p_request_id text DEFAULT NULL)
RETURNS billing.alert_setting
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s billing.alert_setting; before billing.alert_setting;
BEGIN
  PERFORM billing._owner(p_org_id);
  IF (p_threshold_ucr IS NOT NULL AND (p_threshold_ucr NOT BETWEEN 1000000 AND 10000000000000 OR p_threshold_ucr % 1000000 <> 0))
     OR (p_request_id IS NOT NULL AND length(p_request_id) > 200) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  PERFORM billing._lock_account(p_org_id);
  SELECT * INTO before FROM billing.alert_setting WHERE org_id = p_org_id;
  IF FOUND AND before.low_balance_threshold_ucr IS NOT DISTINCT FROM p_threshold_ucr THEN RETURN before; END IF;
  INSERT INTO billing.alert_setting AS a (org_id, low_balance_threshold_ucr, updated_by)
  VALUES (p_org_id, p_threshold_ucr, billing._actor())
  ON CONFLICT (org_id) DO UPDATE SET low_balance_threshold_ucr = EXCLUDED.low_balance_threshold_ucr,
    version = a.version + 1, updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO s;
  PERFORM billing._audit_event(p_org_id, 'billing.low_balance_threshold_saved', p_org_id::text, jsonb_build_object(
    'before', jsonb_build_object('low_balance_threshold_ucr', before.low_balance_threshold_ucr),
    'after', jsonb_build_object('low_balance_threshold_ucr', s.low_balance_threshold_ucr), 'version', s.version,
    'request_id', p_request_id));
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION billing.set_low_balance_threshold(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.set_low_balance_threshold(uuid, bigint, text) TO evals_runtime;

/* ------------------------------------------- billing alert recipients --- */

-- As 095, with 'unusual_spend' among the billing alerts.
CREATE OR REPLACE FUNCTION evals.notification_email_recipients(p_org_id uuid, p_kind text)
RETURNS TABLE (user_id text, email text, locale text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, public AS $$
  SELECT m.user_id, u.email,
    COALESCE(ep.locale,
      (SELECT s.locale FROM evals.self_serve_signup s WHERE lower(s.email) = lower(u.email) AND s.consumed_at IS NOT NULL ORDER BY s.consumed_at DESC LIMIT 1),
      'en')
  FROM evals.membership m
  JOIN public.auth_user u ON u.id = m.user_id AND u."emailVerified"
  LEFT JOIN evals.notification_preference p ON p.org_id = m.org_id AND p.user_id = m.user_id
  LEFT JOIN evals.email_preference ep ON ep.user_id = m.user_id
  WHERE m.org_id = p_org_id AND p_org_id = evals.org_id()
    AND CASE
      WHEN p_kind IN ('report_published','test_set_ready') THEN COALESCE(p.email_completion, false)
      WHEN p_kind IN ('run_failed','generation_failed','website_failed','document_failed','export_failed') THEN COALESCE(p.email_failure, false)
      WHEN p_kind = 'input_required' THEN COALESCE(p.email_required_input, false)
      -- On until a person saves a choice (the Settings default); Caudals operators opt in.
      WHEN p_kind IN ('monitor_regression') THEN COALESCE(p.email_regressions, m.role <> 'operator')
      WHEN p_kind IN ('low_balance','auto_recharge_succeeded','auto_recharge_failed','credits_expiring','cap_reached','schedule_skipped','unusual_spend')
        THEN m.role = 'owner' AND COALESCE(p.email_billing, true)
      ELSE false END
$$;
REVOKE ALL ON FUNCTION evals.notification_email_recipients(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.notification_email_recipients(uuid, text) TO evals_runtime;

/* ------------------------------------ provider-price acknowledgements --- */

-- The findings of a check that need ops: every rate whose listed price moved
-- or whose cost moved past the recompute threshold, with the revision checked.
CREATE FUNCTION billing.price_check_fingerprint(p_revision_id uuid, p_changes jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT encode(sha256(convert_to(coalesce(p_revision_id::text, '') || '|' || coalesce(string_agg(x, '|' ORDER BY x), ''), 'UTF8')), 'hex')
  FROM (SELECT concat_ws(':', c->>'provider', c->>'modelId', c->>'minInputTokens', c->>'status',
          c->'input'->>'listed', c->'output'->>'listed', c->>'recompute') AS x
        FROM jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
        WHERE c->>'status' = 'changed' OR c->>'recompute' = 'true') s
$$;

CREATE FUNCTION billing.price_check_alerting(p_changes jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT count(*)::integer FROM jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
  WHERE c->>'status' = 'changed' OR c->>'recompute' = 'true'
$$;

CREATE TABLE billing.price_check_ack (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL UNIQUE REFERENCES billing.price_check(id),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  note text NOT NULL CHECK (length(note) BETWEEN 3 AND 2000),
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 255),
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_check_ack_fingerprint ON billing.price_check_ack (fingerprint, acknowledged_at DESC);
CREATE TRIGGER price_check_ack_append_only BEFORE UPDATE OR DELETE ON billing.price_check_ack
  FOR EACH ROW EXECUTE FUNCTION billing.reject_ledger_mutation();
CREATE TRIGGER price_check_ack_no_truncate BEFORE TRUNCATE ON billing.price_check_ack
  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_ledger_mutation();
REVOKE ALL ON billing.price_check_ack FROM PUBLIC;
GRANT SELECT ON billing.price_check_ack TO evals_runtime;

-- The latest weekly check: how many of its rates need ops, and the
-- acknowledgement that covers them (of this check, or of an earlier one with
-- the same findings), if any.
CREATE FUNCTION billing.price_check_status()
RETURNS TABLE (check_id uuid, checked_at timestamptz, revision_id uuid, alerting integer, fingerprint text,
  acknowledged_at timestamptz, acknowledged_by text, note text, acknowledged_check_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH latest AS (
    SELECT c.id, c.checked_at, c.revision_id, billing.price_check_alerting(c.changes) AS n,
      billing.price_check_fingerprint(c.revision_id, c.changes) AS fp
    FROM billing.price_check c ORDER BY c.checked_at DESC, c.id DESC LIMIT 1)
  SELECT l.id, l.checked_at, l.revision_id, l.n, l.fp, a.acknowledged_at, a.actor_id, a.note, a.check_id
  FROM latest l
  LEFT JOIN LATERAL (SELECT * FROM billing.price_check_ack x WHERE x.fingerprint = l.fp AND l.n > 0
    ORDER BY x.acknowledged_at DESC LIMIT 1) a ON true
$$;
REVOKE ALL ON FUNCTION billing.price_check_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.price_check_status() TO evals_runtime;

-- A platform admin acknowledges the latest check's findings with a note
-- (what was decided: a draft revision, or why the book stays). Idempotent
-- per check; audited.
CREATE FUNCTION billing.acknowledge_price_check(p_check_id uuid, p_note text)
RETURNS billing.price_check_ack
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor text := billing._actor(); c billing.price_check; a billing.price_check_ack; v_note text; n integer;
BEGIN
  IF billing.actor_kind(actor) <> 'user' OR NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  v_note := billing._reason(p_note, true);
  SELECT * INTO c FROM billing.price_check WHERE id = p_check_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_CHECK_NOT_FOUND'; END IF;
  SELECT * INTO a FROM billing.price_check_ack WHERE check_id = c.id;
  IF FOUND THEN RETURN a; END IF;
  IF EXISTS (SELECT 1 FROM billing.price_check x WHERE x.checked_at > c.checked_at OR (x.checked_at = c.checked_at AND x.id > c.id)) THEN
    RAISE EXCEPTION 'PRICE_CHECK_SUPERSEDED';
  END IF;
  IF billing.price_check_alerting(c.changes) = 0 THEN RAISE EXCEPTION 'PRICE_CHECK_CLEAN'; END IF;
  INSERT INTO billing.price_check_ack (check_id, fingerprint, note, actor_id)
  VALUES (c.id, billing.price_check_fingerprint(c.revision_id, c.changes), v_note, actor)
  ON CONFLICT (check_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT * INTO a FROM billing.price_check_ack WHERE check_id = c.id;
  IF n > 0 THEN
    INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (evals.org_id(), actor, 'billing.price_check_acknowledged', c.id::text, jsonb_build_object('note', v_note,
      'revision_id', c.revision_id, 'checked_at', c.checked_at, 'changed', c.changed,
      'alerting', billing.price_check_alerting(c.changes), 'fingerprint', a.fingerprint));
  END IF;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION billing.acknowledge_price_check(uuid, text), billing.price_check_fingerprint(uuid, jsonb),
  billing.price_check_alerting(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.acknowledge_price_check(uuid, text) TO evals_runtime;

/* --------------------------------------------------- manual tax review --- */

-- A purchase refused because the profile waits for a manual tax review: one
-- row per workspace, UTC day and pack, for the ops review queue. Owners
-- (the buyer), platform admins and services.
CREATE FUNCTION billing.record_blocked_top_up(p_org_id uuid, p_net_cents bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE p billing.billing_profile; n integer;
BEGIN
  PERFORM billing._owner(p_org_id);
  IF billing.pack_bonus_percent(p_net_cents) IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT * INTO p FROM billing.billing_profile WHERE org_id = p_org_id;
  IF NOT FOUND OR p.tax_review_reason IS NULL THEN RETURN false; END IF;
  INSERT INTO billing.alert_state (org_id, kind, period_key, payload)
  VALUES (p_org_id, 'top_up_tax_review', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ':' || p_net_cents,
    jsonb_build_object('net_cents', p_net_cents, 'reason', p.tax_review_reason, 'profile_version', p.version))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

-- Profiles waiting for a manual tax review (oldest first), with the
-- purchases refused since they went to review (checkout attempts and
-- auto-recharges) and their open orders. Platform admins.
CREATE FUNCTION billing.tax_review_queue() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF billing.actor_kind(billing._actor()) <> 'user' OR NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'org_id', p.org_id, 'workspace', w.name, 'legal_name', p.legal_name, 'country', p.country, 'tax_id', p.tax_id,
      'tax_id_kind', p.tax_id_kind, 'vies_status', p.vies_status, 'vies_checked_at', p.vies_checked_at,
      'review_reason', p.tax_review_reason, 'postal_code', p.postal_code, 'city', p.city, 'region', p.region,
      'billing_email', p.billing_email, 'version', p.version, 'since', p.updated_at,
      'blocked', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'source', CASE s.kind WHEN 'auto_recharge_blocked' THEN 'auto_recharge' ELSE 'checkout' END,
            'net_cents', CASE s.kind WHEN 'auto_recharge_blocked' THEN (SELECT r.pack_cents FROM billing.auto_recharge r WHERE r.org_id = s.org_id)
              ELSE (s.payload->>'net_cents')::bigint END,
            'at', s.created_at) ORDER BY s.created_at DESC), '[]'::jsonb)
          FROM billing.alert_state s WHERE s.org_id = p.org_id AND s.created_at >= p.updated_at
            AND (s.kind = 'top_up_tax_review' OR (s.kind = 'auto_recharge_blocked' AND s.payload->>'reason' LIKE 'TAX_REVIEW%'))),
      'open_orders', (SELECT coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'kind', o.kind, 'net_cents', o.net_cents,
            'tax_treatment', o.tax_treatment, 'created_at', o.created_at) ORDER BY o.created_at DESC), '[]'::jsonb)
          FROM billing.top_up_order o WHERE o.org_id = p.org_id AND o.status = 'pending'))
      ORDER BY p.updated_at, p.org_id)
    FROM billing.billing_profile p JOIN evals.workspace w ON w.id = p.org_id AND w.deleted_at IS NULL
    WHERE p.tax_review_reason IS NOT NULL), '[]'::jsonb);
END $$;

-- Sets the treatment of a profile waiting for review, after the review
-- (§6.14). `p_version` is the profile version the admin reviewed: a profile
-- saved again since then is refused (TAX_REVIEW_CHANGED). The rules:
--   Canary Islands, Ceuta, Melilla (es_special_territory, a Spanish NIF):
--     they are outside the Spanish IVA territory (art. 3 LIVA) and the EU VAT
--     area. A business established there is not subject to Spanish IVA: B2B
--     services are located where the customer is established (art. 69.Uno.1º
--     LIVA) and it accounts for IGIC or IPSI itself → non_eu_not_subject
--     ("Operación no sujeta"). When the establishment that receives the
--     service is in the IVA territory → es_vat (21 %). Never a reverse
--     charge: that is an intra-EU supply (modelo 349).
--   VIES unavailable (vies_unavailable, an EU VAT ID): eu_reverse_charge only
--     once the reviewer confirmed the number in VIES, with the consultation
--     number they got (kept on the profile, VIES status valid); otherwise
--     es_vat (without a valid VIES number an EU customer pays Spanish IVA),
--     and the VIES status stays unavailable so the next purchase checks again.
-- Platform admins (a person, never a service). Audited with before and after.
CREATE FUNCTION billing.resolve_tax_review(p_org_id uuid, p_version bigint, p_treatment text, p_vies_consultation text,
  p_reason text, p_request_id text DEFAULT NULL)
RETURNS billing.billing_profile
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor text := billing._ops_admin(p_org_id); p billing.billing_profile; r billing.billing_profile; v_reason text;
  consult text := nullif(btrim(p_vies_consultation), ''); reverse boolean;
BEGIN
  v_reason := billing._reason(p_reason, true);
  IF p_version IS NULL OR p_treatment IS NULL OR p_treatment NOT IN ('es_vat','eu_reverse_charge','non_eu_not_subject')
     OR (consult IS NOT NULL AND consult !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,99}$')
     OR (p_request_id IS NOT NULL AND length(p_request_id) > 200) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  PERFORM billing._lock_account(p_org_id);
  SELECT * INTO p FROM billing.billing_profile WHERE org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BILLING_PROFILE_REQUIRED'; END IF;
  IF p.tax_review_reason IS NULL THEN RAISE EXCEPTION 'TAX_REVIEW_NOT_PENDING'; END IF;
  IF p.version <> p_version THEN RAISE EXCEPTION 'TAX_REVIEW_CHANGED'; END IF;
  reverse := p_treatment = 'eu_reverse_charge';
  IF p.tax_review_reason = 'es_special_territory' THEN
    IF p.tax_id_kind <> 'es_nif' OR p.country <> 'ES' OR p_treatment NOT IN ('es_vat','non_eu_not_subject') OR consult IS NOT NULL THEN
      RAISE EXCEPTION 'TAX_TREATMENT_NOT_ALLOWED';
    END IF;
  ELSIF p.tax_review_reason = 'vies_unavailable' THEN
    IF p.tax_id_kind <> 'eu_vat' OR p.country = 'ES' OR p_treatment NOT IN ('es_vat','eu_reverse_charge') OR reverse <> (consult IS NOT NULL) THEN
      RAISE EXCEPTION 'TAX_TREATMENT_NOT_ALLOWED';
    END IF;
  ELSE
    RAISE EXCEPTION 'TAX_TREATMENT_NOT_ALLOWED';
  END IF;
  UPDATE billing.billing_profile SET tax_treatment = p_treatment, tax_review_reason = NULL,
    vies_status = CASE WHEN reverse THEN 'valid' ELSE vies_status END,
    vies_checked_at = CASE WHEN reverse THEN now() ELSE vies_checked_at END,
    vies_consultation = CASE WHEN reverse THEN consult ELSE vies_consultation END,
    version = version + 1, updated_by = actor, updated_at = now()
  WHERE org_id = p_org_id RETURNING * INTO r;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, actor, 'billing.tax_review_resolved', p_org_id::text, jsonb_build_object('reason', v_reason,
    'request_id', p_request_id, 'review_reason', p.tax_review_reason, 'country', p.country, 'postal_code', p.postal_code,
    'tax_id_kind', p.tax_id_kind,
    'before', jsonb_build_object('tax_treatment', p.tax_treatment, 'vies_status', p.vies_status, 'version', p.version),
    'after', jsonb_build_object('tax_treatment', r.tax_treatment, 'vies_status', r.vies_status, 'vies_consultation', r.vies_consultation,
      'version', r.version)));
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION billing.record_blocked_top_up(uuid, bigint), billing.tax_review_queue(),
  billing.resolve_tax_review(uuid, bigint, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.record_blocked_top_up(uuid, bigint), billing.tax_review_queue(),
  billing.resolve_tax_review(uuid, bigint, text, text, text, text) TO evals_runtime;

COMMIT;
