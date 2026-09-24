-- Automatic context profiling and source-grounded DGX generation (WP-05).
BEGIN;

CREATE UNIQUE INDEX price_revision_provider_ref ON evals.price_revision(id,provider_revision_id);

CREATE TABLE evals.generation_provider_route (
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  role text NOT NULL CHECK (role IN ('context_analyzer','generator')),
  provider_revision_id uuid NOT NULL REFERENCES evals.provider_revision(id),
  price_revision_id uuid NOT NULL REFERENCES evals.price_revision(id),
  data_class text NOT NULL,
  region text NOT NULL,
  internal_cost_per_second numeric(24,9) NOT NULL CHECK (internal_cost_per_second >= 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id,role),
  FOREIGN KEY (price_revision_id,provider_revision_id)
    REFERENCES evals.price_revision(id,provider_revision_id)
);
ALTER TABLE evals.generation_provider_route ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.generation_provider_route FORCE ROW LEVEL SECURITY;
CREATE POLICY generation_provider_route_tenant ON evals.generation_provider_route
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.generation_provider_route FROM PUBLIC;
GRANT SELECT ON evals.generation_provider_route TO evals_runtime;
GRANT SELECT,INSERT,UPDATE ON evals.generation_provider_route TO evals_execution_admin;

CREATE TABLE evals.generation_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  evaluation_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  title text NOT NULL,
  execution_mode text NOT NULL CHECK (execution_mode IN ('deployed_system','controlled_model','imported_responses')),
  source_revision_ids uuid[] NOT NULL CHECK (cardinality(source_revision_ids) BETWEEN 1 AND 21),
  prompt_revision text NOT NULL,
  prompt_revision_id uuid NOT NULL,
  requested_case_count integer NOT NULL DEFAULT 10 CHECK (requested_case_count BETWEEN 1 AND 20),
  status text NOT NULL CHECK (status IN ('profiling','profile_ready','drafting','draft_ready','needs_input','needs_review','paused','quarantined','failed')),
  profile_revision_id uuid,
  coverage_plan jsonb,
  suite_id uuid,
  suite_version_id uuid,
  reason_code text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,id),
  FOREIGN KEY (org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id)
);
CREATE INDEX generation_job_evaluation ON evals.generation_job(org_id,evaluation_id,created_at DESC,id);
ALTER TABLE evals.context_question ADD COLUMN generation_job_id uuid;
ALTER TABLE evals.context_question ADD CONSTRAINT context_question_generation_job_fk
  FOREIGN KEY (org_id,generation_job_id) REFERENCES evals.generation_job(org_id,id);
ALTER TABLE evals.context_question DROP CONSTRAINT context_question_org_id_evaluation_id_field_key;
CREATE UNIQUE INDEX context_question_global_field ON evals.context_question(org_id,evaluation_id,field)
  WHERE generation_job_id IS NULL;
CREATE UNIQUE INDEX context_question_job_field ON evals.context_question(org_id,evaluation_id,generation_job_id,field)
  WHERE generation_job_id IS NOT NULL;
ALTER TABLE evals.generation_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.generation_job FORCE ROW LEVEL SECURITY;
CREATE POLICY generation_job_tenant ON evals.generation_job
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.generation_job FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON evals.generation_job TO evals_runtime;
GRANT SELECT,UPDATE(status,reason_code,updated_at) ON evals.generation_job TO evals_worker;

ALTER TABLE evals.generation_batch ADD COLUMN generation_job_id uuid;
ALTER TABLE evals.generation_batch ADD CONSTRAINT generation_batch_job_fk
  FOREIGN KEY (org_id,generation_job_id) REFERENCES evals.generation_job(org_id,id);
CREATE UNIQUE INDEX generation_batch_job_step ON evals.generation_batch(org_id,generation_job_id,step_kind) WHERE generation_job_id IS NOT NULL;
GRANT SELECT,UPDATE(status,attempt_count,output,reason_code,updated_at) ON evals.generation_batch TO evals_worker;
GRANT INSERT ON evals.execution_budget TO evals_runtime;

COMMIT;
