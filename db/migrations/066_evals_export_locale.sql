-- Exported reports are written in the requesting person's interface
-- language (American English or Castilian Spanish). The same revision can be
-- exported in both, so each language is its own export job, and Word exports
-- are tracked as export jobs too. Downloads are authorised through either the
-- report artifact link or the export job that produced the file.
BEGIN;
ALTER TABLE evals.export_job ADD COLUMN locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','es'));
ALTER TABLE evals.export_job DROP CONSTRAINT export_job_kind_check;
ALTER TABLE evals.export_job ADD CONSTRAINT export_job_kind_check CHECK (kind IN ('pdf','csv','cef','docx'));
CREATE INDEX export_job_artifact ON evals.export_job(org_id, artifact_id) WHERE artifact_id IS NOT NULL;
COMMIT;
