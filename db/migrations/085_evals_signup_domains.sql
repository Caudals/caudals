-- Launch L-05 (spec v2, P-03, D-07, §6.15): direct work-email sign-up.
--
-- A second registration path beside the public demo: /workspace/start emails
-- the same one-time link (only its sha256 is stored, two days, single use)
-- and the same free-plan enrollment as migration 075, with no demo run.
--
-- Each sign-up link now records where it came from (`signup_source`), the
-- registrable domain of the address (`email_domain`, indexed), whether the
-- one-workspace-per-domain rule applies (`domain_rule`; off for demo links
-- and for addresses on the ops exception list) and the sanitized first-touch
-- attribution the request carried. The rule itself lives in the functions:
-- while any live self-serve workspace exists for the domain, a request
-- returns 'domain_taken' (the caller emails "ask the owner for an
-- invitation") and an enrollment raises SIGNUP_DOMAIN_TAKEN. Enrollment takes
-- a transaction advisory lock per domain, so two links for the same company
-- cannot both create a workspace.
--
-- The demo path keeps its behaviour: the five-argument request function
-- delegates with source 'demo' and the rule off. The lookup and enrollment
-- functions return one more column each (`signup_source`, plus
-- `attribution` on enrollment); callers select columns by name, so an image
-- from before this migration keeps working against it.
--
-- Forward repair: additive columns, one index, new functions. The rollback
-- restores the 075 functions and refuses while direct sign-ups exist.
BEGIN;

ALTER TABLE evals.self_serve_signup
  ADD COLUMN signup_source text NOT NULL DEFAULT 'demo'
    CONSTRAINT self_serve_signup_source CHECK (signup_source IN ('demo','direct')),
  ADD COLUMN email_domain text
    CONSTRAINT self_serve_signup_email_domain CHECK (email_domain IS NULL OR (
      length(email_domain) BETWEEN 3 AND 253 AND email_domain = lower(email_domain) AND email_domain !~ '[@[:space:]]')),
  ADD COLUMN domain_rule boolean NOT NULL DEFAULT false,
  ADD COLUMN attribution jsonb NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT self_serve_signup_attribution CHECK (jsonb_typeof(attribution) = 'object' AND octet_length(attribution::text) <= 4096);

-- Links issued before this migration came from the demo; their domain is the address's host.
UPDATE evals.self_serve_signup SET email_domain = lower(split_part(email, '@', 2)) WHERE email_domain IS NULL;

CREATE INDEX self_serve_signup_domain ON evals.self_serve_signup (email_domain) WHERE org_id IS NOT NULL;

-- Whether a live workspace created through self-serve sign-up (demo or
-- direct, whatever its plan today) exists for the domain. Called only from
-- the SECURITY DEFINER functions below.
CREATE FUNCTION evals.self_serve_domain_taken(p_domain text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, evals AS $$
  SELECT EXISTS (
    SELECT 1 FROM evals.self_serve_signup s JOIN evals.workspace w ON w.id = s.org_id
    WHERE s.email_domain = p_domain AND s.org_id IS NOT NULL AND w.deleted_at IS NULL
  )
$$;
REVOKE ALL ON FUNCTION evals.self_serve_domain_taken(text) FROM PUBLIC;

-- Records a sign-up request. Returns 'account_exists' when an account
-- already uses the address (the caller emails a sign-in note), 'domain_taken'
-- when the domain rule applies and the company already has a workspace (the
-- caller emails "ask the owner for an invitation"), and otherwise 'link'
-- after storing the link. The caller's HTTP response is the same in every
-- case. p_domain is the address's registrable domain: its host or a parent.
CREATE FUNCTION evals.request_self_serve_signup(
  digest text, p_email text, p_workspace_name text, p_demo_run_id uuid, p_locale text,
  p_source text, p_domain text, p_domain_rule boolean, p_attribution jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  v_host text;
  v_domain text;
BEGIN
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(p_email) > 254 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF p_source IS NULL OR p_source NOT IN ('demo','direct') OR (p_source = 'direct' AND p_demo_run_id IS NOT NULL) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  v_host := lower(split_part(p_email, '@', 2));
  v_domain := lower(coalesce(p_domain, v_host));
  IF position('.' IN v_domain) = 0 OR NOT (v_host = v_domain OR right(v_host, length(v_domain) + 1) = '.' || v_domain) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  IF jsonb_typeof(coalesce(p_attribution, '{}'::jsonb)) <> 'object' OR octet_length(coalesce(p_attribution, '{}'::jsonb)::text) > 4096 THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auth_user u WHERE lower(u.email) = lower(p_email)) THEN RETURN 'account_exists'; END IF;
  IF coalesce(p_domain_rule, false) AND evals.self_serve_domain_taken(v_domain) THEN RETURN 'domain_taken'; END IF;
  -- At most three live links per address.
  IF (SELECT count(*) FROM evals.self_serve_signup s WHERE lower(s.email) = lower(p_email) AND s.created_at > now() - interval '1 day') >= 3 THEN
    RAISE EXCEPTION 'SIGNUP_LIMIT';
  END IF;
  INSERT INTO evals.self_serve_signup (token_hash, email, workspace_name, demo_run_id, locale, expires_at,
      signup_source, email_domain, domain_rule, attribution)
    VALUES (digest, lower(p_email), left(btrim(p_workspace_name), 160), p_demo_run_id, p_locale, now() + interval '2 days',
      p_source, v_domain, coalesce(p_domain_rule, false), coalesce(p_attribution, '{}'::jsonb));
  RETURN 'link';
END $$;

-- The demo's original signature, unchanged in behaviour: true when an
-- account already uses the address.
CREATE OR REPLACE FUNCTION evals.request_self_serve_signup(digest text, p_email text, p_workspace_name text, p_demo_run_id uuid, p_locale text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  RETURN evals.request_self_serve_signup(digest, p_email, p_workspace_name, p_demo_run_id, p_locale, 'demo', NULL, false, '{}'::jsonb) = 'account_exists';
END $$;

-- What the sign-up page shows for a live link, now with where it came from.
DROP FUNCTION evals.self_serve_signup_lookup(text);
CREATE FUNCTION evals.self_serve_signup_lookup(digest text)
RETURNS TABLE (email text, workspace_name text, locale text, signup_source text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT s.email, s.workspace_name, s.locale, s.signup_source FROM evals.self_serve_signup s
  WHERE s.token_hash = digest AND s.consumed_at IS NULL AND s.expires_at > now()
    AND NOT EXISTS (SELECT 1 FROM public.auth_user u WHERE lower(u.email) = lower(s.email))
$$;

-- Creates the account, a free-plan workspace with the person as owner, and
-- consumes the link (as in 075). A direct link under the domain rule is
-- refused when the company got a workspace after the link was issued.
DROP FUNCTION evals.enroll_self_serve(text, text, text, text, text);
CREATE FUNCTION evals.enroll_self_serve(digest text, display_name text, password_hash text, p_user_id text, p_account_id text)
RETURNS TABLE (org_id uuid, demo_run_id uuid, email text, signup_source text, attribution jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE s evals.self_serve_signup; workspace_id uuid;
BEGIN
  SELECT * INTO s FROM evals.self_serve_signup x WHERE x.token_hash = digest FOR UPDATE;
  IF s.id IS NULL OR s.consumed_at IS NOT NULL OR s.expires_at <= now()
     OR EXISTS (SELECT 1 FROM public.auth_user u WHERE lower(u.email) = lower(s.email)) THEN
    RAISE EXCEPTION 'SCOPE_DENIED';
  END IF;
  IF length(display_name) NOT BETWEEN 1 AND 120 OR length(password_hash) NOT BETWEEN 64 AND 256 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF s.domain_rule THEN
    -- One enrollment per domain at a time; the check sees every committed one.
    PERFORM pg_advisory_xact_lock(hashtext('caudals-self-serve-domain:' || s.email_domain));
    IF evals.self_serve_domain_taken(s.email_domain) THEN RAISE EXCEPTION 'SIGNUP_DOMAIN_TAKEN'; END IF;
  END IF;
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
  RETURN QUERY SELECT workspace_id, s.demo_run_id, s.email, s.signup_source, s.attribution;
END $$;

REVOKE ALL ON FUNCTION evals.request_self_serve_signup(text, text, text, uuid, text, text, text, boolean, jsonb),
  evals.request_self_serve_signup(text, text, text, uuid, text), evals.self_serve_signup_lookup(text),
  evals.enroll_self_serve(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.request_self_serve_signup(text, text, text, uuid, text, text, text, boolean, jsonb),
  evals.request_self_serve_signup(text, text, text, uuid, text), evals.self_serve_signup_lookup(text),
  evals.enroll_self_serve(text, text, text, text, text) TO evals_runtime;

COMMIT;
