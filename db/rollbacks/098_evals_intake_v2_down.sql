-- Rollback for db/migrations/098_evals_intake_v2.sql.
--
-- Drops the L-34 intake objects. It refuses while any context confirmation,
-- page preview or help-centre website source exists, or while a website source
-- or generation job uses the wider limits: those rows are the confirmation
-- record (author, time, edited fields) and the import settings behind
-- finalized sources. Switch INTAKE_V2_ENABLED off and repair forward instead.
-- Run it as a role that bypasses row-level security, or the counts could not
-- see every row. One transaction, so the guard holds even without ON_ERROR_STOP.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
  remaining bigint := 0;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  IF to_regclass('evals.context_confirmation') IS NOT NULL THEN
    EXECUTE 'SELECT (SELECT count(*) FROM evals.context_confirmation) + (SELECT count(*) FROM evals.website_page_preview)
      + (SELECT count(*) FROM evals.website_source_job WHERE selected_urls IS NOT NULL OR preview_id IS NOT NULL OR page_limit > 50)
      + (SELECT count(*) FROM evals.generation_job WHERE cardinality(source_revision_ids) > 21)
      + (SELECT count(*) FROM evals.source_ingestion_job WHERE scan_suspected)' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % intake v2 rows exist. Switch INTAKE_V2_ENABLED off and repair forward instead.', remaining;
  END IF;
END $$;

ALTER TABLE evals.generation_job DROP CONSTRAINT IF EXISTS generation_job_source_revision_ids_check;
ALTER TABLE evals.generation_job ADD CONSTRAINT generation_job_source_revision_ids_check
  CHECK (cardinality(source_revision_ids) BETWEEN 1 AND 21);

ALTER TABLE evals.website_source_job DROP CONSTRAINT IF EXISTS website_source_job_selection_limit;
ALTER TABLE evals.website_source_job DROP CONSTRAINT IF EXISTS website_source_job_page_limit_check;
ALTER TABLE evals.website_source_job ADD CONSTRAINT website_source_job_page_limit_check CHECK (page_limit BETWEEN 1 AND 50);
ALTER TABLE evals.website_source_job DROP CONSTRAINT IF EXISTS website_source_job_preview_fk;
ALTER TABLE evals.website_source_job
  DROP COLUMN IF EXISTS pages_read,
  DROP COLUMN IF EXISTS preview_id,
  DROP COLUMN IF EXISTS selected_urls,
  DROP COLUMN IF EXISTS path_prefix,
  DROP COLUMN IF EXISTS sitemap_url;

DROP TABLE IF EXISTS evals.website_page_preview;

ALTER TABLE evals.source_ingestion_job
  DROP COLUMN IF EXISTS scan_suspected,
  DROP COLUMN IF EXISTS empty_pages,
  DROP COLUMN IF EXISTS text_chars,
  DROP COLUMN IF EXISTS page_count;

DROP TRIGGER IF EXISTS context_confirmation_guard ON evals.context_confirmation;
DROP TABLE IF EXISTS evals.context_confirmation;
DROP FUNCTION IF EXISTS evals.guard_context_confirmation();

COMMIT;
