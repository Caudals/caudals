-- Evaluation engine settings, workspace discovery and everyday lifecycle.
--
-- 1. Workers discover every live workspace instead of relying only on a
--    deploy-time allowlist, so a new client works without a redeploy.
-- 2. Platform-wide default model routes: a workspace without its own route
--    uses these (context analysis, generation, judging, report writing).
-- 3. Provider connections: one endpoint and write-only key per funded provider
--    account, so a commercial OpenAI-compatible API can serve every workspace.
--    Keys are envelopes; only the inference worker can read them.
-- 4. Rename and archive for evaluations, systems, test sets, reports and
--    reference material. Archive hides an item; its evidence stays immutable.
-- 5. Several public websites may be added to one evaluation.
BEGIN;

-- 1 ---------------------------------------------------------------------------
CREATE FUNCTION evals.worker_workspace_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
  SELECT id FROM evals.workspace WHERE deleted_at IS NULL ORDER BY created_at, id LIMIT 500
$$;
REVOKE ALL ON FUNCTION evals.worker_workspace_ids() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['evals_worker','evals_document','evals_browser','evals_scheduler','evals_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION evals.worker_workspace_ids() TO %I', r);
    END IF;
  END LOOP;
END $$;

-- 2 ---------------------------------------------------------------------------
CREATE TABLE evals.platform_model_route (
  role text PRIMARY KEY CHECK (role IN ('context_analyzer','generator','judge','report_writer')),
  provider_revision_id uuid NOT NULL REFERENCES evals.provider_revision(id),
  price_revision_id uuid NOT NULL REFERENCES evals.price_revision(id),
  data_class text NOT NULL,
  region text NOT NULL,
  internal_cost_per_second numeric(24,9) NOT NULL CHECK (internal_cost_per_second >= 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (price_revision_id,provider_revision_id) REFERENCES evals.price_revision(id,provider_revision_id)
);
REVOKE ALL ON evals.platform_model_route FROM PUBLIC;
GRANT SELECT ON evals.platform_model_route TO evals_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON evals.platform_model_route TO evals_execution_admin;
-- Workspace overrides can be cleared so the workspace inherits the default again.
GRANT DELETE ON evals.generation_provider_route TO evals_execution_admin;

-- 3 ---------------------------------------------------------------------------
CREATE TABLE evals.provider_connection (
  account_id uuid PRIMARY KEY REFERENCES evals.provider_account(id),
  adapter text NOT NULL CHECK (adapter IN ('dgx','openai_compatible')),
  endpoint text NOT NULL,
  -- Envelope bound to (nil org, account, 'provider'); NULL for keyless endpoints.
  envelope jsonb,
  key_hint text CHECK (key_hint IS NULL OR length(key_hint) <= 12),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (adapter='dgx' OR endpoint ~ '^https://')
);
REVOKE ALL ON evals.provider_connection FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON evals.provider_connection TO evals_execution_admin;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_worker') THEN
    GRANT SELECT ON evals.provider_connection TO evals_worker;
  END IF;
END $$;
-- Retiring a model or changing an account needs these on the admin login.
GRANT UPDATE (retired_at) ON evals.provider_revision TO evals_execution_admin;
GRANT UPDATE (name,enabled) ON evals.provider_account TO evals_execution_admin;
-- Model settings are shown in workspace settings; the admin login reads prices.
GRANT SELECT ON evals.generation_provider_route TO evals_execution_admin;

-- 4 ---------------------------------------------------------------------------
ALTER TABLE evals.evaluation ADD COLUMN archived_at timestamptz;
ALTER TABLE evals.target ADD COLUMN archived_at timestamptz;
ALTER TABLE evals.suite ADD COLUMN archived_at timestamptz;
ALTER TABLE evals.report ADD COLUMN archived_at timestamptz;
ALTER TABLE evals.source ADD COLUMN archived_at timestamptz;
GRANT UPDATE (title,archived_at) ON evals.evaluation TO evals_runtime;
GRANT UPDATE (title,archived_at) ON evals.target TO evals_runtime;
GRANT UPDATE (archived_at) ON evals.suite TO evals_runtime;
GRANT UPDATE (title,archived_at) ON evals.report TO evals_runtime;
GRANT UPDATE (title,archived_at) ON evals.source TO evals_runtime;
GRANT UPDATE (title,description) ON evals.project TO evals_runtime;
-- Existing tenant policies on these tables are FOR ALL; they cover UPDATE.

CREATE FUNCTION evals.rename_workspace(p_org_id uuid, p_name text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
BEGIN
  IF p_org_id IS DISTINCT FROM evals.org_id() THEN
    RAISE EXCEPTION 'workspace scope denied' USING ERRCODE='42501';
  END IF;
  IF NOT (evals.is_admin() OR EXISTS (SELECT 1 FROM evals.membership m WHERE m.org_id=p_org_id AND m.user_id=evals.actor_id() AND m.role IN ('owner','operator'))) THEN
    RAISE EXCEPTION 'workspace management denied' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'workspace name invalid' USING ERRCODE='22023';
  END IF;
  UPDATE evals.workspace SET name=btrim(p_name) WHERE id=p_org_id AND deleted_at IS NULL;
  INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES(p_org_id,evals.actor_id(),'workspace.renamed',p_org_id);
END $$;
REVOKE ALL ON FUNCTION evals.rename_workspace(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.rename_workspace(uuid,text) TO evals_runtime;

-- 5 ---------------------------------------------------------------------------
ALTER TABLE evals.website_source_job DROP CONSTRAINT website_source_job_org_id_evaluation_id_key;
CREATE INDEX website_source_job_evaluation ON evals.website_source_job(org_id,evaluation_id,created_at DESC);

COMMIT;
