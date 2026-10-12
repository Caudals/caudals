-- Rollback for db/migrations/085_evals_signup_domains.sql.
--
-- Restores the 075 sign-up functions and drops the L-05 columns. It refuses
-- while any direct sign-up link exists: those rows are the evidence of where
-- an account came from and what the domain rule decided. Switch
-- SELF_SERVE_DIRECT_SIGNUP off and repair forward instead. It must run as a
-- role that bypasses row-level security, or the count could not see every
-- row. One transaction, so the guard holds even without ON_ERROR_STOP.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
  remaining bigint := 0;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  -- Dynamic SQL: a static reference would fail to plan once the column is gone.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'evals' AND table_name = 'self_serve_signup' AND column_name = 'signup_source') THEN
    EXECUTE 'SELECT count(*) FROM evals.self_serve_signup WHERE signup_source = ''direct''' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % direct sign-up records exist. Switch SELF_SERVE_DIRECT_SIGNUP off and repair forward instead.', remaining;
  END IF;
END $$;

-- The 075 request function, self-contained again.
CREATE OR REPLACE FUNCTION evals.request_self_serve_signup(digest text, p_email text, p_workspace_name text, p_demo_run_id uuid, p_locale text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE existing boolean;
BEGIN
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(p_email) > 254 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.auth_user u WHERE lower(u.email) = lower(p_email)) INTO existing;
  IF existing THEN RETURN true; END IF;
  -- At most three live links per address.
  IF (SELECT count(*) FROM evals.self_serve_signup s WHERE lower(s.email) = lower(p_email) AND s.created_at > now() - interval '1 day') >= 3 THEN
    RAISE EXCEPTION 'SIGNUP_LIMIT';
  END IF;
  INSERT INTO evals.self_serve_signup (token_hash, email, workspace_name, demo_run_id, locale, expires_at)
    VALUES (digest, lower(p_email), left(btrim(p_workspace_name), 160), p_demo_run_id, p_locale, now() + interval '2 days');
  RETURN false;
END $$;

DROP FUNCTION IF EXISTS evals.request_self_serve_signup(text, text, text, uuid, text, text, text, boolean, jsonb);

DROP FUNCTION IF EXISTS evals.self_serve_signup_lookup(text);
CREATE FUNCTION evals.self_serve_signup_lookup(digest text)
RETURNS TABLE (email text, workspace_name text, locale text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT s.email, s.workspace_name, s.locale FROM evals.self_serve_signup s
  WHERE s.token_hash = digest AND s.consumed_at IS NULL AND s.expires_at > now()
    AND NOT EXISTS (SELECT 1 FROM public.auth_user u WHERE lower(u.email) = lower(s.email))
$$;

DROP FUNCTION IF EXISTS evals.enroll_self_serve(text, text, text, text, text);
CREATE FUNCTION evals.enroll_self_serve(digest text, display_name text, password_hash text, p_user_id text, p_account_id text)
RETURNS TABLE (org_id uuid, demo_run_id uuid, email text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE s evals.self_serve_signup; workspace_id uuid;
BEGIN
  SELECT * INTO s FROM evals.self_serve_signup x WHERE x.token_hash = digest FOR UPDATE;
  IF s.id IS NULL OR s.consumed_at IS NOT NULL OR s.expires_at <= now()
     OR EXISTS (SELECT 1 FROM public.auth_user u WHERE lower(u.email) = lower(s.email)) THEN
    RAISE EXCEPTION 'SCOPE_DENIED';
  END IF;
  IF length(display_name) NOT BETWEEN 1 AND 120 OR length(password_hash) NOT BETWEEN 64 AND 256 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  INSERT INTO public.auth_user (id, name, email, "emailVerified", "createdAt", "updatedAt")
    VALUES (p_user_id, display_name, lower(s.email), true, now(), now());
  INSERT INTO public.auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    VALUES (p_account_id, p_user_id, 'credential', p_user_id, password_hash, now(), now());
  INSERT INTO evals.workspace (name, created_by) VALUES (s.workspace_name, p_user_id) RETURNING id INTO workspace_id;
  INSERT INTO evals.membership (org_id, user_id, role) VALUES (workspace_id, p_user_id, 'owner');
  UPDATE evals.workspace_entitlement SET
    plan = 'free', max_active_runs = 1,
    allowed_connection_types = ARRAY['website','openai_compatible','https_json']::text[],
    can_schedule = false, can_export = true, review_allowance = 0,
    max_systems = 1, max_tests_per_set = 50, max_runs_per_month = 3,
    version = version + 1, updated_by = p_user_id, updated_at = now()
  WHERE workspace_entitlement.org_id = workspace_id;
  UPDATE evals.self_serve_signup SET consumed_at = now(), org_id = workspace_id WHERE id = s.id;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id) VALUES (workspace_id, p_user_id, 'workspace.self_serve_created', workspace_id::text);
  RETURN QUERY SELECT workspace_id, s.demo_run_id, s.email;
END $$;

REVOKE ALL ON FUNCTION evals.request_self_serve_signup(text, text, text, uuid, text), evals.self_serve_signup_lookup(text),
  evals.enroll_self_serve(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.request_self_serve_signup(text, text, text, uuid, text), evals.self_serve_signup_lookup(text),
  evals.enroll_self_serve(text, text, text, text, text) TO evals_runtime;

DROP FUNCTION IF EXISTS evals.self_serve_domain_taken(text);
DROP INDEX IF EXISTS evals.self_serve_signup_domain;
ALTER TABLE evals.self_serve_signup
  DROP COLUMN IF EXISTS attribution,
  DROP COLUMN IF EXISTS domain_rule,
  DROP COLUMN IF EXISTS email_domain,
  DROP COLUMN IF EXISTS signup_source;
DELETE FROM public.evals_migration_history WHERE name = '085_evals_signup_domains.sql';

COMMIT;
