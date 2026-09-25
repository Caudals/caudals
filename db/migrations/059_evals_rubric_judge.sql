-- Versioned rubric judge execution and bounded report narrative (spec §11.3, §15.1).
--
-- Judge and narrative calls reuse the budgeted invocation path: each call is a
-- workflow step with an attempt, reservation and settlement. These tables only
-- link those steps to the assessment or report they inform. Model output never
-- becomes a result without schema validation; malformed output is recorded and
-- the result stays in human review.
BEGIN;

ALTER TABLE evals.generation_provider_route DROP CONSTRAINT generation_provider_route_role_check;
ALTER TABLE evals.generation_provider_route ADD CONSTRAINT generation_provider_route_role_check
  CHECK (role IN ('context_analyzer','generator','judge','report_writer'));

CREATE TABLE evals.judge_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  run_id uuid NOT NULL,
  observation_id uuid NOT NULL,
  pending_assessment_id uuid NOT NULL,
  case_revision_id uuid NOT NULL,
  rubric_revision_id uuid NOT NULL,
  criterion_ids text[] NOT NULL CHECK (cardinality(criterion_ids) BETWEEN 1 AND 50),
  judge_model_revision_id uuid NOT NULL,
  judge_prompt_revision text NOT NULL,
  workflow_id uuid,
  step_id uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','completed','invalid','failed','skipped')),
  reason_code text,
  result_assessment_id uuid,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,id),
  UNIQUE (org_id,pending_assessment_id),
  FOREIGN KEY (org_id,run_id) REFERENCES evals.run(org_id,id),
  FOREIGN KEY (org_id,observation_id) REFERENCES evals.observation(org_id,id),
  FOREIGN KEY (org_id,pending_assessment_id) REFERENCES evals.assessment(org_id,id),
  FOREIGN KEY (org_id,result_assessment_id) REFERENCES evals.assessment(org_id,id)
);
CREATE INDEX judge_job_run ON evals.judge_job(org_id,run_id,status);
CREATE INDEX judge_job_pending ON evals.judge_job(org_id,status,created_at) WHERE status='queued';

CREATE TABLE evals.report_narrative_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  report_revision_id uuid NOT NULL,
  evidence_packet_hash text NOT NULL CHECK (evidence_packet_hash ~ '^[a-f0-9]{64}$'),
  writer_model_revision_id uuid NOT NULL,
  writer_prompt_revision text NOT NULL,
  workflow_id uuid,
  step_id uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','completed','rejected','failed','skipped')),
  reason_code text,
  narrative jsonb,
  rejected_claims jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,id),
  UNIQUE (org_id,report_revision_id,evidence_packet_hash),
  FOREIGN KEY (org_id,report_revision_id) REFERENCES evals.report_revision(org_id,id)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['judge_job','report_narrative_job'] LOOP
    EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON evals.%I USING (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid) WITH CHECK (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid)', t||'_tenant', t);
    EXECUTE format('REVOKE ALL ON evals.%I FROM PUBLIC', t);
  END LOOP;
END $$;

GRANT SELECT,INSERT ON evals.judge_job,evals.report_narrative_job TO evals_runtime;
GRANT UPDATE(status,reason_code,result_assessment_id,workflow_id,step_id,updated_at) ON evals.judge_job TO evals_runtime;
GRANT UPDATE(status,reason_code,narrative,rejected_claims,workflow_id,step_id,updated_at) ON evals.report_narrative_job TO evals_runtime;

COMMIT;
