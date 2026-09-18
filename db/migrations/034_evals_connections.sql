-- WP-04: target connections, structured imports, evaluations and immutable observations.
BEGIN;

-- Runtime may verify identifiers/scopes but can never read encrypted envelopes.
GRANT SELECT(id,org_id,purpose,scope_id,revoked_at) ON evals.secret_record TO evals_runtime;
GRANT SELECT(id,org_id,record_id) ON evals.secret_version TO evals_runtime;

CREATE TABLE evals.connection_check (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 target_revision_id uuid NOT NULL, status text NOT NULL CHECK(status IN ('queued','running','ready','failed','needs_operator')),
 capability_report jsonb, error_code text, probe_evidence jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(org_id,id), FOREIGN KEY(org_id,target_revision_id) REFERENCES evals.target_revision(org_id,id)
);
CREATE INDEX connection_check_target ON evals.connection_check(org_id,target_revision_id,created_at DESC,id);

CREATE TABLE evals.import_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id), project_id uuid NOT NULL,
 artifact_id uuid, intent text NOT NULL CHECK(intent IN ('questions','questions_with_references','recorded_answers','manual_answers')),
 format text NOT NULL CHECK(format IN ('csv','xlsx','jsonl')), mapping jsonb NOT NULL, mapping_version integer NOT NULL DEFAULT 1,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'), suite_version_id uuid,
 status text NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','accepted','partial','rejected')),
 accepted_count integer NOT NULL DEFAULT 0 CHECK(accepted_count>=0), rejected_count integer NOT NULL DEFAULT 0 CHECK(rejected_count>=0),
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,project_id,source_sha256,intent,mapping_version),
 FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
 FOREIGN KEY(org_id,artifact_id) REFERENCES evals.artifact(org_id,id),
 FOREIGN KEY(org_id,suite_version_id) REFERENCES evals.suite_version(org_id,id)
);
CREATE INDEX import_job_page ON evals.import_job(org_id,created_at DESC,id);
CREATE TABLE evals.import_row (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, import_id uuid NOT NULL,
 row_number integer NOT NULL CHECK(row_number>0), original jsonb NOT NULL, normalized jsonb, errors jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id), UNIQUE(org_id,import_id,row_number),
 FOREIGN KEY(org_id,import_id) REFERENCES evals.import_job(org_id,id)
);
CREATE INDEX import_row_page ON evals.import_row(org_id,import_id,row_number);

CREATE TABLE evals.authorization_record (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id), project_id uuid NOT NULL,
 target_id uuid, basis text NOT NULL, scope jsonb NOT NULL, traffic_limit jsonb NOT NULL, expires_at timestamptz,
 evidence_artifact_id uuid, created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
 FOREIGN KEY(org_id,target_id) REFERENCES evals.target(org_id,id), FOREIGN KEY(org_id,evidence_artifact_id) REFERENCES evals.artifact(org_id,id)
);

CREATE TABLE evals.evaluation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id), project_id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), preparation_status text NOT NULL DEFAULT 'draft'
 CHECK(preparation_status IN ('draft','checking_connection','ingesting','profiling','needs_input','generating','validating','needs_review','ready','awaiting_answers','failed','canceled')),
 evidence_policy text NOT NULL CHECK(evidence_policy IN ('exploratory','source_grounded')),
 review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('not_required','pending','in_review','changes_requested','approved')),
 commercial_cap numeric(24,9) NOT NULL CHECK(commercial_cap>=0), currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 reason_code text, created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id)
);
CREATE INDEX evaluation_page ON evals.evaluation(org_id,updated_at DESC,id);

CREATE TABLE evals.run (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id), evaluation_id uuid NOT NULL,
 target_revision_id uuid NOT NULL, suite_version_id uuid NOT NULL, execution_mode text NOT NULL CHECK(execution_mode IN ('deployed_system','controlled_model','imported_responses')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','pause_requested','paused','cancel_requested','canceled','completed','partial','failed')),
 phase text NOT NULL DEFAULT 'preflight' CHECK(phase IN ('preflight','target_execution','grading','aggregation','reporting','done')),
 reason_code text, created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id),
 FOREIGN KEY(org_id,target_revision_id) REFERENCES evals.target_revision(org_id,id),
 FOREIGN KEY(org_id,suite_version_id) REFERENCES evals.suite_version(org_id,id)
);
CREATE INDEX run_page ON evals.run(org_id,updated_at DESC,id);
CREATE TABLE evals.run_plan (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, run_id uuid NOT NULL, content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id), UNIQUE(org_id,run_id),
 FOREIGN KEY(org_id,run_id) REFERENCES evals.run(org_id,id)
);
CREATE TABLE evals.case_unit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, run_id uuid NOT NULL, case_revision_id uuid NOT NULL,
 repetition integer NOT NULL CHECK(repetition>=0), status text NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','queued','running','succeeded','target_error','transport_error','timeout','capture_incomplete','unsupported','canceled','unknown_external_outcome')),
 attempt_id uuid, reason_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,run_id,case_revision_id,repetition),
 FOREIGN KEY(org_id,run_id) REFERENCES evals.run(org_id,id), FOREIGN KEY(org_id,case_revision_id) REFERENCES evals.case_revision(org_id,id)
);
CREATE INDEX case_unit_run ON evals.case_unit(org_id,run_id,status,id);
CREATE TABLE evals.observation (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, run_id uuid NOT NULL, case_unit_id uuid NOT NULL, attempt_id uuid,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), document jsonb NOT NULL,
 execution_status text NOT NULL CHECK(execution_status IN ('succeeded','target_error','transport_error','timeout','capture_incomplete','unsupported','canceled','unknown_external_outcome')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id), UNIQUE(org_id,case_unit_id),
 FOREIGN KEY(org_id,run_id) REFERENCES evals.run(org_id,id), FOREIGN KEY(org_id,case_unit_id) REFERENCES evals.case_unit(org_id,id)
);
CREATE INDEX observation_run ON evals.observation(org_id,run_id,created_at,id);
CREATE TABLE evals.target_attempt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, step_id uuid NOT NULL, case_unit_id uuid NOT NULL,
 fence bigint NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 3), target_revision_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('claimed','dispatching','completed','failed','unknown','canceled')), reason_code text,
 dispatched_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,step_id,ordinal), FOREIGN KEY(org_id,step_id) REFERENCES evals.workflow_step(org_id,id),
 FOREIGN KEY(org_id,case_unit_id) REFERENCES evals.case_unit(org_id,id), FOREIGN KEY(org_id,target_revision_id) REFERENCES evals.target_revision(org_id,id)
);
CREATE INDEX target_attempt_step ON evals.target_attempt(org_id,step_id,ordinal DESC);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['connection_check','import_job','import_row','authorization_record','evaluation','run','run_plan','case_unit','observation','target_attempt'] LOOP
  EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant ON evals.%I USING (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid) WITH CHECK (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['connection_check','import_job','import_row','authorization_record','evaluation','run','run_plan','case_unit','observation','target_attempt'] LOOP
  EXECUTE format('GRANT SELECT,INSERT ON evals.%I TO evals_runtime',t);
 END LOOP;
END $$;
GRANT UPDATE(status,capability_report,error_code,probe_evidence,completed_at) ON evals.connection_check TO evals_runtime;
GRANT UPDATE(status,accepted_count,rejected_count) ON evals.import_job TO evals_runtime;
GRANT UPDATE(preparation_status,review_status,reason_code,updated_at) ON evals.evaluation TO evals_runtime;
GRANT UPDATE(status,phase,reason_code,updated_at) ON evals.run TO evals_runtime;
GRANT UPDATE(status,attempt_id,reason_code,updated_at) ON evals.case_unit TO evals_runtime;
GRANT UPDATE(status,reason_code,finished_at) ON evals.target_attempt TO evals_runtime;

CREATE TRIGGER run_plan_immutable BEFORE UPDATE OR DELETE ON evals.run_plan FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER observation_immutable BEFORE UPDATE OR DELETE ON evals.observation FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
COMMIT;
