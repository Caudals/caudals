-- WP-05: context profiles and bounded, resumable generation records.
BEGIN;
CREATE TABLE evals.context_profile_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id), evaluation_id uuid NOT NULL,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), document jsonb NOT NULL,
 model_revision_id uuid, prompt_revision text NOT NULL, created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id)
);
CREATE INDEX context_profile_evaluation ON evals.context_profile_revision(org_id,evaluation_id,created_at DESC,id);
CREATE TABLE evals.context_question (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, evaluation_id uuid NOT NULL,
 field text NOT NULL, question text NOT NULL, critical boolean NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','waived')),
 answer jsonb, answered_by text, answered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,evaluation_id,field), FOREIGN KEY(org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id)
);
CREATE TABLE evals.generation_batch (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, evaluation_id uuid NOT NULL,
 step_kind text NOT NULL CHECK(step_kind IN ('extract','profile','plan','draft','build_references','validate','review','freeze')),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'), version integer NOT NULL CHECK(version>0),
 prompt_revision text NOT NULL, model_revision_id uuid, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','paused','failed')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3), output jsonb, reason_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,evaluation_id,step_kind,input_hash,version), FOREIGN KEY(org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id)
);
CREATE INDEX generation_pending ON evals.generation_batch(org_id,status,updated_at,id);
CREATE TABLE evals.case_quarantine (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, evaluation_id uuid NOT NULL,
 generation_batch_id uuid NOT NULL, draft jsonb NOT NULL, reason_code text NOT NULL, schema_errors jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id),
 FOREIGN KEY(org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id), FOREIGN KEY(org_id,generation_batch_id) REFERENCES evals.generation_batch(org_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['context_profile_revision','context_question','generation_batch','case_quarantine'] LOOP
  EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant ON evals.%I USING (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid) WITH CHECK (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT ON evals.%I TO evals_runtime',t);
 END LOOP;
END $$;
GRANT UPDATE(status,answer,answered_by,answered_at) ON evals.context_question TO evals_runtime;
GRANT UPDATE(status,attempt_count,output,reason_code,updated_at) ON evals.generation_batch TO evals_runtime;
CREATE TRIGGER context_profile_immutable BEFORE UPDATE OR DELETE ON evals.context_profile_revision FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER quarantine_immutable BEFORE UPDATE OR DELETE ON evals.case_quarantine FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
COMMIT;
