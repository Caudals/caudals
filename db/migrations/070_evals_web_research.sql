-- Web research for internal engine roles (docs/evals/grading-engine.md).
--
-- * platform_model_route / generation_provider_route.web_research: an opt-in
--   per role. When on and the route's provider supports it (OpenRouter's web
--   plugin), the engine may search the public web: the answer judge to check
--   details the cited excerpts do not cover, the generator to phrase realistic
--   questions. Ground truth still comes only from captured sources.
-- * web_discovery_job: "Find sources on the web" during preparation. A
--   budgeted model call with web search proposes public pages; the person
--   picks which to add, and each becomes an ordinary captured website source,
--   so provenance is unchanged.
BEGIN;

ALTER TABLE evals.platform_model_route ADD COLUMN IF NOT EXISTS web_research boolean NOT NULL DEFAULT false;
ALTER TABLE evals.generation_provider_route ADD COLUMN IF NOT EXISTS web_research boolean NOT NULL DEFAULT false;

CREATE TABLE evals.web_discovery_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  evaluation_id uuid NOT NULL,
  model_revision_id uuid NOT NULL,
  prompt_revision text NOT NULL,
  workflow_id uuid,
  step_id uuid,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','completed','failed','skipped')),
  reason_code text,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(suggestions) = 'array'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,id),
  FOREIGN KEY (org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id)
);
CREATE INDEX web_discovery_job_evaluation ON evals.web_discovery_job(org_id,evaluation_id,created_at DESC);
ALTER TABLE evals.web_discovery_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.web_discovery_job FORCE ROW LEVEL SECURITY;
CREATE POLICY web_discovery_job_tenant ON evals.web_discovery_job
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.web_discovery_job FROM PUBLIC;
GRANT SELECT,INSERT ON evals.web_discovery_job TO evals_runtime;
GRANT UPDATE(status,reason_code,suggestions,workflow_id,step_id,updated_at) ON evals.web_discovery_job TO evals_runtime;

COMMIT;
