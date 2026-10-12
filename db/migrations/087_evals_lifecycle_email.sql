-- Launch L-07: branded EN/ES email, per-person email categories and the
-- lifecycle sequence (spec v2 P-37, P-38, §5.2 "Settings · Notifications").
--
-- 1. Per-workspace email categories on evals.notification_preference. Email
--    used to be one switch on top of the in-app categories; each category now
--    has its own email column, including billing and regressions. Existing
--    choices carry over: a category emails only where both the old switch and
--    the category were on. New evaluation categories stay opt-in; billing and
--    regression alerts default on (they protect money and quality).
-- 2. evals.email_preference: one row per person, across workspaces. It holds
--    the email language, the lifecycle ("getting started") category and the
--    unsubscribe token for that non-essential mail. The token is readable
--    only through the SECURITY DEFINER functions below.
-- 3. evals.lifecycle_email: one row per (person, step). It is the dedupe
--    record: a step is claimed before it is sent, so each step sends at most
--    once, and conversions and missed windows are recorded as skipped.
--    Reached only through functions granted to the scheduler role.
--
-- Lifecycle mail is product mail to account holders about their own account.
-- It never reads or writes the newsletter (Caudals Ops) or outreach (Warmbly)
-- lists, and those systems never read these tables.
BEGIN;

/* ------------------------------------------- per-workspace categories --- */

ALTER TABLE evals.notification_preference
  ADD COLUMN email_completion boolean NOT NULL DEFAULT false,
  ADD COLUMN email_required_input boolean NOT NULL DEFAULT false,
  ADD COLUMN email_failure boolean NOT NULL DEFAULT false,
  ADD COLUMN email_billing boolean NOT NULL DEFAULT true,
  ADD COLUMN email_regressions boolean NOT NULL DEFAULT true;

UPDATE evals.notification_preference SET
  email_completion = email AND completion,
  email_required_input = email AND required_input,
  email_failure = email AND failure;

GRANT UPDATE (email_completion, email_required_input, email_failure, email_billing, email_regressions)
  ON evals.notification_preference TO evals_runtime;

/* ------------------------------------------------- per-person settings --- */

CREATE TABLE evals.email_preference (
  user_id text PRIMARY KEY REFERENCES public.auth_user(id) ON DELETE CASCADE,
  -- Language for email. NULL falls back to the sign-up language, then English.
  locale text CHECK (locale IS NULL OR locale IN ('en','es')),
  -- Non-essential "getting started" mail (the lifecycle sequence).
  lifecycle boolean NOT NULL DEFAULT true,
  lifecycle_unsubscribed_at timestamptz,
  -- 256 random bits from two v4 UUIDs (gen_random_uuid uses a strong source).
  unsubscribe_token text NOT NULL UNIQUE
    DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    CHECK (unsubscribe_token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE evals.email_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.email_preference FORCE ROW LEVEL SECURITY;
CREATE POLICY email_preference_own ON evals.email_preference
  USING (user_id = evals.actor_id()) WITH CHECK (user_id = evals.actor_id());
REVOKE ALL ON evals.email_preference FROM PUBLIC;
-- The token column is deliberately absent from the runtime grants.
GRANT SELECT (user_id, locale, lifecycle, lifecycle_unsubscribed_at, updated_at) ON evals.email_preference TO evals_runtime;
GRANT INSERT (user_id, locale, lifecycle, lifecycle_unsubscribed_at, updated_at) ON evals.email_preference TO evals_runtime;
GRANT UPDATE (locale, lifecycle, lifecycle_unsubscribed_at, updated_at) ON evals.email_preference TO evals_runtime;

/* ------------------------------------------------------ lifecycle log --- */

CREATE TABLE evals.lifecycle_email (
  user_id text NOT NULL REFERENCES public.auth_user(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('d0_welcome','d1_test_set','d3_run','d7_report','first_report','d21_rerun','d30_winback')),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  -- sending: claimed, provider call in flight · retry: send failed, may be
  -- reclaimed · sent · failed: gave up after three attempts · skipped: the
  -- person converted, the window passed or the step did not apply.
  status text NOT NULL CHECK (status IN ('sending','retry','sent','failed','skipped')),
  reason text CHECK (reason IS NULL OR reason ~ '^[a-z_]{1,40}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  locale text CHECK (locale IS NULL OR locale IN ('en','es')),
  provider_message_id text CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (user_id, step)
);
CREATE INDEX lifecycle_email_recent ON evals.lifecycle_email (user_id, sent_at DESC) WHERE status = 'sent';
ALTER TABLE evals.lifecycle_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.lifecycle_email FORCE ROW LEVEL SECURITY;
-- No policies and no grants: only the functions below read or write it.
REVOKE ALL ON evals.lifecycle_email FROM PUBLIC;

/* ------------------------------------------------- lifecycle functions --- */

-- Owners of live self-serve free workspaces who signed up in the last 45 days
-- and still accept lifecycle mail, with the facts each step decides on. Staff
-- accounts are excluded. Read only; the scheduler decides what is due.
CREATE FUNCTION evals.lifecycle_email_candidates(p_limit integer DEFAULT 200)
RETURNS TABLE (
  user_id text, org_id uuid, workspace_name text, email text, name text, locale text, signed_up_at timestamptz,
  has_test_set boolean, has_run boolean, has_report boolean, first_report_at timestamptz,
  shared boolean, runs_after_first_report integer, last_activity_at timestamptz,
  recorded jsonb, last_sent_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, public AS $$
  WITH cohort AS (
    SELECT DISTINCT ON (s.org_id) s.org_id, w.name AS workspace_name, m.user_id, u.email, u.name, s.locale AS signup_locale, s.consumed_at AS signed_up_at
    FROM evals.self_serve_signup s
    JOIN evals.workspace w ON w.id = s.org_id AND w.deleted_at IS NULL
    JOIN evals.workspace_entitlement e ON e.org_id = s.org_id AND e.plan = 'free'
    JOIN evals.membership m ON m.org_id = s.org_id AND m.role = 'owner'
    JOIN public.auth_user u ON u.id = m.user_id AND u."emailVerified"
    WHERE s.consumed_at IS NOT NULL AND s.consumed_at > now() - interval '45 days'
      AND NOT EXISTS (SELECT 1 FROM evals.platform_role r WHERE r.user_id = m.user_id)
      AND NOT EXISTS (SELECT 1 FROM evals.email_preference p WHERE p.user_id = m.user_id AND NOT p.lifecycle)
    ORDER BY s.org_id, m.created_at
  ), facts AS (
    SELECT c.*,
      (SELECT min(rr.created_at) FROM evals.report rp
         JOIN evals.report_revision rr ON rr.org_id = rp.org_id AND rr.report_id = rp.id
        WHERE rp.org_id = c.org_id AND rp.publication_status IN ('published','superseded')) AS first_report
    FROM cohort c
  )
  SELECT f.user_id, f.org_id, f.workspace_name, f.email, f.name,
    COALESCE(p.locale, f.signup_locale, 'en'),
    f.signed_up_at,
    EXISTS (SELECT 1 FROM evals.generation_job g WHERE g.org_id = f.org_id AND (g.status = 'needs_review' OR g.suite_version_id IS NOT NULL))
      OR EXISTS (SELECT 1 FROM evals.run r WHERE r.org_id = f.org_id),
    EXISTS (SELECT 1 FROM evals.run r WHERE r.org_id = f.org_id),
    f.first_report IS NOT NULL,
    f.first_report,
    EXISTS (SELECT 1 FROM evals.share_grant g WHERE g.org_id = f.org_id)
      OR EXISTS (SELECT 1 FROM evals.invitation i WHERE i.org_id = f.org_id)
      OR (SELECT count(*) FROM evals.membership m2 WHERE m2.org_id = f.org_id) > 1,
    (SELECT count(*)::integer FROM evals.run r WHERE r.org_id = f.org_id AND f.first_report IS NOT NULL AND r.created_at > f.first_report),
    GREATEST(
      f.signed_up_at,
      (SELECT max(r.created_at) FROM evals.run r WHERE r.org_id = f.org_id),
      (SELECT max(v.created_at) FROM evals.evaluation v WHERE v.org_id = f.org_id),
      (SELECT max(g.created_at) FROM evals.generation_job g WHERE g.org_id = f.org_id),
      (SELECT max(x."createdAt") FROM public.auth_session x WHERE x."userId" = f.user_id)),
    COALESCE((SELECT jsonb_object_agg(l.step, jsonb_build_object('status', l.status, 'attempts', l.attempts, 'updated_at', l.updated_at))
      FROM evals.lifecycle_email l WHERE l.user_id = f.user_id), '{}'::jsonb),
    (SELECT max(l.sent_at) FROM evals.lifecycle_email l WHERE l.user_id = f.user_id AND l.status = 'sent')
  FROM facts f
  LEFT JOIN evals.email_preference p ON p.user_id = f.user_id
  ORDER BY f.signed_up_at
  LIMIT LEAST(GREATEST(p_limit, 1), 1000)
$$;

-- Claims one step before the provider call. Returns the attempt number and
-- the person's unsubscribe token, or no row when the step is already sent,
-- skipped, given up, or claimed by another tick in the last 15 minutes.
CREATE FUNCTION evals.lifecycle_email_claim(p_user_id text, p_org_id uuid, p_step text, p_locale text)
RETURNS TABLE (attempt integer, unsubscribe_token text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE v_attempt integer;
BEGIN
  INSERT INTO evals.lifecycle_email AS l (user_id, step, org_id, status, attempts, locale)
    VALUES (p_user_id, p_step, p_org_id, 'sending', 1, p_locale)
  ON CONFLICT (user_id, step) DO UPDATE SET status = 'sending', attempts = l.attempts + 1, locale = EXCLUDED.locale, updated_at = now()
    WHERE l.attempts < 3 AND (l.status = 'retry' OR (l.status = 'sending' AND l.updated_at < now() - interval '15 minutes'))
  RETURNING l.attempts INTO v_attempt;
  IF v_attempt IS NULL THEN RETURN; END IF;
  INSERT INTO evals.email_preference (user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT v_attempt, p.unsubscribe_token FROM evals.email_preference p WHERE p.user_id = p_user_id;
END $$;

-- Records the outcome of a claimed send: sent, retry (attempts left) or failed.
CREATE FUNCTION evals.lifecycle_email_finish(p_user_id text, p_step text, p_sent boolean, p_message_id text, p_reason text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  UPDATE evals.lifecycle_email SET
    status = CASE WHEN p_sent THEN 'sent' WHEN attempts >= 3 THEN 'failed' ELSE 'retry' END,
    sent_at = CASE WHEN p_sent THEN now() END,
    provider_message_id = CASE WHEN p_sent THEN left(p_message_id, 200) END,
    reason = CASE WHEN p_sent THEN NULL ELSE p_reason END,
    updated_at = now()
  WHERE user_id = p_user_id AND step = p_step AND status = 'sending'
$$;

-- Records a step that will never send (converted, window passed, not applicable).
CREATE FUNCTION evals.lifecycle_email_skip(p_user_id text, p_org_id uuid, p_step text, p_reason text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  INSERT INTO evals.lifecycle_email (user_id, step, org_id, status, reason)
    VALUES (p_user_id, p_step, p_org_id, 'skipped', p_reason)
  ON CONFLICT (user_id, step) DO UPDATE SET status = 'skipped', reason = EXCLUDED.reason, updated_at = now()
    WHERE evals.lifecycle_email.status = 'retry'
$$;

REVOKE ALL ON FUNCTION evals.lifecycle_email_candidates(integer), evals.lifecycle_email_claim(text, uuid, text, text),
  evals.lifecycle_email_finish(text, text, boolean, text, text), evals.lifecycle_email_skip(text, uuid, text, text) FROM PUBLIC;
-- The scheduler only: these see account email addresses across workspaces.
GRANT EXECUTE ON FUNCTION evals.lifecycle_email_candidates(integer), evals.lifecycle_email_claim(text, uuid, text, text),
  evals.lifecycle_email_finish(text, text, boolean, text, text), evals.lifecycle_email_skip(text, uuid, text, text) TO evals_scheduler;

/* -------------------------------------------------------- unsubscribe --- */

-- One-click unsubscribe from lifecycle mail by the token in the email (no
-- sign-in). Idempotent. Returns the person's email language, or NULL for an
-- unknown token, so the page can answer in the right language.
CREATE FUNCTION evals.email_unsubscribe(p_token text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE v_locale text; v_found boolean := false;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  UPDATE evals.email_preference SET lifecycle = false,
    lifecycle_unsubscribed_at = COALESCE(lifecycle_unsubscribed_at, now()), updated_at = now()
  WHERE unsubscribe_token = p_token
  RETURNING true, COALESCE(locale, 'en') INTO v_found, v_locale;
  RETURN CASE WHEN v_found THEN v_locale END;
END $$;
REVOKE ALL ON FUNCTION evals.email_unsubscribe(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.email_unsubscribe(text) TO evals_runtime;

/* ------------------------------------------------ notification email --- */

-- Recipients per category, now with each person's email language. Billing
-- alerts go to owners unless they switched billing email off; the other
-- categories need an explicit opt-in row.
DROP FUNCTION evals.notification_email_recipients(uuid, text);
CREATE FUNCTION evals.notification_email_recipients(p_org_id uuid, p_kind text)
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
REVOKE ALL ON FUNCTION evals.notification_email_recipients(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.notification_email_recipients(uuid, text) TO evals_runtime;

-- Workspaces with notices to email. Before, a workspace whose only notice was
-- a test set, a source or an export failure was never picked up.
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
