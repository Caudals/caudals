-- Per-evaluation engine choices and frozen job routes. Additive: existing jobs
-- retain NULL snapshots and their legacy routing. Roll back application code
-- without dropping this table or columns; preserve job model evidence.
BEGIN;
CREATE TABLE evals.evaluation_model_route (
 org_id uuid NOT NULL,
 evaluation_id uuid NOT NULL,
 role text NOT NULL CHECK (role IN ('context_analyzer','generator','judge','report_writer')),
 provider_revision_id uuid NOT NULL REFERENCES evals.provider_revision(id),
 price_revision_id uuid NOT NULL,
 data_class text NOT NULL,
 region text NOT NULL,
 internal_cost_per_second numeric(24,9) NOT NULL CHECK (internal_cost_per_second>=0),
 web_research boolean NOT NULL DEFAULT false,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,evaluation_id,role),
 FOREIGN KEY(org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id),
 FOREIGN KEY(price_revision_id,provider_revision_id) REFERENCES evals.price_revision(id,provider_revision_id)
);
ALTER TABLE evals.evaluation_model_route ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.evaluation_model_route FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.evaluation_model_route
 USING (org_id=evals.org_id()) WITH CHECK (org_id=evals.org_id() AND evals.is_admin());
REVOKE ALL ON evals.evaluation_model_route FROM PUBLIC;
GRANT SELECT ON evals.evaluation_model_route TO evals_runtime,evals_worker,evals_browser,evals_scheduler;
GRANT SELECT,INSERT,UPDATE,DELETE ON evals.evaluation_model_route TO evals_execution_admin;
GRANT SELECT (archived_at) ON evals.evaluation TO evals_execution_admin;

ALTER TABLE evals.run ADD COLUMN model_routes jsonb;
ALTER TABLE evals.generation_job ADD COLUMN model_routes jsonb;
-- Every job pins all four roles before any work is enqueued, including roles
-- used later in the workflow. A changed default cannot alter a queued job.
CREATE FUNCTION evals.freeze_engine_model_routes() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.model_routes IS DISTINCT FROM OLD.model_routes THEN
   RAISE EXCEPTION 'immutable job model routes' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
 END IF;
 -- Serialize the snapshot with changes to this evaluation's choices.
 PERFORM 1 FROM evals.evaluation WHERE org_id=NEW.org_id AND id=NEW.evaluation_id FOR SHARE;
 SELECT coalesce(jsonb_object_agg(route.role,to_jsonb(route)),'{}'::jsonb) INTO NEW.model_routes
 FROM (
  SELECT DISTINCT ON (r.role) r.role,r.provider_revision_id,r.price_revision_id,r.data_class,r.region,
   r.internal_cost_per_second::text AS internal_cost_per_second,r.web_research,r.source,
   p.adapter,p.model_id,p.output_limit,p.context_limit,p.tpm,pr.currency
  FROM (
   SELECT role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,web_research,'evaluation'::text AS source,1 AS priority
    FROM evals.evaluation_model_route WHERE org_id=NEW.org_id AND evaluation_id=NEW.evaluation_id
   UNION ALL SELECT role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,web_research,'workspace',2
    FROM evals.generation_provider_route WHERE org_id=NEW.org_id
   UNION ALL SELECT role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,web_research,'platform',3
    FROM evals.platform_model_route
  ) r
  JOIN evals.provider_revision p ON p.id=r.provider_revision_id
  JOIN evals.provider_account a ON a.id=p.account_id
  JOIN evals.price_revision pr ON (pr.id,pr.provider_revision_id)=(r.price_revision_id,r.provider_revision_id)
  -- Explicit evaluation choices stay pinned even after provider retirement;
  -- the normal provider admission check pauses them, never silently swaps.
  WHERE r.source='evaluation' OR (a.enabled AND (p.retired_at IS NULL OR p.retired_at>now()))
  ORDER BY r.role,r.priority
 ) route;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION evals.freeze_engine_model_routes() FROM PUBLIC;
CREATE TRIGGER frozen_models BEFORE INSERT OR UPDATE ON evals.run FOR EACH ROW EXECUTE FUNCTION evals.freeze_engine_model_routes();
CREATE TRIGGER frozen_models BEFORE INSERT OR UPDATE ON evals.generation_job FOR EACH ROW EXECUTE FUNCTION evals.freeze_engine_model_routes();
COMMIT;
