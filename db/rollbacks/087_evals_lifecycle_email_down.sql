-- Rollback for db/migrations/087_evals_lifecycle_email.sql.
--
-- Restores the 065 notification functions and drops the L-07 objects. It
-- refuses while lifecycle email has been recorded or anyone has unsubscribed:
-- those rows are the evidence of what was sent and of an opt-out that must be
-- honoured. Switch LIFECYCLE_EMAILS_ENABLED off and repair forward instead.
-- It must run as a role that bypasses row-level security, or the counts could
-- not see every row. One transaction, so the guard holds even without
-- ON_ERROR_STOP.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
  sent bigint := 0;
  opted_out bigint := 0;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  IF to_regclass('evals.lifecycle_email') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM evals.lifecycle_email' INTO sent;
  END IF;
  IF to_regclass('evals.email_preference') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM evals.email_preference WHERE NOT lifecycle' INTO opted_out;
  END IF;
  IF sent > 0 OR opted_out > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % lifecycle email records and % opt-outs exist. Switch LIFECYCLE_EMAILS_ENABLED off and repair forward instead.', sent, opted_out;
  END IF;
END $$;

DROP FUNCTION IF EXISTS evals.lifecycle_email_candidates(integer);
DROP FUNCTION IF EXISTS evals.lifecycle_email_claim(text, uuid, text, text);
DROP FUNCTION IF EXISTS evals.lifecycle_email_finish(text, text, boolean, text, text);
DROP FUNCTION IF EXISTS evals.lifecycle_email_skip(text, uuid, text, text);
DROP FUNCTION IF EXISTS evals.email_unsubscribe(text);
DROP TABLE IF EXISTS evals.lifecycle_email;
DROP TABLE IF EXISTS evals.email_preference;

-- The 065 recipients function: one switch on top of the in-app categories.
DROP FUNCTION IF EXISTS evals.notification_email_recipients(uuid, text);
CREATE FUNCTION evals.notification_email_recipients(p_org_id uuid, p_kind text)
 RETURNS TABLE(user_id text, email text)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'evals', 'public'
AS $function$
  SELECT m.user_id, u.email
  FROM evals.membership m
  JOIN public.auth_user u ON u.id=m.user_id AND u."emailVerified"
  JOIN evals.notification_preference p ON p.org_id=m.org_id AND p.user_id=m.user_id AND p.email
  WHERE m.org_id=p_org_id AND p_org_id=evals.org_id()
    AND CASE
      WHEN p_kind IN ('report_published','test_set_ready') THEN p.completion
      WHEN p_kind IN ('run_failed','generation_failed','website_failed','document_failed','export_failed') THEN p.failure
      WHEN p_kind = 'input_required' THEN p.required_input
      ELSE false END
$function$;
REVOKE ALL ON FUNCTION evals.notification_email_recipients(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.notification_email_recipients(uuid, text) TO evals_runtime;

-- The 061 due-workspaces function.
CREATE OR REPLACE FUNCTION evals.notification_due_workspaces()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
  SELECT DISTINCT n.org_id FROM evals.notification n
  WHERE n.created_at>now()-interval '3 days' AND n.kind IN ('report_published','run_failed','input_required')
    AND EXISTS (SELECT 1 FROM evals.notification_preference p WHERE p.org_id=n.org_id AND p.email)
  LIMIT 200
$$;

-- The legacy `email` switch was kept in step by the application, so dropping
-- the per-category columns returns every person to their last switch state.
REVOKE UPDATE (email_completion, email_required_input, email_failure, email_billing, email_regressions)
  ON evals.notification_preference FROM evals_runtime;
ALTER TABLE evals.notification_preference
  DROP COLUMN IF EXISTS email_completion,
  DROP COLUMN IF EXISTS email_required_input,
  DROP COLUMN IF EXISTS email_failure,
  DROP COLUMN IF EXISTS email_billing,
  DROP COLUMN IF EXISTS email_regressions;

COMMIT;
