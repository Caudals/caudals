-- Bounded, isolated extraction for customer source files (WP-05).
BEGIN;
ALTER TABLE evals.artifact DROP CONSTRAINT IF EXISTS artifact_byte_size_check;
ALTER TABLE evals.artifact ADD CONSTRAINT artifact_byte_size_check
  CHECK(byte_size BETWEEN 1 AND 26214400);
ALTER TABLE evals.artifact DROP CONSTRAINT IF EXISTS artifact_media_type_check;
ALTER TABLE evals.artifact ADD CONSTRAINT artifact_media_type_check
  CHECK(media_type IN ('text/plain','text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf','text/csv','application/json','application/x-ndjson','application/zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));

CREATE TABLE evals.source_ingestion_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  source_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  sealed_object_key text,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
  reason_code text,
  source_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,artifact_id),
  FOREIGN KEY(org_id,source_id) REFERENCES evals.source(org_id,id),
  FOREIGN KEY(org_id,artifact_id) REFERENCES evals.artifact(org_id,id),
  FOREIGN KEY(org_id,source_revision_id) REFERENCES evals.source_revision(org_id,id)
);
CREATE INDEX source_ingestion_queue ON evals.source_ingestion_job(org_id,status,created_at,id);
ALTER TABLE evals.source_ingestion_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.source_ingestion_job FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.source_ingestion_job
  USING(org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK(org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals.source_ingestion_job TO evals_runtime;
GRANT SELECT,INSERT ON evals.source_ingestion_job TO evals_worker;
GRANT SELECT,UPDATE(status,attempt_count,reason_code,source_revision_id,updated_at)
  ON evals.source_ingestion_job TO evals_document;
COMMIT;
