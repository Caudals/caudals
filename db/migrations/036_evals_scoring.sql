-- WP-06: immutable assessments, review decisions, findings and comparisons.
BEGIN;
CREATE TABLE evals.assessment (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES evals.workspace(id), observation_id uuid NOT NULL,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), document jsonb NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('pass','partial','fail','unscorable')), review_status text NOT NULL CHECK(review_status IN ('unreviewed','needs_review','approved','disputed')),
 supersedes_assessment_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id),
 FOREIGN KEY(org_id,observation_id) REFERENCES evals.observation(org_id,id), FOREIGN KEY(org_id,supersedes_assessment_id) REFERENCES evals.assessment(org_id,id)
);
CREATE INDEX assessment_observation ON evals.assessment(org_id,observation_id,created_at DESC,id);
CREATE TABLE evals.criterion_score (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, assessment_id uuid NOT NULL, criterion_id text NOT NULL,
 score numeric, max_score numeric, rationale text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,assessment_id,criterion_id), FOREIGN KEY(org_id,assessment_id) REFERENCES evals.assessment(org_id,id)
);
CREATE TABLE evals.review_decision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, assessment_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approve','dispute','override')), reason text NOT NULL, reviewer_id text NOT NULL,
 replacement_assessment_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id),
 FOREIGN KEY(org_id,assessment_id) REFERENCES evals.assessment(org_id,id), FOREIGN KEY(org_id,replacement_assessment_id) REFERENCES evals.assessment(org_id,id)
);
CREATE TABLE evals.finding (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, run_id uuid NOT NULL,
 title text NOT NULL, severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')), evidence_strength text NOT NULL CHECK(evidence_strength IN ('exploratory','source_supported','reviewed','expert_adjudicated')),
 frequency_n integer NOT NULL CHECK(frequency_n>=0), frequency_denominator integer NOT NULL CHECK(frequency_denominator>0),
 observation text NOT NULL, cause_hypothesis text, recommendation text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,run_id) REFERENCES evals.run(org_id,id)
);
CREATE INDEX finding_run ON evals.finding(org_id,run_id,severity,id);
CREATE TABLE evals.finding_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, finding_id uuid NOT NULL, assessment_id uuid NOT NULL,
 source_refs jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id), UNIQUE(org_id,finding_id,assessment_id),
 FOREIGN KEY(org_id,finding_id) REFERENCES evals.finding(org_id,id), FOREIGN KEY(org_id,assessment_id) REFERENCES evals.assessment(org_id,id)
);
CREATE TABLE evals.comparison (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, project_id uuid NOT NULL, baseline_run_id uuid NOT NULL, candidate_run_id uuid NOT NULL,
 policy_hash text NOT NULL CHECK(policy_hash ~ '^[a-f0-9]{64}$'), status text NOT NULL CHECK(status IN ('compatible','incompatible','inconclusive')),
 reason_codes text[] NOT NULL, snapshot jsonb NOT NULL, created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,baseline_run_id,candidate_run_id,policy_hash),
 FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id), FOREIGN KEY(org_id,baseline_run_id) REFERENCES evals.run(org_id,id), FOREIGN KEY(org_id,candidate_run_id) REFERENCES evals.run(org_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['assessment','criterion_score','review_decision','finding','finding_evidence','comparison'] LOOP
  EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant ON evals.%I USING (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid) WITH CHECK (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT ON evals.%I TO evals_runtime',t);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals.%I FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation()',t);
 END LOOP;
END $$;
COMMIT;
