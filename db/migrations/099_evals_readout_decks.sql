-- Readout (presentation) mode (launch L-35; spec v2 P-57, §5.3 "Report ·
-- readout notes", §5.5 "Readout PDF").
--
-- A readout is a slide sequence built from one report revision's immutable
-- snapshot. Two things about it are saved per revision so a readout can be
-- repeated, and they are kept in separate tables because they have
-- different audiences:
--
--   * evals.readout_deck: the transcripts chosen for the readout (five to
--     seven results of that revision) and the next step it ends on. Workspace
--     members can read it (tenant policy, like the report itself); only
--     operators and platform admins change it.
--   * evals.readout_note: the presenter notes, one row per slide. Readable
--     and writable only by operators and platform admins: platform operators
--     and admins (evals.platform_role) and the workspace's own operator
--     members. Owners, editors and viewers get no rows back, whatever route
--     asks. The document worker has no grant on it at all.
--
-- The 16:9 readout PDF is an ordinary export job of kind `readout_pdf`. The
-- job carries the deck it renders (transcript ids and next step) in its own
-- `readout` column, so the worker never reads deck or note tables and a PDF
-- can never contain a note. Its shape is checked here.
--
-- Every write records the actor (updated_by) and an audit event.
--
-- Forward repair: additive. The rollback refuses while any deck, note or
-- readout export exists.
BEGIN;

/* ------------------------------------------------------------- helpers --- */

-- Operators for this workspace: platform operators and admins, and the
-- workspace's operator members. Customer roles never qualify.
CREATE FUNCTION evals.is_readout_operator() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT EXISTS (SELECT 1 FROM evals.platform_role WHERE user_id = evals.actor_id() AND role IN ('platform_admin','operator'))
      OR EXISTS (SELECT 1 FROM evals.membership WHERE org_id = evals.org_id() AND user_id = evals.actor_id() AND role = 'operator')
$$;
REVOKE ALL ON FUNCTION evals.is_readout_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.is_readout_operator() TO evals_runtime;

/* ---------------------------------------------------------------- decks --- */

CREATE TABLE evals.readout_deck (
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  report_revision_id uuid NOT NULL,
  -- Ordered result (assessment) ids of the chosen transcripts; NULL keeps the
  -- default (the most severe failure for each cause).
  transcript_ids jsonb CONSTRAINT readout_deck_transcripts CHECK (
    transcript_ids IS NULL OR (jsonb_typeof(transcript_ids) = 'array' AND jsonb_array_length(transcript_ids) BETWEEN 1 AND 7)),
  -- NULL keeps the default from the workspace's plan.
  next_step text CONSTRAINT readout_deck_next_step CHECK (next_step IS NULL OR next_step IN ('pilot','subscription')),
  updated_by text NOT NULL DEFAULT evals.actor_id() CHECK (length(updated_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, report_revision_id),
  FOREIGN KEY (org_id, report_revision_id) REFERENCES evals.report_revision(org_id, id)
);
ALTER TABLE evals.readout_deck ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.readout_deck FORCE ROW LEVEL SECURITY;
CREATE POLICY readout_deck_read ON evals.readout_deck FOR SELECT
  USING (org_id = evals.org_id());
CREATE POLICY readout_deck_insert ON evals.readout_deck FOR INSERT
  WITH CHECK (org_id = evals.org_id() AND evals.is_readout_operator() AND updated_by = evals.actor_id());
CREATE POLICY readout_deck_update ON evals.readout_deck FOR UPDATE
  USING (org_id = evals.org_id() AND evals.is_readout_operator())
  WITH CHECK (org_id = evals.org_id() AND evals.is_readout_operator() AND updated_by = evals.actor_id());
REVOKE ALL ON evals.readout_deck FROM PUBLIC;
GRANT SELECT, INSERT ON evals.readout_deck TO evals_runtime;
GRANT UPDATE (transcript_ids, next_step, updated_by, updated_at) ON evals.readout_deck TO evals_runtime;

/* ---------------------------------------------------------------- notes --- */

CREATE TABLE evals.readout_note (
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  report_revision_id uuid NOT NULL,
  -- A slide: cover, verdict, causes, fixes, next, or a transcript by result id.
  slide_key text NOT NULL CONSTRAINT readout_note_slide CHECK (
    slide_key IN ('cover','verdict','causes','fixes','next') OR slide_key ~ '^transcript:[A-Za-z0-9_.:-]{1,100}$'),
  body text NOT NULL CONSTRAINT readout_note_body CHECK (length(body) <= 4000),
  updated_by text NOT NULL DEFAULT evals.actor_id() CHECK (length(updated_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, report_revision_id, slide_key),
  FOREIGN KEY (org_id, report_revision_id) REFERENCES evals.report_revision(org_id, id)
);
ALTER TABLE evals.readout_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.readout_note FORCE ROW LEVEL SECURITY;
CREATE POLICY readout_note_operators ON evals.readout_note
  USING (org_id = evals.org_id() AND evals.is_readout_operator())
  WITH CHECK (org_id = evals.org_id() AND evals.is_readout_operator() AND updated_by = evals.actor_id());
REVOKE ALL ON evals.readout_note FROM PUBLIC;
-- Only the web runtime; never the document worker, browser or engine roles.
GRANT SELECT, INSERT, DELETE ON evals.readout_note TO evals_runtime;
GRANT UPDATE (body, updated_by, updated_at) ON evals.readout_note TO evals_runtime;

/* -------------------------------------------------------- readout PDFs --- */

ALTER TABLE evals.export_job DROP CONSTRAINT export_job_kind_check;
ALTER TABLE evals.export_job ADD CONSTRAINT export_job_kind_check CHECK (kind IN ('pdf','csv','cef','docx','readout_pdf'));
-- The deck a readout PDF renders: transcript ids and next step, nothing else.
ALTER TABLE evals.export_job ADD COLUMN readout jsonb;
ALTER TABLE evals.export_job ADD CONSTRAINT export_job_readout CHECK (
  (kind = 'readout_pdf') = (readout IS NOT NULL)
  AND (readout IS NULL OR (
    jsonb_typeof(readout) = 'object'
    AND (readout - 'transcript_ids' - 'next_step') = '{}'::jsonb
    AND jsonb_typeof(readout->'transcript_ids') = 'array'
    AND jsonb_array_length(readout->'transcript_ids') <= 7
    AND readout->>'next_step' IN ('pilot','subscription'))));
-- A readout is never a share download.
ALTER TABLE evals.export_job ADD CONSTRAINT export_job_readout_unshared CHECK (kind <> 'readout_pdf' OR share_id IS NULL);
CREATE INDEX export_job_readout ON evals.export_job(org_id, report_revision_id, locale) WHERE kind = 'readout_pdf';

COMMIT;
