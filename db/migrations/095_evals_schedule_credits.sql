-- Schedules on credits and regression summaries (launch spec v2 P-24, P-25,
-- §6.7, §6.10, package L-18).
--
--   billing.spend_cap      scope 'schedule' already exists (091): one credit
--                          cap per schedule, on the credits that schedule's
--                          runs use in a UTC month. set_spend_cap now accepts
--                          a schedule cap only for a schedule of the same
--                          workspace (it was unchecked).
--   schedule_dispatch      `admission`: what the credit check saw when the
--                          slot was dispatched (mode, p90 estimate, available
--                          credits, the schedule's cap and its spend this
--                          month, and the verdict), so a skip and its alert
--                          are reproducible.
--   notification email     `schedule_skipped` (a run skipped for credits or a
--                          cap) goes to owners who keep billing email on, like
--                          the other billing alerts; `monitor_regression` is
--                          emailed to members who keep the regressions
--                          category on, which Settings → Notifications shows
--                          as on until a person saves a choice (operators
--                          still need to opt in). Workspaces with a
--                          regression notice are now picked up for delivery.
--
-- Additive: one nullable column and new function bodies. The rollback restores
-- the 091 and 087 functions and refuses while any admission is recorded.
BEGIN;

/* ------------------------------------------------- dispatch admission --- */

ALTER TABLE evals.schedule_dispatch ADD COLUMN admission jsonb
  CHECK (admission IS NULL OR jsonb_typeof(admission) = 'object');
GRANT UPDATE (admission) ON evals.schedule_dispatch TO evals_runtime;

/* ------------------------------------------------------- schedule caps --- */

-- Spend caps (§6.10): p_cap_ucr and p_p90_multiplier NULL restore the default.
-- A schedule cap must name a schedule of this workspace.
CREATE OR REPLACE FUNCTION billing.set_spend_cap(p_org_id uuid, p_scope text, p_subject_id uuid, p_cap_ucr bigint,
  p_p90_multiplier numeric DEFAULT NULL, p_request_id text DEFAULT NULL)
RETURNS billing.spend_cap
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c billing.spend_cap;
BEGIN
  PERFORM billing._owner(p_org_id);
  IF p_scope IS NULL OR p_scope NOT IN ('workspace_monthly','per_run','schedule') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF p_scope = 'schedule' AND (p_subject_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM evals.monitor_schedule s WHERE s.org_id = p_org_id AND s.id = p_subject_id)) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  IF p_scope <> 'schedule' AND p_subject_id IS NOT NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  PERFORM billing._lock_account(p_org_id);
  INSERT INTO billing.spend_cap AS sc (org_id, scope, subject_id, cap_ucr, p90_multiplier, updated_by)
  VALUES (p_org_id, p_scope, p_subject_id, p_cap_ucr, p_p90_multiplier, billing._actor())
  ON CONFLICT (org_id, scope, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET cap_ucr = EXCLUDED.cap_ucr, p90_multiplier = EXCLUDED.p90_multiplier, updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO c;
  PERFORM billing._audit_event(p_org_id, 'billing.spend_cap_saved', c.id::text, jsonb_build_object(
    'scope', c.scope, 'subject_id', c.subject_id, 'cap_ucr', c.cap_ucr, 'p90_multiplier', c.p90_multiplier, 'request_id', p_request_id));
  RETURN c;
END $$;

/* ------------------------------------------------- notification email --- */

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

-- Workspaces with notices to email: a regression notice counts on its own
-- (its recipients follow the regressions category above).
CREATE OR REPLACE FUNCTION evals.notification_due_workspaces()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT DISTINCT n.org_id FROM evals.notification n
  WHERE n.created_at > now() - interval '3 days'
    AND ((n.kind IN ('report_published','run_failed','input_required','test_set_ready','generation_failed','website_failed','document_failed','export_failed')
      AND EXISTS (SELECT 1 FROM evals.notification_preference p WHERE p.org_id = n.org_id
        AND (p.email_completion OR p.email_required_input OR p.email_failure)))
      OR n.kind = 'monitor_regression')
  LIMIT 200
$$;

COMMIT;
