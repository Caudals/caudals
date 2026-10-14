-- Opt-in public results pages and the anonymous sector index (launch L-31;
-- spec v2 P-23, P-53, D-16).
--
-- Nothing in this migration publishes anything. It records consent and lets
-- a platform administrator (the founder) publish by hand, behind the server
-- flag PUBLIC_RESULTS_ENABLED (default off):
--   * evals.publication_consent: an owner's written consent, per workspace
--     and report revision: signer, date, wording version, scope (a public
--     results page, the anonymous sector index, or both) and revocation. An
--     owner signs in the app; an administrator may record a consent signed
--     on paper (with a reference to the document). The row never changes
--     except once, when it is revoked.
--   * evals.public_result_page: the founder's publication of a consented
--     revision, after a manual pre-publication review. It freezes a small
--     projection (dates, scope, sample size, outcome counts, interval, review
--     level, methodology version) and never copies questions, answers,
--     findings or any other report content. Revoking the consent takes the
--     page down in the same statement; a deleted workspace or a withdrawn
--     report hides it too.
--   * evals.prospect_snapshot_sector: the sector an administrator assigns to
--     one of our own public snapshots (launch L-21) so it can count in the
--     anonymous index. A snapshot is never published by name: a sandbox
--     workspace cannot consent, and nothing here reads its company or hosts
--     into any public output.
--   * evals.sector_index_publication: one quarter and sector of the
--     anonymous index, with the cohort size (at least 10 systems, recounted
--     here), identifier-free aggregates and a recorded legal sign-off.
-- Public pages read only through evals.public_result_page_view() and
-- evals.public_sector_index(), which return the frozen projections of live
-- rows and nothing else.
--
-- Forward repair: every object is additive. The rollback refuses while any
-- consent, page, sector assignment or index row exists.
BEGIN;

/* ------------------------------------------------------------- consent --- */

CREATE TABLE evals.publication_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  report_id uuid NOT NULL,
  report_revision_id uuid NOT NULL,
  -- What the owner agreed to: a public page for this revision, and/or the
  -- anonymous sector index (aggregates only, no name).
  results_page boolean NOT NULL,
  sector_index boolean NOT NULL,
  -- The name and the scope sentence the owner approved for the public page.
  public_name text CHECK (public_name IS NULL OR length(btrim(public_name)) BETWEEN 2 AND 120),
  scope_summary text CHECK (scope_summary IS NULL OR length(btrim(scope_summary)) BETWEEN 10 AND 400),
  index_sector text CHECK (index_sector IS NULL OR index_sector IN
    ('fiscal_accounting_payroll','legal','hr','insurance','energy','telco','travel')),
  -- The consent wording the signer read (lib/publication/consent.ts) and its language.
  consent_version text NOT NULL CHECK (consent_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  locale text NOT NULL CHECK (locale IN ('en','es')),
  -- in_app: an owner signed in the app; signed_document: an administrator
  -- recorded a consent signed outside it, with a reference to the document.
  method text NOT NULL CHECK (method IN ('in_app','signed_document')),
  signer_user_id text,
  signer_name text NOT NULL CHECK (length(btrim(signer_name)) BETWEEN 2 AND 120),
  signer_role text NOT NULL CHECK (length(btrim(signer_role)) BETWEEN 2 AND 120),
  document_ref text CHECK (document_ref IS NULL OR length(btrim(document_ref)) BETWEEN 3 AND 300),
  signed_at timestamptz NOT NULL,
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  recorded_by text NOT NULL CHECK (length(recorded_by) BETWEEN 1 AND 255),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text CHECK (revocation_reason IS NULL OR length(btrim(revocation_reason)) BETWEEN 1 AND 500),
  UNIQUE (org_id, id),
  UNIQUE (org_id, request_id),
  FOREIGN KEY (org_id, report_id) REFERENCES evals.report(org_id, id),
  FOREIGN KEY (org_id, report_revision_id) REFERENCES evals.report_revision(org_id, id),
  CHECK (results_page OR sector_index),
  CHECK (NOT results_page OR (public_name IS NOT NULL AND scope_summary IS NOT NULL)),
  CHECK (NOT sector_index OR index_sector IS NOT NULL),
  CHECK ((method = 'in_app') = (signer_user_id IS NOT NULL)),
  CHECK ((method = 'signed_document') = (document_ref IS NOT NULL)),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
-- One standing consent per revision; a new one needs the old one revoked.
CREATE UNIQUE INDEX publication_consent_active ON evals.publication_consent (org_id, report_revision_id) WHERE revoked_at IS NULL;
CREATE INDEX publication_consent_report ON evals.publication_consent (org_id, report_id, recorded_at DESC);

-- A consent is evidence: it changes once, when it is revoked, and is never deleted.
CREATE FUNCTION evals.guard_publication_consent() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, evals AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'publication consent is permanent; revoke it instead' USING ERRCODE = '42501';
  END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['revoked_at','revoked_by','revocation_reason'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revoked_at','revoked_by','revocation_reason']) THEN
    RAISE EXCEPTION 'a publication consent changes only once, when it is revoked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER publication_consent_guard BEFORE UPDATE OR DELETE ON evals.publication_consent
  FOR EACH ROW EXECUTE FUNCTION evals.guard_publication_consent();

/* --------------------------------------------------------------- pages --- */

CREATE TABLE evals.public_result_page (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  consent_id uuid NOT NULL UNIQUE,
  report_revision_id uuid NOT NULL,
  -- Never reused: a withdrawn page's address never points at anything else.
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 80),
  -- Frozen public fields only (see evals.publish_result_page).
  projection jsonb NOT NULL CHECK (jsonb_typeof(projection) = 'object'),
  -- The manual pre-publication review: who checked what, in a sentence.
  review_note text NOT NULL CHECK (length(btrim(review_note)) BETWEEN 10 AND 1000),
  published_by text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  unpublished_at timestamptz,
  unpublished_by text,
  unpublish_reason text CHECK (unpublish_reason IS NULL OR unpublish_reason IN ('consent_revoked','withdrawn_by_caudals')),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, consent_id) REFERENCES evals.publication_consent(org_id, id),
  FOREIGN KEY (org_id, report_revision_id) REFERENCES evals.report_revision(org_id, id),
  CHECK ((unpublished_at IS NULL) = (unpublish_reason IS NULL)),
  CHECK ((unpublished_at IS NULL) = (unpublished_by IS NULL))
);

-- A page changes once, when it is taken down, and is never deleted.
CREATE FUNCTION evals.guard_public_result_page() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, evals AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a public result page is kept as a record; unpublish it instead' USING ERRCODE = '42501';
  END IF;
  IF OLD.unpublished_at IS NOT NULL OR NEW.unpublished_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['unpublished_at','unpublished_by','unpublish_reason'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['unpublished_at','unpublished_by','unpublish_reason']) THEN
    RAISE EXCEPTION 'a public result page changes only once, when it is taken down' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER public_result_page_guard BEFORE UPDATE OR DELETE ON evals.public_result_page
  FOR EACH ROW EXECUTE FUNCTION evals.guard_public_result_page();

/* ------------------------------------------------------- sector index --- */

-- The sector of one of our own public snapshots, for the anonymous index only.
CREATE TABLE evals.prospect_snapshot_sector (
  snapshot_id uuid PRIMARY KEY REFERENCES evals.prospect_snapshot(id),
  sector text CHECK (sector IS NULL OR sector IN
    ('fiscal_accounting_payroll','legal','hr','insurance','energy','telco','travel')),
  assigned_by text NOT NULL CHECK (length(assigned_by) BETWEEN 1 AND 255),
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evals.sector_index_publication (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter text NOT NULL CHECK (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  sector text NOT NULL CHECK (sector IN ('fiscal_accounting_payroll','legal','hr','insurance','energy','telco','travel')),
  -- Systems counted for this sector and quarter; smaller cohorts are suppressed.
  cohort_size integer NOT NULL CHECK (cohort_size >= 10),
  aggregates jsonb NOT NULL CHECK (jsonb_typeof(aggregates) = 'object'),
  methodology_version text NOT NULL CHECK (methodology_version ~ '^[a-z0-9][a-z0-9.-]{1,39}$'),
  -- The lawyer's sign-off on this edition (D-16): who, when, and where it is kept.
  legal_signoff_ref text NOT NULL CHECK (length(btrim(legal_signoff_ref)) BETWEEN 3 AND 300),
  legal_reviewer text NOT NULL CHECK (length(btrim(legal_reviewer)) BETWEEN 2 AND 160),
  legal_signed_on date NOT NULL,
  published_by text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  withdrawn_by text,
  withdraw_reason text CHECK (withdraw_reason IS NULL OR length(btrim(withdraw_reason)) BETWEEN 3 AND 500),
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL)),
  CHECK ((withdrawn_at IS NULL) = (withdraw_reason IS NULL))
);
CREATE UNIQUE INDEX sector_index_publication_live ON evals.sector_index_publication (quarter, sector) WHERE withdrawn_at IS NULL;

CREATE FUNCTION evals.guard_sector_index_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, evals AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an index edition is kept as a record; withdraw it instead' USING ERRCODE = '42501';
  END IF;
  IF OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['withdrawn_at','withdrawn_by','withdraw_reason'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['withdrawn_at','withdrawn_by','withdraw_reason']) THEN
    RAISE EXCEPTION 'an index edition changes only once, when it is withdrawn' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sector_index_publication_guard BEFORE UPDATE OR DELETE ON evals.sector_index_publication
  FOR EACH ROW EXECUTE FUNCTION evals.guard_sector_index_publication();

/* ----------------------------------------------------------------- RLS --- */

-- Owners and workspace operators see their workspace's consents and pages;
-- platform administrators see all. Editors, viewers, experts and workers never.
ALTER TABLE evals.publication_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.publication_consent FORCE ROW LEVEL SECURITY;
CREATE POLICY owners_read ON evals.publication_consent FOR SELECT USING (
  evals.is_admin() OR (org_id = evals.org_id() AND EXISTS (
    SELECT 1 FROM evals.membership m WHERE m.org_id = publication_consent.org_id AND m.user_id = evals.actor_id() AND m.role IN ('owner','operator'))));
ALTER TABLE evals.public_result_page ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.public_result_page FORCE ROW LEVEL SECURITY;
CREATE POLICY owners_read ON evals.public_result_page FOR SELECT USING (
  evals.is_admin() OR (org_id = evals.org_id() AND EXISTS (
    SELECT 1 FROM evals.membership m WHERE m.org_id = public_result_page.org_id AND m.user_id = evals.actor_id() AND m.role IN ('owner','operator'))));
ALTER TABLE evals.prospect_snapshot_sector ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.prospect_snapshot_sector FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON evals.prospect_snapshot_sector FOR SELECT USING (evals.is_platform_staff());
ALTER TABLE evals.sector_index_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.sector_index_publication FORCE ROW LEVEL SECURITY;
CREATE POLICY admin_read ON evals.sector_index_publication FOR SELECT USING (evals.is_admin());

-- Reads only; every write goes through the functions below.
REVOKE ALL ON evals.publication_consent, evals.public_result_page, evals.prospect_snapshot_sector, evals.sector_index_publication FROM PUBLIC;
GRANT SELECT ON evals.publication_consent, evals.public_result_page, evals.prospect_snapshot_sector, evals.sector_index_publication TO evals_runtime;

/* ----------------------------------------------------------- consent API --- */

-- Records a written consent for one published report revision.
--   in_app: the acting person must own the workspace; they are the signer.
--   signed_document: a platform administrator records a paper or e-mail
--   consent with a reference to where the signed document is kept.
-- A prospect sandbox (our own snapshot of a third party) can never consent.
-- Idempotent per workspace and request id.
CREATE FUNCTION evals.record_publication_consent(
  p_org uuid, p_report_revision uuid, p_results_page boolean, p_sector_index boolean,
  p_public_name text, p_scope_summary text, p_index_sector text,
  p_signer_name text, p_signer_role text, p_consent_version text, p_locale text,
  p_request_id text, p_method text, p_document_ref text DEFAULT NULL, p_signed_at timestamptz DEFAULT NULL)
RETURNS evals.publication_consent
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  existing evals.publication_consent;
  saved evals.publication_consent;
  rev record;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF p_org IS NULL OR p_org IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_method = 'in_app' THEN
    IF NOT EXISTS (SELECT 1 FROM evals.membership m WHERE m.org_id = p_org AND m.user_id = actor AND m.role = 'owner') THEN
      RAISE EXCEPTION 'OWNER_REQUIRED';
    END IF;
  ELSIF p_method = 'signed_document' THEN
    IF NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
    IF p_document_ref IS NULL OR p_signed_at IS NULL OR p_signed_at > now() + interval '5 minutes' THEN
      RAISE EXCEPTION 'INPUT_INVALID';
    END IF;
  ELSE
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  SELECT * INTO existing FROM evals.publication_consent c WHERE c.org_id = p_org AND c.request_id = p_request_id;
  IF existing.id IS NOT NULL THEN RETURN existing; END IF;
  IF EXISTS (SELECT 1 FROM evals.workspace w WHERE w.id = p_org AND w.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  -- Our own snapshots of third parties are private evidence, never a public page.
  IF (evals.prospect_sandbox(p_org)).id IS NOT NULL THEN RAISE EXCEPTION 'PUBLICATION_NOT_ALLOWED'; END IF;
  SELECT rr.id, rr.report_id, rr.published_at, r.publication_status INTO rev
    FROM evals.report_revision rr JOIN evals.report r ON (r.org_id, r.id) = (rr.org_id, rr.report_id)
    WHERE rr.org_id = p_org AND rr.id = p_report_revision;
  IF rev.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF rev.published_at IS NULL OR rev.publication_status NOT IN ('published','superseded') THEN
    RAISE EXCEPTION 'REPORT_NOT_PUBLISHED';
  END IF;
  -- One standing consent per revision; serialise a double click.
  PERFORM pg_advisory_xact_lock(hashtextextended('caudals-publication-consent:' || p_report_revision::text, 0));
  IF EXISTS (SELECT 1 FROM evals.publication_consent c WHERE c.org_id = p_org AND c.report_revision_id = p_report_revision AND c.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'CONSENT_EXISTS';
  END IF;
  BEGIN
    INSERT INTO evals.publication_consent (org_id, report_id, report_revision_id, results_page, sector_index,
        public_name, scope_summary, index_sector, consent_version, locale, method, signer_user_id, signer_name, signer_role,
        document_ref, signed_at, request_id, recorded_by)
      VALUES (p_org, rev.report_id, p_report_revision, coalesce(p_results_page, false), coalesce(p_sector_index, false),
        CASE WHEN coalesce(p_results_page, false) THEN btrim(p_public_name) END,
        CASE WHEN coalesce(p_results_page, false) THEN btrim(p_scope_summary) END,
        CASE WHEN coalesce(p_sector_index, false) THEN p_index_sector END, p_consent_version, p_locale, p_method,
        CASE WHEN p_method = 'in_app' THEN actor END, btrim(p_signer_name), btrim(p_signer_role),
        CASE WHEN p_method = 'signed_document' THEN btrim(p_document_ref) END,
        CASE WHEN p_method = 'signed_document' THEN p_signed_at ELSE now() END, p_request_id, actor)
      RETURNING * INTO saved;
  EXCEPTION
    WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'INPUT_INVALID';
    WHEN unique_violation THEN RAISE EXCEPTION 'CONSENT_EXISTS';
  END;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org, actor, 'publication.consent_recorded', saved.id::text, jsonb_build_object(
      'report_revision_id', p_report_revision, 'results_page', saved.results_page, 'sector_index', saved.sector_index,
      'index_sector', saved.index_sector, 'method', saved.method, 'consent_version', saved.consent_version,
      'locale', saved.locale, 'signer', jsonb_build_object('name', saved.signer_name, 'role', saved.signer_role)));
  RETURN saved;
END $$;

-- Revokes a consent (an owner of the workspace, or a platform administrator)
-- and takes its public page down in the same transaction. Idempotent.
CREATE FUNCTION evals.revoke_publication_consent(p_org uuid, p_consent uuid, p_reason text)
RETURNS evals.publication_consent
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  saved evals.publication_consent;
  page_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF p_org IS NULL OR p_org IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF NOT evals.is_admin() AND NOT EXISTS (
    SELECT 1 FROM evals.membership m WHERE m.org_id = p_org AND m.user_id = actor AND m.role = 'owner') THEN
    RAISE EXCEPTION 'OWNER_REQUIRED';
  END IF;
  IF p_reason IS NOT NULL AND length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT * INTO saved FROM evals.publication_consent c WHERE c.org_id = p_org AND c.id = p_consent FOR UPDATE;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF saved.revoked_at IS NOT NULL THEN RETURN saved; END IF;
  UPDATE evals.publication_consent SET revoked_at = now(), revoked_by = actor, revocation_reason = nullif(btrim(p_reason), '')
    WHERE id = saved.id RETURNING * INTO saved;
  UPDATE evals.public_result_page SET unpublished_at = now(), unpublished_by = actor, unpublish_reason = 'consent_revoked'
    WHERE org_id = p_org AND consent_id = saved.id AND unpublished_at IS NULL RETURNING id INTO page_id;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org, actor, 'publication.consent_revoked', saved.id::text,
      jsonb_build_object('report_revision_id', saved.report_revision_id, 'page_taken_down', page_id IS NOT NULL));
  RETURN saved;
END $$;

/* ------------------------------------------------------------- pages API --- */

-- The founder publishes a consented revision by hand, after reviewing it.
-- Platform administrators only. The projection is built here from the
-- revision's metrics and the consent's approved name and scope; no question,
-- answer, finding, source or customer text is copied.
CREATE FUNCTION evals.publish_result_page(p_consent uuid, p_slug text, p_review_note text)
RETURNS evals.public_result_page
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  c evals.publication_consent;
  rr evals.report_revision;
  report_status text;
  m jsonb;
  s jsonb;
  passed integer; partial integer; failed integer; planned integer; scored integer;
  projection jsonb;
  saved evals.public_result_page;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) NOT BETWEEN 3 AND 80
     OR p_review_note IS NULL OR length(btrim(p_review_note)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  SELECT * INTO c FROM evals.publication_consent WHERE id = p_consent FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF c.revoked_at IS NOT NULL OR NOT c.results_page THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
  IF (evals.prospect_sandbox(c.org_id)).id IS NOT NULL THEN RAISE EXCEPTION 'PUBLICATION_NOT_ALLOWED'; END IF;
  IF EXISTS (SELECT 1 FROM evals.workspace w WHERE w.id = c.org_id AND w.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM evals.public_result_page p WHERE p.consent_id = c.id) THEN RAISE EXCEPTION 'PAGE_EXISTS'; END IF;
  IF EXISTS (SELECT 1 FROM evals.public_result_page p WHERE p.slug = p_slug) THEN RAISE EXCEPTION 'SLUG_TAKEN'; END IF;
  SELECT * INTO rr FROM evals.report_revision WHERE org_id = c.org_id AND id = c.report_revision_id;
  SELECT publication_status INTO report_status FROM evals.report WHERE org_id = c.org_id AND id = c.report_id;
  IF rr.published_at IS NULL OR report_status NOT IN ('published','superseded') THEN RAISE EXCEPTION 'REPORT_NOT_PUBLISHED'; END IF;
  m := rr.snapshot->'metrics';
  s := rr.snapshot->'scope';
  passed := (m->>'n_pass')::integer; partial := (m->>'n_partial')::integer; failed := (m->>'n_fail')::integer;
  planned := (m->>'n_planned')::integer; scored := (m->>'n_scorable')::integer;
  -- A public page needs a complete headline and at least 10 scored answers.
  IF m->>'headline_status' IS DISTINCT FROM 'complete' OR scored IS NULL OR scored < 10 OR m->>'strict_pass_rate' IS NULL THEN
    RAISE EXCEPTION 'EVIDENCE_TOO_THIN';
  END IF;
  projection := jsonb_build_object(
    'schema', 1,
    'public_name', c.public_name,
    'scope_summary', c.scope_summary,
    'tested_from', s->>'started_at',
    'tested_to', s->>'finished_at',
    'languages', coalesce((SELECT jsonb_agg(code ORDER BY code) FROM jsonb_array_elements_text(coalesce(s->'languages', '[]'::jsonb)) code
      WHERE code ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'), '[]'::jsonb),
    'questions', planned,
    'scored', scored,
    'correct', passed,
    'partial', partial,
    'incorrect', failed,
    'not_scored', greatest(planned - passed - partial - failed, 0),
    'pass_rate', round((m->>'strict_pass_rate')::numeric, 4),
    'interval_low', round((m->'wilson_interval'->>'low')::numeric, 4),
    'interval_high', round((m->'wilson_interval'->>'high')::numeric, 4),
    'review_status', rr.review_status,
    'expert_reviewers', (rr.snapshot->'expert_review'->>'reviewer_count')::integer,
    'expert_reviewed_on', left(rr.snapshot->'expert_review'->>'reviewed_on', 10),
    'scorer_version', left(rr.snapshot->'methodology'->>'scorer_version', 60),
    'report_published_at', rr.published_at,
    'consented_on', to_char(c.signed_at AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD'));
  INSERT INTO evals.public_result_page (org_id, consent_id, report_revision_id, slug, projection, review_note, published_by)
    VALUES (c.org_id, c.id, c.report_revision_id, p_slug, jsonb_strip_nulls(projection), btrim(p_review_note), actor)
    RETURNING * INTO saved;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (c.org_id, actor, 'publication.page_published', saved.id::text,
      jsonb_build_object('consent_id', c.id, 'slug', saved.slug, 'report_revision_id', c.report_revision_id));
  RETURN saved;
END $$;

-- Caudals takes a page down (platform administrators). Idempotent.
CREATE FUNCTION evals.unpublish_result_page(p_page uuid, p_reason text)
RETURNS evals.public_result_page
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  saved evals.public_result_page;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT * INTO saved FROM evals.public_result_page WHERE id = p_page FOR UPDATE;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF saved.unpublished_at IS NOT NULL THEN RETURN saved; END IF;
  UPDATE evals.public_result_page SET unpublished_at = now(), unpublished_by = actor, unpublish_reason = 'withdrawn_by_caudals'
    WHERE id = saved.id RETURNING * INTO saved;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (saved.org_id, actor, 'publication.page_unpublished', saved.id::text, jsonb_build_object('reason', btrim(p_reason)));
  RETURN saved;
END $$;

-- The public read: the frozen projection of a live page, or nothing. Live
-- means published, not taken down, its consent standing and covering a
-- results page, the workspace not deleted, the report not withdrawn and not
-- a prospect sandbox. Called by the public site with no tenant context.
CREATE FUNCTION evals.public_result_page_view(p_slug text)
RETURNS TABLE (slug text, projection jsonb, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT p.slug, p.projection, p.published_at
  FROM evals.public_result_page p
  JOIN evals.publication_consent c ON (c.org_id, c.id) = (p.org_id, p.consent_id)
  JOIN evals.workspace w ON w.id = p.org_id
  JOIN evals.report r ON (r.org_id, r.id) = (c.org_id, c.report_id)
  WHERE p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(p_slug) BETWEEN 3 AND 80
    AND p.slug = p_slug AND p.unpublished_at IS NULL
    AND c.revoked_at IS NULL AND c.results_page
    AND w.deleted_at IS NULL AND r.publication_status <> 'withdrawn'
    AND NOT EXISTS (SELECT 1 FROM evals.prospect_snapshot ps WHERE ps.org_id = p.org_id)
$$;

/* --------------------------------------------------------- sector index --- */

-- Assigns (or clears, with NULL) the index sector of one of our snapshots.
CREATE FUNCTION evals.set_snapshot_index_sector(p_snapshot uuid, p_sector text)
RETURNS evals.prospect_snapshot_sector
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  snapshot_org uuid;
  saved evals.prospect_snapshot_sector;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_sector IS NOT NULL AND p_sector NOT IN ('fiscal_accounting_payroll','legal','hr','insurance','energy','telco','travel') THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  SELECT org_id INTO snapshot_org FROM evals.prospect_snapshot WHERE id = p_snapshot;
  IF snapshot_org IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  INSERT INTO evals.prospect_snapshot_sector (snapshot_id, sector, assigned_by) VALUES (p_snapshot, p_sector, actor)
    ON CONFLICT (snapshot_id) DO UPDATE SET sector = EXCLUDED.sector, assigned_by = EXCLUDED.assigned_by, assigned_at = now()
    RETURNING * INTO saved;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (snapshot_org, actor, 'publication.snapshot_sector_set', p_snapshot::text, jsonb_build_object('sector', p_sector));
  RETURN saved;
END $$;

-- The first instant of a quarter ('2026-Q4') and of the next one, Madrid time.
CREATE FUNCTION evals.quarter_bounds(p_quarter text, OUT starts timestamptz, OUT ends timestamptz)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE first_day date;
BEGIN
  IF p_quarter IS NULL OR p_quarter !~ '^[0-9]{4}-Q[1-4]$' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  first_day := make_date(substr(p_quarter, 1, 4)::integer, (substr(p_quarter, 7, 1)::integer - 1) * 3 + 1, 1);
  starts := first_day::timestamp AT TIME ZONE 'Europe/Madrid';
  ends := (first_day + interval '3 months')::timestamp AT TIME ZONE 'Europe/Madrid';
END $$;

-- One row per system that could count in a quarter's index, with no
-- identifier of any kind: no workspace, company, host, report or date.
-- Inputs are only (a) our own prospect snapshots with an assigned sector and
-- (b) customer revisions whose owner consented to the sector index. Each
-- system (chat host, else connected target) counts once: its consented or
-- latest report published in the quarter, a customer's consent first.
-- Rows that cannot count say why (exclusion), so the script can show counts.
-- Platform administrators only.
CREATE FUNCTION evals.sector_index_inputs(p_quarter text)
RETURNS TABLE (sector text, source text, eligible boolean, exclusion text,
  n_scorable integer, n_pass integer, n_partial integer, n_fail integer, strict_pass_rate numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE bounds record;
BEGIN
  IF NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  SELECT * INTO bounds FROM evals.quarter_bounds(p_quarter);
  RETURN QUERY
  WITH candidates AS (
    SELECT cs.index_sector AS sector, 'customer'::text AS source, rr.snapshot, rr.published_at, 0 AS priority,
           coalesce(lower(substring(tr.document->>'endpoint' FROM '^https://([^/:?#]+)')), 'target:' || tr.target_id::text) AS system_key
    FROM evals.publication_consent cs
    JOIN evals.report_revision rr ON (rr.org_id, rr.id) = (cs.org_id, cs.report_revision_id)
    JOIN evals.report r ON (r.org_id, r.id) = (cs.org_id, cs.report_id)
    JOIN evals.workspace w ON w.id = cs.org_id
    JOIN evals.run ru ON (ru.org_id, ru.id) = (rr.org_id, rr.run_id)
    JOIN evals.target_revision tr ON (tr.org_id, tr.id) = (ru.org_id, ru.target_revision_id)
    WHERE cs.sector_index AND cs.revoked_at IS NULL AND w.deleted_at IS NULL AND r.publication_status <> 'withdrawn'
      AND rr.published_at >= bounds.starts AND rr.published_at < bounds.ends
      AND NOT EXISTS (SELECT 1 FROM evals.prospect_snapshot ps WHERE ps.org_id = cs.org_id)
    UNION ALL
    SELECT pss.sector, 'snapshot'::text, rr.snapshot, rr.published_at, 1,
           coalesce(lower(substring(tr.document->>'endpoint' FROM '^https://([^/:?#]+)')), ps.target_host)
    FROM evals.prospect_snapshot ps
    LEFT JOIN evals.prospect_snapshot_sector pss ON pss.snapshot_id = ps.id
    JOIN evals.workspace w ON w.id = ps.org_id
    JOIN evals.report r ON r.org_id = ps.org_id AND r.publication_status <> 'withdrawn'
    JOIN evals.report_revision rr ON (rr.org_id, rr.report_id) = (r.org_id, r.id)
    JOIN evals.run ru ON (ru.org_id, ru.id) = (rr.org_id, rr.run_id)
    JOIN evals.target_revision tr ON (tr.org_id, tr.id) = (ru.org_id, ru.target_revision_id)
    WHERE w.deleted_at IS NULL AND rr.published_at >= bounds.starts AND rr.published_at < bounds.ends
  ), ranked AS (
    SELECT c.*, row_number() OVER (PARTITION BY c.system_key ORDER BY c.priority, c.published_at DESC) AS position
    FROM candidates c
  )
  SELECT k.sector, k.source,
         (k.sector IS NOT NULL AND (k.snapshot->'metrics'->>'headline_status') = 'complete'
           AND coalesce((k.snapshot->'metrics'->>'n_scorable')::integer, 0) >= 5) AS eligible,
         CASE WHEN k.sector IS NULL THEN 'no_sector'
              WHEN (k.snapshot->'metrics'->>'headline_status') IS DISTINCT FROM 'complete' THEN 'incomplete'
              WHEN coalesce((k.snapshot->'metrics'->>'n_scorable')::integer, 0) < 5 THEN 'weak_evidence' END AS exclusion,
         coalesce((k.snapshot->'metrics'->>'n_scorable')::integer, 0),
         coalesce((k.snapshot->'metrics'->>'n_pass')::integer, 0),
         coalesce((k.snapshot->'metrics'->>'n_partial')::integer, 0),
         coalesce((k.snapshot->'metrics'->>'n_fail')::integer, 0),
         (k.snapshot->'metrics'->>'strict_pass_rate')::numeric
  FROM ranked k WHERE k.position = 1
  ORDER BY 1 NULLS LAST, 2, 9;
END $$;

-- Records one quarter and sector of the index. Platform administrators only,
-- for a quarter that has ended, with the lawyer's sign-off. The cohort and the
-- pooled answer count are recounted here; under 10 systems is refused. The
-- aggregates hold whole percentages and counts only, under fixed keys.
CREATE FUNCTION evals.record_sector_index_publication(
  p_quarter text, p_sector text, p_aggregates jsonb, p_methodology_version text,
  p_legal_ref text, p_legal_reviewer text, p_legal_signed_on date)
RETURNS evals.sector_index_publication
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  bounds record;
  cohort integer;
  answers integer;
  allowed text[] := ARRAY['systems','answers_scored','median_pass','p25_pass','p75_pass','correct_share','partial_share','incorrect_share'];
  key text;
  saved evals.sector_index_publication;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  SELECT * INTO bounds FROM evals.quarter_bounds(p_quarter);
  IF bounds.ends > now() THEN RAISE EXCEPTION 'QUARTER_NOT_ENDED'; END IF;
  IF p_legal_ref IS NULL OR length(btrim(p_legal_ref)) NOT BETWEEN 3 AND 300
     OR p_legal_reviewer IS NULL OR length(btrim(p_legal_reviewer)) NOT BETWEEN 2 AND 160
     OR p_legal_signed_on IS NULL OR p_legal_signed_on > (now() AT TIME ZONE 'Europe/Madrid')::date THEN
    RAISE EXCEPTION 'LEGAL_SIGNOFF_REQUIRED';
  END IF;
  IF p_aggregates IS NULL OR jsonb_typeof(p_aggregates) <> 'object' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  FOR key IN SELECT jsonb_object_keys(p_aggregates) LOOP
    IF NOT key = ANY (allowed) THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  END LOOP;
  FOREACH key IN ARRAY allowed LOOP
    IF jsonb_typeof(p_aggregates->key) IS DISTINCT FROM 'number' OR (p_aggregates->>key)::numeric <> trunc((p_aggregates->>key)::numeric)
       OR (p_aggregates->>key)::numeric < 0 OR (key NOT IN ('systems','answers_scored') AND (p_aggregates->>key)::numeric > 100) THEN
      RAISE EXCEPTION 'INPUT_INVALID';
    END IF;
  END LOOP;
  IF (p_aggregates->>'p25_pass')::integer > (p_aggregates->>'median_pass')::integer
     OR (p_aggregates->>'median_pass')::integer > (p_aggregates->>'p75_pass')::integer THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  SELECT count(*)::integer, coalesce(sum(i.n_scorable), 0)::integer INTO cohort, answers
    FROM evals.sector_index_inputs(p_quarter) i WHERE i.eligible AND i.sector = p_sector;
  IF cohort < 10 THEN RAISE EXCEPTION 'COHORT_TOO_SMALL'; END IF;
  IF (p_aggregates->>'systems')::integer <> cohort OR (p_aggregates->>'answers_scored')::integer <> answers THEN
    RAISE EXCEPTION 'AGGREGATES_STALE';
  END IF;
  BEGIN
    INSERT INTO evals.sector_index_publication (quarter, sector, cohort_size, aggregates, methodology_version,
        legal_signoff_ref, legal_reviewer, legal_signed_on, published_by)
      VALUES (p_quarter, p_sector, cohort, p_aggregates, p_methodology_version, btrim(p_legal_ref), btrim(p_legal_reviewer),
        p_legal_signed_on, actor)
      RETURNING * INTO saved;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'EDITION_EXISTS';
    WHEN check_violation THEN RAISE EXCEPTION 'INPUT_INVALID';
  END;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (NULL, actor, 'publication.index_published', saved.id::text,
      jsonb_build_object('quarter', p_quarter, 'sector', p_sector, 'cohort_size', cohort, 'legal_signoff_ref', saved.legal_signoff_ref));
  RETURN saved;
END $$;

CREATE FUNCTION evals.withdraw_sector_index_publication(p_id uuid, p_reason text)
RETURNS evals.sector_index_publication
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  saved evals.sector_index_publication;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT * INTO saved FROM evals.sector_index_publication WHERE id = p_id FOR UPDATE;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF saved.withdrawn_at IS NOT NULL THEN RETURN saved; END IF;
  UPDATE evals.sector_index_publication SET withdrawn_at = now(), withdrawn_by = actor, withdraw_reason = btrim(p_reason)
    WHERE id = saved.id RETURNING * INTO saved;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (NULL, actor, 'publication.index_withdrawn', saved.id::text, jsonb_build_object('quarter', saved.quarter, 'sector', saved.sector));
  RETURN saved;
END $$;

-- The public read of one quarter: live, signed-off sectors only, without the
-- sign-off reference or the publisher.
CREATE FUNCTION evals.public_sector_index(p_quarter text)
RETURNS TABLE (quarter text, sector text, cohort_size integer, aggregates jsonb, methodology_version text,
  legal_signed_on date, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT s.quarter, s.sector, s.cohort_size, s.aggregates, s.methodology_version, s.legal_signed_on, s.published_at
  FROM evals.sector_index_publication s
  WHERE p_quarter ~ '^[0-9]{4}-Q[1-4]$' AND s.quarter = p_quarter AND s.withdrawn_at IS NULL
    AND s.cohort_size >= 10 AND length(btrim(s.legal_signoff_ref)) >= 3
  ORDER BY s.cohort_size DESC, s.sector
$$;

/* -------------------------------------------------------------- grants --- */

REVOKE ALL ON FUNCTION evals.guard_publication_consent(), evals.guard_public_result_page(), evals.guard_sector_index_publication() FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.record_publication_consent(uuid, uuid, boolean, boolean, text, text, text, text, text, text, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.revoke_publication_consent(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.publish_result_page(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.unpublish_result_page(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.public_result_page_view(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.set_snapshot_index_sector(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.quarter_bounds(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.sector_index_inputs(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.record_sector_index_publication(text, text, jsonb, text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.withdraw_sector_index_publication(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.public_sector_index(text) FROM PUBLIC;
-- The web runtime: owners consent and revoke; the public site reads live
-- projections; administrator functions check the platform role themselves.
GRANT EXECUTE ON FUNCTION evals.record_publication_consent(uuid, uuid, boolean, boolean, text, text, text, text, text, text, text, text, text, text, timestamptz) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.revoke_publication_consent(uuid, uuid, text) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.publish_result_page(uuid, text, text) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.unpublish_result_page(uuid, text) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.public_result_page_view(text) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.set_snapshot_index_sector(uuid, text) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.sector_index_inputs(text) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.record_sector_index_publication(text, text, jsonb, text, text, text, date) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.withdraw_sector_index_publication(uuid, text) TO evals_runtime;
GRANT EXECUTE ON FUNCTION evals.public_sector_index(text) TO evals_runtime;

COMMIT;
