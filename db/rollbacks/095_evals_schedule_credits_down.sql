-- Rollback for db/migrations/095_evals_schedule_credits.sql.
--
-- Restores billing.set_spend_cap (091), evals.notification_email_recipients and
-- evals.notification_due_workspaces (087), and drops schedule_dispatch.admission.
-- It refuses once any dispatch recorded an admission: that is the evidence
-- behind a skipped run and its alert. Switch schedules off for the workspace
-- (pause them) and repair forward instead. Schedule caps already saved stay
-- valid under 091. Run it as a role that bypasses row-level security, or the
-- count could not see every row. One transaction.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  IF EXISTS (SELECT 1 FROM evals.schedule_dispatch WHERE admission IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback blocked: scheduled dispatches recorded a credit admission; repair forward instead.';
  END IF;
END $$;

ALTER TABLE evals.schedule_dispatch DROP COLUMN admission;

CREATE OR REPLACE FUNCTION billing.set_spend_cap(p_org_id uuid, p_scope text, p_subject_id uuid, p_cap_ucr bigint,
  p_p90_multiplier numeric DEFAULT NULL, p_request_id text DEFAULT NULL)
RETURNS billing.spend_cap
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c billing.spend_cap;
BEGIN
  PERFORM billing._owner(p_org_id);
  IF p_scope IS NULL OR p_scope NOT IN ('workspace_monthly','per_run','schedule') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
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
      WHEN p_kind IN ('monitor_regression') THEN COALESCE(p.email_regressions, false)
      WHEN p_kind IN ('low_balance','auto_recharge_succeeded','auto_recharge_failed','credits_expiring','cap_reached')
        THEN m.role = 'owner' AND COALESCE(p.email_billing, true)
      ELSE false END
$$;

CREATE OR REPLACE FUNCTION evals.notification_due_workspaces()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT DISTINCT n.org_id FROM evals.notification n
  WHERE n.created_at > now() - interval '3 days'
    AND n.kind IN ('report_published','run_failed','input_required','test_set_ready','generation_failed','website_failed','document_failed','export_failed')
    AND EXISTS (SELECT 1 FROM evals.notification_preference p WHERE p.org_id = n.org_id
      AND (p.email_completion OR p.email_required_input OR p.email_failure))
  LIMIT 200
$$;

COMMIT;
