-- Rollback for db/migrations/102_billing_byok.sql.
--
-- Refuses once any workspace has connected a key (live or revoked): those
-- rows are the audit trail of a customer's credentials and the provenance of
-- the runs that used them. Switch BYOK_ENABLED off (and clear
-- BYOK_WORKSPACE_IDS), redeploy a compatible image and repair forward
-- instead. It must run as a role that bypasses row-level security, or the
-- counts below could not see every row. One transaction, so the guard holds
-- even when psql runs without ON_ERROR_STOP.
BEGIN;

DO $$
DECLARE bypasses boolean; remaining bigint;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  SELECT (SELECT count(*) FROM evals.provider_connection WHERE org_id IS NOT NULL)
       + (SELECT count(*) FROM evals.provider_account WHERE org_id IS NOT NULL)
       + (SELECT count(*) FROM evals.provider_revision WHERE org_id IS NOT NULL) INTO remaining;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % workspace provider rows exist. Repair forward instead.', remaining;
  END IF;
END $$;

DROP FUNCTION IF EXISTS evals.byok_report(uuid, text);
DROP FUNCTION IF EXISTS evals.byok_routes(uuid);
DROP FUNCTION IF EXISTS evals.byok_connections(uuid);
DROP FUNCTION IF EXISTS evals.byok_clear_route(uuid, text);
DROP FUNCTION IF EXISTS evals.byok_set_route(uuid, uuid, text, text[], integer);
DROP FUNCTION IF EXISTS evals.byok_revoke_for_deletion(uuid);
DROP FUNCTION IF EXISTS evals.byok_revoke(uuid, uuid);
DROP FUNCTION IF EXISTS evals.byok_rotate(uuid, uuid, jsonb, uuid, text, jsonb);
DROP FUNCTION IF EXISTS evals.byok_connect(uuid, uuid, text, jsonb, uuid, text, jsonb);
DROP FUNCTION IF EXISTS evals._byok_actor(uuid, boolean);
REVOKE SELECT (org_id) ON evals.provider_revision FROM evals_runtime;

-- Migration 088's definitions.
CREATE OR REPLACE FUNCTION evals.assert_route_priced() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE p record; issue text;
BEGIN
  SELECT pv.adapter, pv.endpoint, pv.model_id, pv.free_model, pr.input_price, pr.output_price INTO p
  FROM evals.provider_revision pv
  JOIN evals.price_revision pr ON pr.id = NEW.price_revision_id AND pr.provider_revision_id = pv.id
  WHERE pv.id = NEW.provider_revision_id;
  -- A mismatched pair is left to the foreign keys.
  IF NOT FOUND THEN RETURN NEW; END IF;
  issue := billing.model_price_issue(p.adapter, p.endpoint, p.model_id, p.free_model, p.input_price, p.output_price);
  IF issue IS NOT NULL THEN RAISE EXCEPTION '%', issue USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION billing.provider_revision_rate_key(p_provider_revision_id uuid)
RETURNS TABLE (provider text, model_key text, free_model boolean, roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT billing.model_provider(p.adapter, p.endpoint), billing.model_key(billing.model_provider(p.adapter, p.endpoint), p.model_id), p.free_model, p.roles
  FROM evals.provider_revision p WHERE p.id = p_provider_revision_id
$$;

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
    SELECT x.*, pv.adapter, pv.endpoint, pv.model_id, pv.free_model, pr.input_price, pr.output_price,
      billing.model_provider(pv.adapter, pv.endpoint) AS provider
    FROM routes x JOIN evals.provider_revision pv ON pv.id = x.provider_revision_id
    JOIN evals.price_revision pr ON pr.id = x.price_revision_id
  )
  SELECT p.scope, p.org_id, p.evaluation_id, p.role, p.provider_revision_id, p.provider, p.model_id,
    CASE WHEN p_revision_id IS NULL
      THEN billing.model_price_issue(p.adapter, p.endpoint, p.model_id, p.free_model, p.input_price, p.output_price)
      WHEN p.free_model THEN NULL
      WHEN p.adapter <> 'dgx' AND p.input_price = 0 AND p.output_price = 0 THEN 'MODEL_PRICE_ZERO'
      WHEN (billing.rate_for(p_revision_id, p.provider, p.model_id, 0)).id IS NULL THEN 'MODEL_RATE_MISSING'
    END AS issue
  FROM priced p
  ORDER BY 1, 2 NULLS FIRST, 3 NULLS FIRST, 4;
END $$;

DROP POLICY IF EXISTS worker_connections ON evals.provider_connection;
DROP POLICY IF EXISTS platform_connections ON evals.provider_connection;
ALTER TABLE evals.provider_connection NO FORCE ROW LEVEL SECURITY;
ALTER TABLE evals.provider_connection DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS provider_scope ON evals.provider_connection;
DROP TRIGGER IF EXISTS provider_scope ON evals.provider_revision;
DROP TRIGGER IF EXISTS provider_scope ON evals.provider_account;
DROP FUNCTION IF EXISTS evals.provider_scope_stamp();

DROP INDEX IF EXISTS evals.provider_revision_byok;
DROP INDEX IF EXISTS evals.provider_account_byok;
DROP INDEX IF EXISTS evals.provider_connection_byok_live;
ALTER TABLE evals.provider_connection DROP CONSTRAINT IF EXISTS provider_connection_byok;
ALTER TABLE evals.provider_connection
  DROP COLUMN IF EXISTS revoked_by, DROP COLUMN IF EXISTS revoked_at, DROP COLUMN IF EXISTS rotated_at,
  DROP COLUMN IF EXISTS models, DROP COLUMN IF EXISTS checked_at, DROP COLUMN IF EXISTS check_state,
  DROP COLUMN IF EXISTS key_version, DROP COLUMN IF EXISTS provider, DROP COLUMN IF EXISTS org_id;
-- provider_revision is immutable (072); dropping a column that is NULL everywhere changes no row's content.
ALTER TABLE evals.provider_revision DROP COLUMN IF EXISTS org_id;
ALTER TABLE evals.provider_account DROP COLUMN IF EXISTS org_id;
DROP FUNCTION IF EXISTS evals.byok_endpoint(text);

COMMIT;
