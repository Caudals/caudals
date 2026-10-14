-- Bring your own provider key (launch spec v2 §6.11, D-11, INV-11; L-27).
--
-- 1. Workspace scope. evals.provider_account, provider_revision and
--    provider_connection gain org_id: NULL is one of Caudals' own providers
--    (the platform); a workspace id is that workspace's own key (BYOK). A
--    revision and a connection take their org_id from the account, and it
--    never changes.
-- 2. Isolation. Row-level security on provider_connection: the admin login
--    sees platform rows only, the inference worker platform rows plus the
--    current workspace's own, and the web runtime nothing at all (it reads a
--    key's status through evals.byok_connections, which never returns the
--    envelope). A route may name a BYOK revision only from its own workspace
--    (workspace and evaluation routes), never as the platform default, so a
--    key serves only its own workspace's runs.
-- 3. Writes go through SECURITY DEFINER functions for workspace owners and
--    platform admins (connect, rotate, revoke, choose a model, go back to
--    Caudals' models). The web process encrypts; only the inference worker
--    decrypts. The envelope is bound to the workspace, the account and a
--    key version that changes on every save. No part of the key is stored in
--    clear (no hint).
-- 4. Billing (§6.3, §6.8). A BYOK revision costs Caudals nothing (price €0,
--    account ceiling 0) and carries no token credits: provider_revision_rate_key
--    reports it as free, so holds, captures, shadow entries and estimates are
--    0 for its calls. Platform meters (questions, pages, searches) still charge.
-- 5. Failures. The worker records the key's state (evals.byok_report) and
--    pauses the work with a customer_key_* reason. It never switches to a
--    Caudals key (INV-11). Removing a key removes the workspace's routes to
--    it in the same transaction, so later work uses Caudals' models only
--    because the owner chose so.
--
-- Forward repair: additive. The rollback refuses once a workspace has
-- connected a key.
BEGIN;
SET LOCAL lock_timeout = '10s';

/* ------------------------------------------------------ providers --- */

-- The five providers a workspace can connect (§6.11), at their fixed
-- OpenAI-compatible base addresses. A customer never supplies an address.
CREATE FUNCTION evals.byok_endpoint(p_provider text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_provider
    WHEN 'openai' THEN 'https://api.openai.com/v1'
    WHEN 'anthropic' THEN 'https://api.anthropic.com/v1'
    WHEN 'google' THEN 'https://generativelanguage.googleapis.com/v1beta/openai'
    WHEN 'mistral' THEN 'https://api.mistral.ai/v1'
    WHEN 'openrouter' THEN 'https://openrouter.ai/api/v1'
  END
$$;

/* ------------------------------------------------ workspace scope --- */

ALTER TABLE evals.provider_account ADD COLUMN org_id uuid REFERENCES evals.workspace(id);
ALTER TABLE evals.provider_revision ADD COLUMN org_id uuid REFERENCES evals.workspace(id);
ALTER TABLE evals.provider_connection
  ADD COLUMN org_id uuid REFERENCES evals.workspace(id),
  ADD COLUMN provider text CHECK (provider IS NULL OR provider IN ('openai','anthropic','google','mistral','openrouter')),
  -- Bound into the envelope; a new one on every save, so an old envelope never decrypts again.
  ADD COLUMN key_version uuid,
  -- The key's last known state: from the check at save, then from real calls.
  ADD COLUMN check_state text CHECK (check_state IS NULL OR check_state IN ('valid','quota_exceeded','invalid')),
  ADD COLUMN checked_at timestamptz,
  -- Model ids the key could list when it was saved (no secrets).
  ADD COLUMN models jsonb CHECK (models IS NULL OR (jsonb_typeof(models) = 'array' AND jsonb_array_length(models) <= 500)),
  ADD COLUMN rotated_at timestamptz,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by text;
ALTER TABLE evals.provider_connection ADD CONSTRAINT provider_connection_byok CHECK (
  (org_id IS NULL AND provider IS NULL AND key_version IS NULL AND check_state IS NULL AND models IS NULL AND revoked_at IS NULL)
  OR (org_id IS NOT NULL AND provider IS NOT NULL AND adapter = 'openai_compatible' AND key_hint IS NULL
      AND endpoint = evals.byok_endpoint(provider)
      AND (revoked_at IS NULL) = (envelope IS NOT NULL)
      AND (revoked_at IS NOT NULL OR (key_version IS NOT NULL AND check_state IS NOT NULL)))
);
-- One live key per provider and workspace (replace it to change it).
CREATE UNIQUE INDEX provider_connection_byok_live ON evals.provider_connection(org_id, provider)
  WHERE org_id IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX provider_account_byok ON evals.provider_account(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX provider_revision_byok ON evals.provider_revision(org_id) WHERE org_id IS NOT NULL;

-- A revision and a connection belong to their account's workspace, set here
-- and never changed (a revision is immutable anyway: migration 072).
CREATE FUNCTION evals.provider_scope_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE owner uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'immutable provider scope' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'provider_account' THEN RETURN NEW; END IF;
  SELECT a.org_id INTO owner FROM evals.provider_account a WHERE a.id = NEW.account_id;
  IF NEW.org_id IS NOT NULL AND NEW.org_id IS DISTINCT FROM owner THEN
    RAISE EXCEPTION 'provider scope mismatch' USING ERRCODE = '42501';
  END IF;
  NEW.org_id := owner;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION evals.provider_scope_stamp() FROM PUBLIC;
CREATE TRIGGER provider_scope BEFORE UPDATE OF org_id ON evals.provider_account
  FOR EACH ROW EXECUTE FUNCTION evals.provider_scope_stamp();
CREATE TRIGGER provider_scope BEFORE INSERT ON evals.provider_revision
  FOR EACH ROW EXECUTE FUNCTION evals.provider_scope_stamp();
CREATE TRIGGER provider_scope BEFORE INSERT OR UPDATE ON evals.provider_connection
  FOR EACH ROW EXECUTE FUNCTION evals.provider_scope_stamp();

/* -------------------------------------------- connection isolation --- */

ALTER TABLE evals.provider_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.provider_connection FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Settings → AI models for platform admins manages Caudals' own providers only.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evals_execution_admin') THEN
    CREATE POLICY platform_connections ON evals.provider_connection TO evals_execution_admin
      USING (org_id IS NULL) WITH CHECK (org_id IS NULL);
  END IF;
  -- The inference worker reads Caudals' keys and the current workspace's own.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evals_worker') THEN
    CREATE POLICY worker_connections ON evals.provider_connection FOR SELECT TO evals_worker
      USING (org_id IS NULL OR org_id = evals.org_id());
  END IF;
END $$;

/* ------------------------------------------------------ route guard --- */

-- The €0 guard (migration 088) gains the workspace scope: a BYOK revision
-- serves only its own workspace's routes and never the platform default. It
-- is priced by the customer's provider, so it needs no price or rate here.
CREATE OR REPLACE FUNCTION evals.assert_route_priced() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE p record; issue text; route_org uuid;
BEGIN
  SELECT pv.adapter, pv.endpoint, pv.model_id, pv.free_model, pv.org_id, pr.input_price, pr.output_price INTO p
  FROM evals.provider_revision pv
  JOIN evals.price_revision pr ON pr.id = NEW.price_revision_id AND pr.provider_revision_id = pv.id
  WHERE pv.id = NEW.provider_revision_id;
  -- A mismatched pair is left to the foreign keys.
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF p.org_id IS NOT NULL THEN
    route_org := CASE WHEN TG_TABLE_NAME = 'platform_model_route' THEN NULL ELSE (to_jsonb(NEW) ->> 'org_id')::uuid END;
    IF route_org IS DISTINCT FROM p.org_id THEN
      RAISE EXCEPTION 'BYOK_SCOPE_DENIED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  issue := billing.model_price_issue(p.adapter, p.endpoint, p.model_id, p.free_model, p.input_price, p.output_price);
  IF issue IS NOT NULL THEN RAISE EXCEPTION '%', issue USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;

-- Token credits (§6.11): a BYOK revision is never charged tokens. Engine
-- holds and captures (L-11), the shadow diff and the estimator (L-10) all
-- read the rate key, so "free" here means "no token credits": an explicit
-- free model or a workspace's own key.
CREATE OR REPLACE FUNCTION billing.provider_revision_rate_key(p_provider_revision_id uuid)
RETURNS TABLE (provider text, model_key text, free_model boolean, roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT billing.model_provider(p.adapter, p.endpoint), billing.model_key(billing.model_provider(p.adapter, p.endpoint), p.model_id),
    p.free_model OR p.org_id IS NOT NULL, p.roles
  FROM evals.provider_revision p WHERE p.id = p_provider_revision_id
$$;

-- Routes on a workspace's own key have no pricing issue.
CREATE OR REPLACE FUNCTION billing.route_price_issues(p_revision_id uuid DEFAULT NULL)
RETURNS TABLE (scope text, org_id uuid, evaluation_id uuid, role text, provider_revision_id uuid, provider text,
  model_id text, issue text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._privileged();
  RETURN QUERY
  WITH routes AS (
    SELECT 'platform'::text AS scope, NULL::uuid AS org_id, NULL::uuid AS evaluation_id, r.role, r.provider_revision_id, r.price_revision_id
    FROM evals.platform_model_route r
    UNION ALL SELECT 'workspace', r.org_id, NULL::uuid, r.role, r.provider_revision_id, r.price_revision_id FROM evals.generation_provider_route r
    UNION ALL SELECT 'evaluation', r.org_id, r.evaluation_id, r.role, r.provider_revision_id, r.price_revision_id FROM evals.evaluation_model_route r
  ), priced AS (
    SELECT x.*, pv.adapter, pv.endpoint, pv.model_id, pv.free_model, pv.org_id AS key_org, pr.input_price, pr.output_price,
      billing.model_provider(pv.adapter, pv.endpoint) AS provider
    FROM routes x JOIN evals.provider_revision pv ON pv.id = x.provider_revision_id
    JOIN evals.price_revision pr ON pr.id = x.price_revision_id
  )
  SELECT p.scope, p.org_id, p.evaluation_id, p.role, p.provider_revision_id, p.provider, p.model_id,
    CASE WHEN p.key_org IS NOT NULL THEN NULL
      WHEN p_revision_id IS NULL
      THEN billing.model_price_issue(p.adapter, p.endpoint, p.model_id, p.free_model, p.input_price, p.output_price)
      WHEN p.free_model THEN NULL
      WHEN p.adapter <> 'dgx' AND p.input_price = 0 AND p.output_price = 0 THEN 'MODEL_PRICE_ZERO'
      WHEN (billing.rate_for(p_revision_id, p.provider, p.model_id, 0)).id IS NULL THEN 'MODEL_RATE_MISSING'
    END AS issue
  FROM priced p
  ORDER BY 1, 2 NULLS FIRST, 3 NULLS FIRST, 4;
END $$;

/* ------------------------------------------------- owner functions --- */

-- The acting owner (or platform admin) of the workspace in scope. Paid
-- actions also need a plan other than free (§6.11: free workspaces keep
-- rejecting external API models).
CREATE FUNCTION evals._byok_actor(p_org_id uuid, p_paid boolean) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.actor_id(); workspace_plan text;
BEGIN
  IF p_org_id IS NULL OR p_org_id IS DISTINCT FROM evals.org_id() OR actor IS NULL
     OR NOT EXISTS (SELECT 1 FROM evals.workspace w WHERE w.id = p_org_id AND w.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'BYOK_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT (evals.is_admin() OR EXISTS (SELECT 1 FROM evals.membership m WHERE m.org_id = p_org_id AND m.user_id = actor AND m.role = 'owner')) THEN
    RAISE EXCEPTION 'BYOK_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_paid THEN
    SELECT e.plan INTO workspace_plan FROM evals.workspace_entitlement e WHERE e.org_id = p_org_id;
    IF workspace_plan IS NULL OR workspace_plan = 'free' THEN
      RAISE EXCEPTION 'BYOK_PLAN_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN actor;
END $$;

-- Connect a key: a workspace-scoped account and its connection, after the
-- web process checked the key with the provider and encrypted it.
CREATE FUNCTION evals.byok_connect(p_org_id uuid, p_account_id uuid, p_provider text, p_envelope jsonb,
  p_key_version uuid, p_check_state text, p_models jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals._byok_actor(p_org_id, true);
BEGIN
  IF evals.byok_endpoint(p_provider) IS NULL OR p_account_id IS NULL OR p_key_version IS NULL
     OR p_envelope IS NULL OR jsonb_typeof(p_envelope) <> 'object' OR p_check_state IS NULL OR p_check_state NOT IN ('valid','quota_exceeded')
     OR (p_models IS NOT NULL AND jsonb_typeof(p_models) <> 'array') THEN
    RAISE EXCEPTION 'INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('evals.byok:' || p_org_id::text, 0));
  IF EXISTS (SELECT 1 FROM evals.provider_connection c WHERE c.org_id = p_org_id AND c.provider = p_provider AND c.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'BYOK_EXISTS' USING ERRCODE = '23505';
  END IF;
  INSERT INTO evals.provider_account(id, name, currency, ceiling, enabled, org_id)
    VALUES (p_account_id, p_provider || ' (workspace key)', 'EUR', 0, true, p_org_id);
  INSERT INTO evals.provider_connection(account_id, adapter, endpoint, envelope, key_hint, created_by, org_id, provider,
      key_version, check_state, checked_at, models)
    VALUES (p_account_id, 'openai_compatible', evals.byok_endpoint(p_provider), p_envelope, NULL, actor, p_org_id, p_provider,
      p_key_version, p_check_state, now(), coalesce(p_models, '[]'::jsonb));
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
    VALUES (p_org_id, actor, 'byok.key.connected', p_account_id::text, jsonb_build_object('provider', p_provider, 'check', p_check_state));
  RETURN p_account_id;
END $$;

-- Replace a key: the old envelope is overwritten, its key version retired,
-- and the account's models are checked again on their next call.
CREATE FUNCTION evals.byok_rotate(p_org_id uuid, p_account_id uuid, p_envelope jsonb, p_key_version uuid,
  p_check_state text, p_models jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals._byok_actor(p_org_id, true); key_provider text;
BEGIN
  IF p_account_id IS NULL OR p_key_version IS NULL OR p_envelope IS NULL OR jsonb_typeof(p_envelope) <> 'object'
     OR p_check_state IS NULL OR p_check_state NOT IN ('valid','quota_exceeded')
     OR (p_models IS NOT NULL AND jsonb_typeof(p_models) <> 'array') THEN
    RAISE EXCEPTION 'INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE evals.provider_connection SET envelope = p_envelope, key_version = p_key_version, check_state = p_check_state,
      checked_at = now(), models = coalesce(p_models, models), rotated_at = now(), updated_at = now()
    WHERE account_id = p_account_id AND org_id = p_org_id AND revoked_at IS NULL
    RETURNING provider INTO key_provider;
  IF NOT FOUND THEN RAISE EXCEPTION 'BYOK_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  UPDATE evals.provider_health SET state = 'unprobed', circuit_until = NULL
    WHERE provider_revision_id IN (SELECT id FROM evals.provider_revision WHERE account_id = p_account_id);
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
    VALUES (p_org_id, actor, 'byok.key.rotated', p_account_id::text, jsonb_build_object('provider', key_provider, 'check', p_check_state));
  RETURN p_account_id;
END $$;

-- Remove a key: the envelope is erased, the account and its models retired,
-- and the workspace's routes to it removed, so the workspace explicitly goes
-- back to Caudals' models. Work already queued on the key fails with
-- customer_key_revoked; it is never moved to a Caudals key (INV-11).
-- Revoking needs no paid plan: anyone who may connect a key may remove it.
CREATE FUNCTION evals.byok_revoke(p_org_id uuid, p_account_id uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals._byok_actor(p_org_id, false); key_provider text; removed integer; pinned integer;
BEGIN
  UPDATE evals.provider_connection SET envelope = NULL, revoked_at = now(), revoked_by = actor, updated_at = now()
    WHERE account_id = p_account_id AND org_id = p_org_id AND revoked_at IS NULL
    RETURNING provider INTO key_provider;
  IF NOT FOUND THEN RAISE EXCEPTION 'BYOK_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  DELETE FROM evals.generation_provider_route r USING evals.provider_revision p
    WHERE r.org_id = p_org_id AND p.id = r.provider_revision_id AND p.account_id = p_account_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM evals.evaluation_model_route r USING evals.provider_revision p
    WHERE r.org_id = p_org_id AND p.id = r.provider_revision_id AND p.account_id = p_account_id;
  GET DIAGNOSTICS pinned = ROW_COUNT;
  -- Work paused on this key can no longer resume with it: it says so, and
  -- waiting grading and takeaways end (never moved to a Caudals key).
  UPDATE evals.workflow_step s SET reason_code = 'customer_key_revoked', updated_at = now()
    WHERE s.org_id = p_org_id AND s.status = 'paused' AND s.reason_code LIKE 'customer\_key\_%'
      AND s.input ->> 'providerRevisionId' IN (SELECT p.id::text FROM evals.provider_revision p WHERE p.account_id = p_account_id);
  UPDATE evals.execution_workflow w SET reason_code = 'customer_key_revoked', updated_at = now()
    WHERE w.org_id = p_org_id AND w.reason_code LIKE 'customer\_key\_%' AND EXISTS (
      SELECT 1 FROM evals.workflow_step s WHERE s.org_id = w.org_id AND s.workflow_id = w.id AND s.reason_code = 'customer_key_revoked');
  UPDATE evals.generation_job g SET reason_code = 'customer_key_revoked', updated_at = now()
    WHERE g.org_id = p_org_id AND g.status = 'paused' AND g.reason_code LIKE 'customer\_key\_%' AND EXISTS (
      SELECT 1 FROM evals.workflow_step s WHERE s.org_id = g.org_id AND s.workflow_id = g.workflow_id AND s.reason_code = 'customer_key_revoked');
  UPDATE evals.provider_revision SET retired_at = now() WHERE account_id = p_account_id AND retired_at IS NULL;
  UPDATE evals.provider_account SET enabled = false WHERE id = p_account_id;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
    VALUES (p_org_id, actor, 'byok.key.revoked', p_account_id::text,
      jsonb_build_object('provider', key_provider, 'routes_removed', removed + pinned));
  RETURN removed + pinned;
END $$;

-- A workspace being deleted loses every key with its other credentials
-- (spec §16.4): callable by the deletion workflow while a request is open.
CREATE FUNCTION evals.byok_revoke_for_deletion(p_org_id uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE revoked integer;
BEGIN
  IF p_org_id IS NULL OR p_org_id IS DISTINCT FROM evals.org_id() OR NOT EXISTS (
      SELECT 1 FROM evals.deletion_request d WHERE d.org_id = p_org_id AND d.status IN ('requested','processing')) THEN
    RAISE EXCEPTION 'BYOK_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  DELETE FROM evals.generation_provider_route r USING evals.provider_revision p
    WHERE r.org_id = p_org_id AND p.id = r.provider_revision_id AND p.org_id = p_org_id;
  DELETE FROM evals.evaluation_model_route r USING evals.provider_revision p
    WHERE r.org_id = p_org_id AND p.id = r.provider_revision_id AND p.org_id = p_org_id;
  UPDATE evals.provider_connection SET envelope = NULL, revoked_at = now(), revoked_by = coalesce(evals.actor_id(), 'service:deletion'), updated_at = now()
    WHERE org_id = p_org_id AND revoked_at IS NULL;
  GET DIAGNOSTICS revoked = ROW_COUNT;
  UPDATE evals.provider_revision SET retired_at = now() WHERE org_id = p_org_id AND retired_at IS NULL;
  UPDATE evals.provider_account SET enabled = false WHERE org_id = p_org_id AND enabled;
  RETURN revoked;
END $$;

-- Point engine roles at a model on the workspace's key: registers (or
-- reuses) a workspace-scoped revision with a €0 price, then sets the
-- workspace routes. Runs and jobs freeze their routes as before (078).
CREATE FUNCTION evals.byok_set_route(p_org_id uuid, p_account_id uuid, p_model_id text, p_roles text[], p_context_limit integer)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals._byok_actor(p_org_id, true);
  c evals.provider_connection;
  revision uuid; price uuid; item text; web boolean; capable boolean;
  context integer := coalesce(p_context_limit, 128000);
BEGIN
  IF p_model_id IS NULL OR p_model_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$'
     OR p_roles IS NULL OR cardinality(p_roles) = 0
     OR NOT (p_roles <@ ARRAY['context_analyzer','generator','judge','report_writer']::text[])
     OR context < 4096 OR context > 2000000 THEN
    RAISE EXCEPTION 'INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM evals.provider_connection
    WHERE account_id = p_account_id AND org_id = p_org_id AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BYOK_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  -- When the key listed its models, the choice must be one of them.
  IF jsonb_array_length(coalesce(c.models, '[]'::jsonb)) > 0 AND NOT (c.models ? p_model_id) THEN
    RAISE EXCEPTION 'BYOK_MODEL_UNKNOWN' USING ERRCODE = '22023';
  END IF;
  SELECT p.id INTO revision FROM evals.provider_revision p
    WHERE p.account_id = p_account_id AND p.model_id = p_model_id AND p.context_limit = context AND p.retired_at IS NULL
    ORDER BY p.created_at DESC LIMIT 1;
  IF revision IS NULL THEN
    INSERT INTO evals.provider_revision(account_id, adapter, endpoint, model_id, owner_id, roles, capabilities, context_limit, output_limit,
        data_classes, regions, concurrency_limit, rpm, tpm, free_model)
      VALUES (p_account_id, 'openai_compatible', c.endpoint, p_model_id, actor,
        ARRAY['context_analyzer','generator','judge','report_writer'],
        '{"text":true,"boundedTokens":true,"jsonObject":true,"probeApproved":false}'::jsonb,
        context, 16384, ARRAY['customer_confidential','public','synthetic'], ARRAY['external_api'], 4, 120, least(context::bigint * 40, 2000000000)::integer, false)
      RETURNING id INTO revision;
    INSERT INTO evals.provider_health(provider_revision_id, state) VALUES (revision, 'unprobed') ON CONFLICT DO NOTHING;
  END IF;
  SELECT pr.id INTO price FROM evals.price_revision pr
    WHERE pr.provider_revision_id = revision AND pr.effective_at <= now() ORDER BY pr.effective_at DESC LIMIT 1;
  IF price IS NULL THEN
    INSERT INTO evals.price_revision(provider_revision_id, currency, effective_at, billing_unit, input_price, output_price, cache_price, tool_price, uncertainty_bps, source)
      VALUES (revision, 'EUR', now() - interval '1 second', 'token', 0, 0, 0, 0, 0,
        'Workspace key (BYOK): the customer''s provider bills the tokens; Caudals charges no token credits')
      RETURNING id INTO price;
  END IF;
  capable := c.provider = 'openrouter' OR EXISTS (SELECT 1 FROM evals.web_search_connection w WHERE w.enabled);
  FOREACH item IN ARRAY p_roles LOOP
    -- Keep the role's web research setting where the new model can search.
    web := capable AND coalesce(
      (SELECT r.web_research FROM evals.generation_provider_route r WHERE r.org_id = p_org_id AND r.role = item),
      (SELECT r.web_research FROM evals.platform_model_route r WHERE r.role = item), false);
    INSERT INTO evals.generation_provider_route(org_id, role, provider_revision_id, price_revision_id, data_class, region,
        internal_cost_per_second, updated_by, web_research)
      VALUES (p_org_id, item, revision, price, 'customer_confidential', 'external_api', 0, actor, web)
      ON CONFLICT (org_id, role) DO UPDATE SET provider_revision_id = excluded.provider_revision_id,
        price_revision_id = excluded.price_revision_id, data_class = excluded.data_class, region = excluded.region,
        internal_cost_per_second = excluded.internal_cost_per_second, updated_by = excluded.updated_by,
        web_research = excluded.web_research, updated_at = now();
  END LOOP;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
    VALUES (p_org_id, actor, 'byok.route.set', revision::text,
      jsonb_build_object('provider', c.provider, 'model', p_model_id, 'roles', to_jsonb(p_roles)));
  RETURN revision;
END $$;

-- Go back to Caudals' models for one role (or 'all'): removes only the
-- workspace's routes on its own keys.
CREATE FUNCTION evals.byok_clear_route(p_org_id uuid, p_role text)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals._byok_actor(p_org_id, false); removed integer;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('all','context_analyzer','generator','judge','report_writer') THEN
    RAISE EXCEPTION 'INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  DELETE FROM evals.generation_provider_route r USING evals.provider_revision p
    WHERE r.org_id = p_org_id AND (p_role = 'all' OR r.role = p_role) AND p.id = r.provider_revision_id AND p.org_id = p_org_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
    VALUES (p_org_id, actor, 'byok.route.cleared', p_org_id::text, jsonb_build_object('role', p_role, 'removed', removed));
  RETURN removed;
END $$;

-- What an owner sees of the workspace's keys: never the envelope.
CREATE FUNCTION evals.byok_connections(p_org_id uuid)
RETURNS TABLE (account_id uuid, provider text, check_state text, checked_at timestamptz, models jsonb,
  created_at timestamptz, rotated_at timestamptz, revoked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
BEGIN
  PERFORM evals._byok_actor(p_org_id, false);
  RETURN QUERY SELECT c.account_id, c.provider, c.check_state, c.checked_at, c.models, c.created_at, c.rotated_at, c.revoked_at
    FROM evals.provider_connection c WHERE c.org_id = p_org_id
    ORDER BY c.revoked_at IS NOT NULL, c.revoked_at DESC, c.created_at DESC LIMIT 20;
END $$;

-- The workspace routes that run on its own keys.
CREATE FUNCTION evals.byok_routes(p_org_id uuid)
RETURNS TABLE (role text, account_id uuid, provider text, provider_revision_id uuid, model_id text, web_research boolean, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
BEGIN
  PERFORM evals._byok_actor(p_org_id, false);
  RETURN QUERY SELECT r.role, p.account_id, c.provider, p.id, p.model_id, r.web_research, r.updated_at
    FROM evals.generation_provider_route r
    JOIN evals.provider_revision p ON p.id = r.provider_revision_id AND p.org_id = p_org_id
    JOIN evals.provider_connection c ON c.account_id = p.account_id
    WHERE r.org_id = p_org_id ORDER BY r.role;
END $$;

/* ------------------------------------------------- worker reports --- */

-- The inference worker records what a real call learned about the key:
-- working again, out of quota, or rejected. Only the current workspace's
-- own live key, and only when the state changes.
CREATE FUNCTION evals.byok_report(p_account_id uuid, p_state text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('valid','quota_exceeded','invalid') THEN
    RAISE EXCEPTION 'INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE evals.provider_connection SET check_state = p_state, checked_at = now()
    WHERE account_id = p_account_id AND org_id IS NOT NULL AND org_id = evals.org_id()
      AND revoked_at IS NULL AND check_state IS DISTINCT FROM p_state;
END $$;

/* ------------------------------------------------------------ grants --- */

REVOKE ALL ON FUNCTION evals._byok_actor(uuid, boolean),
  evals.byok_connect(uuid, uuid, text, jsonb, uuid, text, jsonb),
  evals.byok_rotate(uuid, uuid, jsonb, uuid, text, jsonb),
  evals.byok_revoke(uuid, uuid),
  evals.byok_revoke_for_deletion(uuid),
  evals.byok_set_route(uuid, uuid, text, text[], integer),
  evals.byok_clear_route(uuid, text),
  evals.byok_connections(uuid),
  evals.byok_routes(uuid),
  evals.byok_report(uuid, text) FROM PUBLIC;
-- The web runtime (and the scheduler, a member of it) acts for owners.
GRANT EXECUTE ON FUNCTION
  evals.byok_connect(uuid, uuid, text, jsonb, uuid, text, jsonb),
  evals.byok_rotate(uuid, uuid, jsonb, uuid, text, jsonb),
  evals.byok_revoke(uuid, uuid),
  evals.byok_revoke_for_deletion(uuid),
  evals.byok_set_route(uuid, uuid, text, text[], integer),
  evals.byok_clear_route(uuid, text),
  evals.byok_connections(uuid),
  evals.byok_routes(uuid)
TO evals_runtime;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evals_worker') THEN
    GRANT EXECUTE ON FUNCTION evals.byok_report(uuid, text) TO evals_worker;
  END IF;
END $$;
-- Reports record the data routing (customer_provider) and the estimator
-- refuses another workspace's key: the runtime reads which workspace, if
-- any, owns a revision. Never the endpoint, capabilities or prices.
GRANT SELECT (org_id) ON evals.provider_revision TO evals_runtime;

COMMIT;
