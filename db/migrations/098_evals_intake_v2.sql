-- Better document intake (launch spec v2 P-56, package L-34; INTAKE_V2_ENABLED).
--
--   context_confirmation  "What we understood about your assistant": one row
--                       per generation job a person started with the flag
--                       on. 'requested' at the start, 'pending' once the
--                       inferred profile is ready (generation waits), then
--                       'confirmed' (a new context_profile_revision with the
--                       person's corrections; author, time and edited
--                       fields recorded here) or 'skipped' (the inferred
--                       revision is kept, by the person or after due_at).
--                       Decided rows never change. Confirming is free.
--   source_ingestion_job  per-file scan flag from the Poppler extraction: page
--                       count, extracted characters, empty pages and whether
--                       the PDF looks scanned (under ~50 characters a page or
--                       more than half its pages empty). No OCR.
--   website_page_preview  "Import help centre": the page list read from a
--                       sitemap (or the start page's links) on the submitted
--                       origin, robots.txt applied, an optional path prefix
--                       and the plan's page cap, shown before anything is read.
--   website_source_job  the website-source settings: sitemap URL, path prefix,
--                       the selected pages, the preview they came from and
--                       the pages actually read. The page limit now allows up
--                       to 200 pages (the PAYG cap); the API applies the plan.
--   generation_job      up to 60 source revisions per test set (50 files and
--                       the website sources), from 21.
--
-- Additive: new tables and nullable columns, two relaxed CHECK constraints.
BEGIN;

-- 1. Context confirmation ----------------------------------------------------
CREATE TABLE evals.context_confirmation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  evaluation_id uuid NOT NULL,
  generation_job_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','pending','confirmed','skipped')),
  base_profile_revision_id uuid,
  profile_revision_id uuid,
  edited_fields text[] NOT NULL DEFAULT '{}' CHECK (cardinality(edited_fields) <= 20),
  -- Where each inferred field came from: field -> ["<source revision>:<anchor>", ...].
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object' AND octet_length(evidence::text) <= 200000),
  skip_reason text CHECK (skip_reason IS NULL OR skip_reason IN ('person','timeout')),
  due_at timestamptz,
  decided_by text,
  decided_at timestamptz,
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,id),
  UNIQUE (org_id,generation_job_id),
  FOREIGN KEY (org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id),
  FOREIGN KEY (org_id,generation_job_id) REFERENCES evals.generation_job(org_id,id),
  FOREIGN KEY (org_id,base_profile_revision_id) REFERENCES evals.context_profile_revision(org_id,id),
  FOREIGN KEY (org_id,profile_revision_id) REFERENCES evals.context_profile_revision(org_id,id),
  CHECK (status = 'requested' OR base_profile_revision_id IS NOT NULL),
  CHECK (status NOT IN ('confirmed','skipped') OR (profile_revision_id IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status <> 'confirmed' OR (decided_by IS NOT NULL AND skip_reason IS NULL)),
  CHECK (status <> 'skipped' OR skip_reason IS NOT NULL)
);
CREATE INDEX context_confirmation_due ON evals.context_confirmation(org_id,status,due_at) WHERE status = 'pending';
CREATE INDEX context_confirmation_evaluation ON evals.context_confirmation(org_id,evaluation_id,created_at DESC);

-- A decision is evidence: it never changes and no row is ever deleted.
CREATE FUNCTION evals.guard_context_confirmation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'context confirmations are immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.status IN ('confirmed','skipped') THEN RAISE EXCEPTION 'a decided context confirmation is immutable' USING ERRCODE = '55000'; END IF;
  IF NEW.id <> OLD.id OR NEW.org_id <> OLD.org_id OR NEW.evaluation_id <> OLD.evaluation_id
     OR NEW.generation_job_id <> OLD.generation_job_id OR NEW.requested_by <> OLD.requested_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'context confirmation identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'pending' AND NEW.status = 'requested' THEN
    RAISE EXCEPTION 'a pending context confirmation cannot return to requested' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER context_confirmation_guard BEFORE UPDATE OR DELETE ON evals.context_confirmation
  FOR EACH ROW EXECUTE FUNCTION evals.guard_context_confirmation();

ALTER TABLE evals.context_confirmation ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.context_confirmation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.context_confirmation
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.context_confirmation FROM PUBLIC;
-- The app and the scheduler (which inherits evals_runtime) record decisions.
GRANT SELECT,INSERT ON evals.context_confirmation TO evals_runtime;
GRANT UPDATE(status,base_profile_revision_id,profile_revision_id,edited_fields,evidence,skip_reason,due_at,decided_by,decided_at,updated_at)
  ON evals.context_confirmation TO evals_runtime;

-- 2. Per-file scan flag ------------------------------------------------------
ALTER TABLE evals.source_ingestion_job
  ADD COLUMN page_count integer CHECK (page_count IS NULL OR page_count BETWEEN 0 AND 500),
  ADD COLUMN text_chars integer CHECK (text_chars IS NULL OR text_chars >= 0),
  ADD COLUMN empty_pages integer CHECK (empty_pages IS NULL OR empty_pages >= 0),
  ADD COLUMN scan_suspected boolean NOT NULL DEFAULT false;
GRANT UPDATE(page_count,text_chars,empty_pages,scan_suspected) ON evals.source_ingestion_job TO evals_document;

-- 3. Help-centre page preview ------------------------------------------------
CREATE TABLE evals.website_page_preview (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  evaluation_id uuid NOT NULL,
  start_url text NOT NULL CHECK (start_url ~ '^https://[^/?#]+' AND length(start_url) <= 2048),
  sitemap_url text CHECK (sitemap_url IS NULL OR (sitemap_url ~ '^https://[^/?#]+' AND length(sitemap_url) <= 2048)),
  path_prefix text CHECK (path_prefix IS NULL OR (path_prefix ~ '^/' AND length(path_prefix) <= 300)),
  page_cap integer NOT NULL CHECK (page_cap BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed')),
  discovered_from text CHECK (discovered_from IS NULL OR discovered_from IN ('sitemap','links')),
  origin text CHECK (origin IS NULL OR origin ~ '^https://[^/?#]+$'),
  pages jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pages) = 'array' AND jsonb_array_length(pages) <= 500),
  found_total integer CHECK (found_total IS NULL OR found_total >= 0),
  robots_excluded integer CHECK (robots_excluded IS NULL OR robots_excluded >= 0),
  outside_prefix integer CHECK (outside_prefix IS NULL OR outside_prefix >= 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  reason_code text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,id),
  FOREIGN KEY (org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id)
);
CREATE INDEX website_page_preview_queue ON evals.website_page_preview(org_id,status,created_at,id);
ALTER TABLE evals.website_page_preview ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.website_page_preview FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.website_page_preview
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.website_page_preview FROM PUBLIC;
GRANT SELECT,INSERT ON evals.website_page_preview TO evals_runtime;
-- The isolated browser executor reads the sitemap through its egress proxy.
GRANT SELECT ON evals.website_page_preview TO evals_browser;
GRANT UPDATE(status,discovered_from,origin,pages,found_total,robots_excluded,outside_prefix,attempt_count,reason_code,updated_at)
  ON evals.website_page_preview TO evals_browser;

-- 4. Website-source settings -------------------------------------------------
ALTER TABLE evals.website_source_job
  ADD COLUMN sitemap_url text CHECK (sitemap_url IS NULL OR (sitemap_url ~ '^https://[^/?#]+' AND length(sitemap_url) <= 2048)),
  ADD COLUMN path_prefix text CHECK (path_prefix IS NULL OR (path_prefix ~ '^/' AND length(path_prefix) <= 300)),
  ADD COLUMN selected_urls text[] CHECK (selected_urls IS NULL OR cardinality(selected_urls) BETWEEN 1 AND 200),
  ADD COLUMN preview_id uuid,
  ADD COLUMN pages_read integer CHECK (pages_read IS NULL OR pages_read BETWEEN 0 AND 200),
  ADD CONSTRAINT website_source_job_preview_fk FOREIGN KEY (org_id,preview_id) REFERENCES evals.website_page_preview(org_id,id);
-- The 052 column CHECK (1..50) is replaced, whatever its generated name.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'evals.website_source_job'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ~ 'page_limit' LOOP
    EXECUTE format('ALTER TABLE evals.website_source_job DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE evals.website_source_job ADD CONSTRAINT website_source_job_page_limit_check CHECK (page_limit BETWEEN 1 AND 200);
ALTER TABLE evals.website_source_job ADD CONSTRAINT website_source_job_selection_limit
  CHECK (selected_urls IS NULL OR cardinality(selected_urls) <= page_limit);
GRANT UPDATE(pages_read) ON evals.website_source_job TO evals_browser;

-- 5. More sources per test set -----------------------------------------------
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'evals.generation_job'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ~ 'source_revision_ids' LOOP
    EXECUTE format('ALTER TABLE evals.generation_job DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE evals.generation_job ADD CONSTRAINT generation_job_source_revision_ids_check
  CHECK (cardinality(source_revision_ids) BETWEEN 1 AND 60);

COMMIT;
