-- Public website pages join uploaded references as attributable source revisions.
BEGIN;
ALTER TABLE evals.source ADD COLUMN evaluation_id uuid;
ALTER TABLE evals.source ADD CONSTRAINT source_evaluation_fk FOREIGN KEY(org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id);
CREATE INDEX source_evaluation ON evals.source(org_id,evaluation_id,created_at,id);
CREATE TABLE evals.website_source_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  evaluation_id uuid NOT NULL,
  source_id uuid NOT NULL,
  start_url text NOT NULL CHECK(start_url ~ '^https://[^/?#]+'),
  page_limit integer NOT NULL DEFAULT 50 CHECK(page_limit BETWEEN 1 AND 50),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','captured','persisting','extracting','completed','failed')),
  captured_text text CHECK(captured_text IS NULL OR octet_length(captured_text)<=1000000),
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
  artifact_attempt_count integer NOT NULL DEFAULT 0 CHECK(artifact_attempt_count BETWEEN 0 AND 3),
  artifact_id uuid,
  source_revision_id uuid,
  reason_code text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,evaluation_id),
  FOREIGN KEY(org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id),
  FOREIGN KEY(org_id,source_id) REFERENCES evals.source(org_id,id),
  FOREIGN KEY(org_id,artifact_id) REFERENCES evals.artifact(org_id,id),
  FOREIGN KEY(org_id,source_revision_id) REFERENCES evals.source_revision(org_id,id)
);
CREATE INDEX website_source_queue ON evals.website_source_job(org_id,status,created_at,id);
ALTER TABLE evals.website_source_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.website_source_job FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.website_source_job
  USING(org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK(org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.website_source_job FROM PUBLIC;
GRANT SELECT,INSERT ON evals.website_source_job TO evals_runtime;
GRANT SELECT,UPDATE(status,attempt_count,captured_text,reason_code,updated_at)
  ON evals.website_source_job TO evals_worker;
GRANT SELECT ON evals.website_source_job TO evals_browser;
GRANT UPDATE(status,attempt_count,captured_text,reason_code,updated_at)
  ON evals.website_source_job TO evals_browser;
GRANT SELECT,UPDATE(status,artifact_attempt_count,artifact_id,captured_text,source_revision_id,reason_code,updated_at)
  ON evals.website_source_job TO evals_document;
GRANT SELECT ON evals.evaluation,evals.project,evals.source TO evals_worker;
COMMIT;
