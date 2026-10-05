-- Public demo (caudals.com/demo) and self-serve free workspaces.
--
-- demo.run holds one anonymous eight-question test of a visitor's AI system:
-- the pages read, the generated questions, the answers and the verdicts. It
-- never holds credentials (API keys live only in the web process's memory)
-- and is deleted seven days after creation unless a sign-up claimed it.
-- The web process (evals_runtime) runs the engine; the browser worker
-- (evals_browser) reads pages and asks website chatbots.
--
-- Self-serve sign-up mirrors the invitation pattern: a one-time emailed token
-- (only its sha256 is stored) lets the web process create the account, the
-- workspace and its free-plan entitlement in one SECURITY DEFINER call.
--
-- Forward repair: every object is additive. The rollback drops the demo
-- schema, the sign-up table and functions, the plan triggers and columns.
BEGIN;

CREATE SCHEMA demo;

CREATE TABLE demo.run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  locale text NOT NULL CHECK (locale IN ('en','es')),
  phase text NOT NULL DEFAULT 'reading'
    CHECK (phase IN ('reading','writing','asking','grading','done','failed')),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  target_kind text NOT NULL CHECK (target_kind IN ('website','openai_compatible','https_json')),
  target_url text NOT NULL CHECK (length(target_url) <= 2048),
  target_host text NOT NULL CHECK (length(target_host) <= 253),
  -- Model name and request/response mapping. Never a credential.
  target_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  docs_url text NOT NULL CHECK (length(docs_url) <= 2048),
  docs_host text NOT NULL CHECK (length(docs_host) <= 253),
  language text CHECK (language IS NULL OR language IN ('en','es')),
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  verdicts jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb,
  -- Website work for the browser worker: reading pages a plain fetch could
  -- not, and asking the chatbot. Each is NULL when not needed.
  browser_docs text CHECK (browser_docs IN ('queued','running','done','failed')),
  browser_chat text CHECK (browser_chat IN ('queued','running','done','failed')),
  browser_pages jsonb,
  browser_error text CHECK (browser_error IS NULL OR browser_error ~ '^[a-z0-9_]{1,64}$'),
  browser_lease_until timestamptz,
  lease_owner text,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  llm_calls integer NOT NULL DEFAULT 0 CHECK (llm_calls >= 0),
  client_hash text NOT NULL CHECK (client_hash ~ '^[0-9a-f]{64}$'),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  claimed_at timestamptz
);
CREATE INDEX demo_run_active ON demo.run (lease_until) WHERE phase NOT IN ('done','failed');
CREATE INDEX demo_run_browser ON demo.run (created_at) WHERE browser_docs = 'queued' OR browser_chat = 'queued' OR browser_docs = 'running' OR browser_chat = 'running';
CREATE INDEX demo_run_created ON demo.run (created_at);
CREATE INDEX demo_run_expires ON demo.run (expires_at);

-- Model calls made on the demo's free quota, per UTC day.
CREATE TABLE demo.llm_usage (
  day date PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Spent proof-of-work challenges, so a solution cannot be replayed.
CREATE TABLE demo.challenge_use (
  digest text PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
  used_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA demo TO evals_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON demo.run, demo.llm_usage, demo.challenge_use TO evals_runtime;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evals_browser') THEN
    GRANT USAGE ON SCHEMA demo TO evals_browser;
    GRANT SELECT (id, phase, locale, target_kind, target_url, docs_url, language, cases, answers, browser_docs, browser_chat, browser_lease_until, expires_at, created_at, version)
      ON demo.run TO evals_browser;
    GRANT UPDATE (answers, browser_docs, browser_chat, browser_pages, browser_error, browser_lease_until, target_config, updated_at, version)
      ON demo.run TO evals_browser;
  END IF;
END $$;

/* ---------------------------------------------------- free plan limits --- */

ALTER TABLE evals.workspace_entitlement
  ADD COLUMN plan text NOT NULL DEFAULT 'managed' CHECK (plan IN ('managed','free')),
  ADD COLUMN max_systems integer CHECK (max_systems IS NULL OR max_systems >= 0),
  ADD COLUMN max_tests_per_set integer CHECK (max_tests_per_set IS NULL OR max_tests_per_set >= 1),
  ADD COLUMN max_runs_per_month integer CHECK (max_runs_per_month IS NULL OR max_runs_per_month >= 0);

-- Limits are enforced where the rows are written, so no code path skips them.
CREATE FUNCTION evals.enforce_plan_systems() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE cap integer;
BEGIN
  SELECT max_systems INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id;
  IF cap IS NOT NULL AND (SELECT count(*) FROM evals.target t WHERE t.org_id = NEW.org_id AND t.archived_at IS NULL) >= cap THEN
    RAISE EXCEPTION 'PLAN_LIMIT_SYSTEMS';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_plan_systems BEFORE INSERT ON evals.target
  FOR EACH ROW EXECUTE FUNCTION evals.enforce_plan_systems();

CREATE FUNCTION evals.enforce_plan_runs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE cap integer;
BEGIN
  SELECT max_runs_per_month INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id;
  IF cap IS NOT NULL AND (SELECT count(*) FROM evals.run r WHERE r.org_id = NEW.org_id
      AND r.created_at >= date_trunc('month', now())) >= cap THEN
    RAISE EXCEPTION 'PLAN_LIMIT_RUNS';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_plan_runs BEFORE INSERT ON evals.run
  FOR EACH ROW EXECUTE FUNCTION evals.enforce_plan_runs();

-- A larger request is trimmed to the plan's test count rather than refused.
CREATE FUNCTION evals.enforce_plan_tests() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE cap integer;
BEGIN
  SELECT max_tests_per_set INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id;
  IF cap IS NOT NULL AND NEW.requested_case_count > cap THEN
    NEW.requested_case_count := cap;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_plan_tests BEFORE INSERT ON evals.generation_job
  FOR EACH ROW EXECUTE FUNCTION evals.enforce_plan_tests();

REVOKE ALL ON FUNCTION evals.enforce_plan_systems(), evals.enforce_plan_runs(), evals.enforce_plan_tests() FROM PUBLIC;

/* --------------------------------------------------- self-serve sign-up --- */

CREATE TABLE evals.self_serve_signup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  workspace_name text NOT NULL CHECK (length(workspace_name) BETWEEN 1 AND 160),
  demo_run_id uuid REFERENCES demo.run(id) ON DELETE SET NULL,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','es')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  org_id uuid REFERENCES evals.workspace(id)
);
CREATE INDEX self_serve_signup_email ON evals.self_serve_signup (lower(email), created_at);
ALTER TABLE evals.self_serve_signup ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.self_serve_signup FORCE ROW LEVEL SECURITY;
-- No policies: the runtime reaches it only through the functions below.

-- Records a sign-up request. Returns whether an account already uses the
-- email, so the caller can send a sign-in note instead of a sign-up link.
CREATE FUNCTION evals.request_self_serve_signup(digest text, p_email text, p_workspace_name text, p_demo_run_id uuid, p_locale text)
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

-- What the sign-up page shows for a live link: the address and workspace name.
CREATE FUNCTION evals.self_serve_signup_lookup(digest text)
RETURNS TABLE (email text, workspace_name text, locale text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT s.email, s.workspace_name, s.locale FROM evals.self_serve_signup s
  WHERE s.token_hash = digest AND s.consumed_at IS NULL AND s.expires_at > now()
    AND NOT EXISTS (SELECT 1 FROM public.auth_user u WHERE lower(u.email) = lower(s.email))
$$;

-- Creates the account (email already proven by the link), a workspace on the
-- free plan with the person as owner, and consumes the link.
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

COMMIT;
