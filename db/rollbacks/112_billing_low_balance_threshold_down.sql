-- Rollback for db/migrations/112_billing_low_balance_threshold.sql.
--
-- Drops the low-balance threshold setting, the price-check
-- acknowledgements and the manual tax-review functions, and restores the 095
-- billing alert recipients (without 'unusual_spend'). It refuses once an
-- owner stored a threshold or an admin acknowledged a price check: those are
-- owner settings and ops records; repair forward instead. Profiles whose
-- treatment an admin set after a review keep it (the table allows it; only
-- new reviews need the function), and the refused-purchase rows in
-- billing.alert_state stay as history. Run it as a role that bypasses
-- row-level security, or the counts could not see every row. One transaction.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  IF EXISTS (SELECT 1 FROM billing.alert_setting) THEN
    RAISE EXCEPTION 'Rollback blocked: owners saved low-balance thresholds; repair forward instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM billing.price_check_ack) THEN
    RAISE EXCEPTION 'Rollback blocked: price checks were acknowledged; repair forward instead.';
  END IF;
END $$;

DROP FUNCTION billing.resolve_tax_review(uuid, bigint, text, text, text, text);
DROP FUNCTION billing.tax_review_queue();
DROP FUNCTION billing.record_blocked_top_up(uuid, bigint);

DROP FUNCTION billing.acknowledge_price_check(uuid, text);
DROP FUNCTION billing.price_check_status();
DROP TABLE billing.price_check_ack;
DROP FUNCTION billing.price_check_alerting(jsonb);
DROP FUNCTION billing.price_check_fingerprint(uuid, jsonb);

DROP FUNCTION billing.set_low_balance_threshold(uuid, bigint, text);
DROP TABLE billing.alert_setting;

-- The 095 body.
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
      WHEN p_kind IN ('low_balance','auto_recharge_succeeded','auto_recharge_failed','credits_expiring','cap_reached','schedule_skipped')
        THEN m.role = 'owner' AND COALESCE(p.email_billing, true)
      ELSE false END
$$;
REVOKE ALL ON FUNCTION evals.notification_email_recipients(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.notification_email_recipients(uuid, text) TO evals_runtime;

COMMIT;
