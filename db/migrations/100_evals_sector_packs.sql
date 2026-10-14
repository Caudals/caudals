-- Sector packs v1 and monthly new questions (launch L-25; spec v2 P-26, P-30,
-- P-31; decision I-7).
--
-- Sector packs are Caudals' reusable, sector-generic questions (ICP-1: Spanish
-- tax, accounting and payroll software; then insurance). They are platform
-- data, outside every workspace:
--
--   * evals.sector_pack: one pack per sector and jurisdiction.
--   * evals.sector_pack_version: draft -> in_review -> published. A published
--     version and its items are immutable (triggers below); a change is a new
--     version.
--   * evals.sector_pack_item: one question with its expected answer, key facts,
--     the source it cites (URL, title, publisher, locator, verbatim excerpt,
--     retrieval date = source freshness), its rights (licence or public source
--     and basis), its author and its expert reviewer (a Stage E expert
--     profile). Every item is `sector_generic`; customer-owned material can
--     never be written into a pack (scope and rights constraints, and the
--     writer functions refuse to run inside a workspace context).
--
-- Publication needs every item approved by an eligible expert with the
-- reviewer recorded (I-7). Only published versions are readable by workspace
-- members; drafts are visible to Caudals staff and experts only (RLS).
--
-- When a workspace adds pack questions to its test set, each new case revision
-- is linked to the pack item it came from (evals.sector_pack_case_link). The
-- anonymous per-item statistics read those links across workspaces and return
-- counts only, never a workspace identifier, and withhold outcome counts below
-- three contributing workspaces.
--
-- Monthly new questions (P-26), tenant data:
--   * evals.workspace_library_setting: the workspace's sector (for pack
--     suggestions) and its monthly-questions opt-in.
--   * evals.source_refresh: one re-read of a website source per month, the page
--     diff by content hash and the drafting call.
--   * evals.question_proposal: the proposed questions; an owner, editor or
--     operator approves them into a new test-set version or rejects them.
--     Decided proposals are immutable.
--
-- Every write function records its actor and an audit event. Forward repair:
-- additive. The rollback refuses while any of these tables holds rows.
BEGIN;

/* ------------------------------------------------------------- helpers --- */

-- A verified Stage E expert who accepted the terms (calibrating or eligible)
-- may read drafts and write pack items; recording a review needs `eligible`.
CREATE FUNCTION evals.sector_pack_expert_profile(p_eligible_only boolean DEFAULT false) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT id FROM evals.expert_profile
   WHERE user_id = evals.actor_id() AND credentials_status = 'verified' AND terms_status = 'accepted'
     AND (eligibility_status = 'eligible' OR (NOT p_eligible_only AND eligibility_status = 'calibrating'))
$$;
REVOKE ALL ON FUNCTION evals.sector_pack_expert_profile(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.sector_pack_expert_profile(boolean) TO evals_runtime;

-- Pack authors: Caudals platform staff and verified experts. Never customers.
CREATE FUNCTION evals.can_author_sector_packs() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT evals.is_platform_staff() OR evals.sector_pack_expert_profile(false) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION evals.can_author_sector_packs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.can_author_sector_packs() TO evals_runtime;

-- Pack writes happen outside any workspace: a transaction scoped to a tenant
-- (where customer material is readable) can never write into a pack.
CREATE FUNCTION evals.sector_pack_writer(p_staff_only boolean) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.actor_id();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'sector pack writes need an actor' USING ERRCODE = '42501'; END IF;
  IF evals.org_id() IS NOT NULL THEN
    RAISE EXCEPTION 'sector pack writes run outside any workspace; customer material never enters a pack' USING ERRCODE = '42501';
  END IF;
  IF p_staff_only AND NOT evals.is_platform_staff() THEN RAISE EXCEPTION 'only Caudals staff can do this' USING ERRCODE = '42501'; END IF;
  IF NOT p_staff_only AND NOT evals.can_author_sector_packs() THEN RAISE EXCEPTION 'only Caudals staff and experts write sector packs' USING ERRCODE = '42501'; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION evals.sector_pack_writer(boolean) FROM PUBLIC;

/* --------------------------------------------------------------- packs --- */

CREATE TABLE evals.sector_pack (
  id text PRIMARY KEY CONSTRAINT sector_pack_id CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  sector text NOT NULL CONSTRAINT sector_pack_sector CHECK (sector ~ '^[a-z][a-z_]{1,59}$'),
  jurisdiction text NOT NULL CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  language text NOT NULL CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  domain_pack_id text NOT NULL CHECK (domain_pack_id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  title jsonb NOT NULL CONSTRAINT sector_pack_title CHECK (jsonb_typeof(title) = 'object' AND (title - 'en' - 'es') = '{}'::jsonb
    AND length(title->>'en') BETWEEN 1 AND 200 AND length(title->>'es') BETWEEN 1 AND 200),
  summary jsonb NOT NULL CONSTRAINT sector_pack_summary CHECK (jsonb_typeof(summary) = 'object' AND (summary - 'en' - 'es') = '{}'::jsonb
    AND length(summary->>'en') BETWEEN 1 AND 600 AND length(summary->>'es') BETWEEN 1 AND 600),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 255),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sector_pack_sector_idx ON evals.sector_pack(sector);

CREATE TABLE evals.sector_pack_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id text NOT NULL REFERENCES evals.sector_pack(id),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CONSTRAINT sector_pack_version_status CHECK (status IN ('draft','in_review','published')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  based_on_version_id uuid REFERENCES evals.sector_pack_version(id),
  content_hash text CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_by text,
  submitted_at timestamptz,
  published_by text,
  published_at timestamptz,
  UNIQUE (pack_id, version),
  CONSTRAINT sector_pack_version_published CHECK (
    (status = 'published') = (published_at IS NOT NULL AND published_by IS NOT NULL AND content_hash IS NOT NULL))
);
-- One open (draft or in review) version per pack at a time.
CREATE UNIQUE INDEX sector_pack_version_open ON evals.sector_pack_version(pack_id) WHERE status <> 'published';
CREATE INDEX sector_pack_version_published_idx ON evals.sector_pack_version(pack_id, version DESC) WHERE status = 'published';

CREATE TABLE evals.sector_pack_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_version_id uuid NOT NULL REFERENCES evals.sector_pack_version(id),
  item_key text NOT NULL CONSTRAINT sector_pack_item_key CHECK (item_key ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  -- Every pack item is sector-generic. Customer-specific questions never enter a pack.
  scope text NOT NULL DEFAULT 'sector_generic' CONSTRAINT sector_pack_item_scope CHECK (scope = 'sector_generic'),
  topic text NOT NULL CHECK (length(topic) BETWEEN 1 AND 80),
  language text NOT NULL CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  question text NOT NULL CHECK (length(question) BETWEEN 8 AND 2000),
  question_en text CHECK (question_en IS NULL OR length(question_en) BETWEEN 3 AND 2000),
  expected text NOT NULL CHECK (length(expected) BETWEEN 1 AND 4000),
  key_facts jsonb NOT NULL CONSTRAINT sector_pack_item_facts CHECK (jsonb_typeof(key_facts) = 'array' AND jsonb_array_length(key_facts) BETWEEN 1 AND 6),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  difficulty text NOT NULL CHECK (difficulty IN ('routine','advanced','challenge')),
  answerability text NOT NULL DEFAULT 'answerable' CHECK (answerability IN ('answerable','missing_information','unanswerable','must_abstain')),
  -- Deduplication: one question family per version (normalized text hash, computed by the writer).
  question_fingerprint text NOT NULL CHECK (question_fingerprint ~ '^[a-f0-9]{64}$'),
  -- The source the expected answer comes from, and when it was read (freshness).
  source_url text NOT NULL CONSTRAINT sector_pack_item_source_url CHECK (source_url ~ '^https://[^/?#[:space:]]+' AND length(source_url) <= 2000),
  source_title text NOT NULL CHECK (length(source_title) BETWEEN 1 AND 500),
  source_publisher text NOT NULL CHECK (length(source_publisher) BETWEEN 1 AND 200),
  source_locator text NOT NULL CHECK (length(source_locator) BETWEEN 1 AND 200),
  source_excerpt text NOT NULL CHECK (length(source_excerpt) BETWEEN 20 AND 1500),
  source_retrieved_at date NOT NULL,
  source_as_of date,
  -- Rights: a public official text, reusable public-sector information, an
  -- explicit licence, or Caudals' own writing. Never customer-owned.
  rights_kind text NOT NULL CONSTRAINT sector_pack_item_rights CHECK (rights_kind IN ('public_official_text','public_sector_reuse','licensed','caudals_owned')),
  rights_basis text NOT NULL CHECK (length(rights_basis) BETWEEN 20 AND 1000),
  licence_ref text CHECK (licence_ref IS NULL OR length(licence_ref) BETWEEN 1 AND 300),
  CONSTRAINT sector_pack_item_licence CHECK (rights_kind <> 'licensed' OR licence_ref IS NOT NULL),
  -- Provenance: author (and last editor), then the expert reviewer.
  author_id text NOT NULL CHECK (length(author_id) BETWEEN 1 AND 255),
  author_note text NOT NULL DEFAULT '' CHECK (length(author_note) <= 500),
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 255),
  review_status text NOT NULL DEFAULT 'pending' CONSTRAINT sector_pack_item_review_status CHECK (review_status IN ('pending','approved','changes_requested','rejected')),
  reviewer_profile_id uuid REFERENCES evals.expert_profile(id),
  reviewer_id text,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 2000),
  CONSTRAINT sector_pack_item_reviewer CHECK (
    (review_status = 'pending') = (reviewer_profile_id IS NULL)
    AND (reviewer_profile_id IS NULL) = (reviewer_id IS NULL)
    AND (reviewer_id IS NULL) = (reviewed_at IS NULL)),
  -- Independent review: the reviewer is neither the author nor the last editor.
  CONSTRAINT sector_pack_item_independent CHECK (reviewer_id IS NULL OR (reviewer_id <> author_id AND reviewer_id <> updated_by)),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_version_id, item_key),
  CONSTRAINT sector_pack_item_unique_question UNIQUE (pack_version_id, question_fingerprint)
);
CREATE INDEX sector_pack_item_version ON evals.sector_pack_item(pack_version_id, item_key);

-- The content an item is reviewed on. Review fields and timestamps are not part of it.
CREATE FUNCTION evals.sector_pack_item_hash(i evals.sector_pack_item) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, evals AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'key', i.item_key, 'scope', i.scope, 'topic', i.topic, 'language', i.language, 'question', i.question, 'question_en', i.question_en,
    'expected', i.expected, 'key_facts', i.key_facts, 'severity', i.severity, 'difficulty', i.difficulty, 'answerability', i.answerability,
    'source_url', i.source_url, 'source_title', i.source_title, 'source_publisher', i.source_publisher, 'source_locator', i.source_locator,
    'source_excerpt', i.source_excerpt, 'source_retrieved_at', i.source_retrieved_at, 'source_as_of', i.source_as_of,
    'rights_kind', i.rights_kind, 'rights_basis', i.rights_basis, 'licence_ref', i.licence_ref)::text, 'UTF8')), 'hex')
$$;

/* ----------------------------------------------- immutability triggers --- */

CREATE FUNCTION evals.guard_sector_pack_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, evals AS $$
DECLARE unapproved bigint; total bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sector pack versions are never deleted' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published sector pack versions are immutable: create a new version' USING ERRCODE = '55000';
  END IF;
  IF NEW.id <> OLD.id OR NEW.pack_id <> OLD.pack_id OR NEW.version <> OLD.version OR NEW.created_by <> OLD.created_by
     OR NEW.based_on_version_id IS DISTINCT FROM OLD.based_on_version_id THEN
    RAISE EXCEPTION 'sector pack version identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'draft' AND NEW.status = 'in_review')
    OR (OLD.status = 'in_review' AND NEW.status IN ('draft','published'))) THEN
    RAISE EXCEPTION 'sector pack version cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '55000';
  END IF;
  IF NEW.status = 'published' THEN
    SELECT count(*), count(*) FILTER (WHERE review_status <> 'approved' OR reviewer_profile_id IS NULL OR reviewer_id IS NULL OR reviewed_at IS NULL)
      INTO total, unapproved FROM evals.sector_pack_item WHERE pack_version_id = NEW.id;
    IF total = 0 THEN RAISE EXCEPTION 'an empty sector pack version cannot be published' USING ERRCODE = '55000'; END IF;
    IF unapproved > 0 THEN
      RAISE EXCEPTION '% sector pack items lack an approving expert review; nothing is published without a recorded reviewer', unapproved USING ERRCODE = '55000';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER sector_pack_version_guard BEFORE UPDATE OR DELETE ON evals.sector_pack_version
  FOR EACH ROW EXECUTE FUNCTION evals.guard_sector_pack_version();

CREATE FUNCTION evals.guard_sector_pack_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, evals AS $$
DECLARE state text;
BEGIN
  SELECT status INTO state FROM evals.sector_pack_version WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.pack_version_id ELSE NEW.pack_version_id END;
  IF state = 'published' THEN
    RAISE EXCEPTION 'items of a published sector pack version are immutable: create a new version' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.pack_version_id <> OLD.pack_version_id OR NEW.item_key <> OLD.item_key OR NEW.author_id <> OLD.author_id OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'sector pack item identity and author are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  NEW.content_hash := evals.sector_pack_item_hash(NEW);
  -- An edited item needs a new review.
  IF TG_OP = 'UPDATE' AND NEW.content_hash <> OLD.content_hash AND NEW.review_status <> 'pending' THEN
    RAISE EXCEPTION 'an edited sector pack item must be reviewed again' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER sector_pack_item_guard BEFORE INSERT OR UPDATE OR DELETE ON evals.sector_pack_item
  FOR EACH ROW EXECUTE FUNCTION evals.guard_sector_pack_item();

/* ----------------------------------------------------------------- RLS --- */

ALTER TABLE evals.sector_pack ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.sector_pack FORCE ROW LEVEL SECURITY;
ALTER TABLE evals.sector_pack_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.sector_pack_version FORCE ROW LEVEL SECURITY;
ALTER TABLE evals.sector_pack_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.sector_pack_item FORCE ROW LEVEL SECURITY;
-- Published packs are readable by everyone signed in; drafts by staff and experts only.
CREATE POLICY sector_pack_read ON evals.sector_pack FOR SELECT USING (
  evals.can_author_sector_packs()
  OR EXISTS (SELECT 1 FROM evals.sector_pack_version v WHERE v.pack_id = sector_pack.id AND v.status = 'published'));
CREATE POLICY sector_pack_version_read ON evals.sector_pack_version FOR SELECT USING (
  status = 'published' OR evals.can_author_sector_packs());
CREATE POLICY sector_pack_item_read ON evals.sector_pack_item FOR SELECT USING (
  evals.can_author_sector_packs()
  OR EXISTS (SELECT 1 FROM evals.sector_pack_version v WHERE v.id = sector_pack_item.pack_version_id AND v.status = 'published'));
REVOKE ALL ON evals.sector_pack, evals.sector_pack_version, evals.sector_pack_item FROM PUBLIC;
-- Reads only: every write goes through the SECURITY DEFINER functions below.
GRANT SELECT ON evals.sector_pack, evals.sector_pack_version, evals.sector_pack_item TO evals_runtime;

/* ------------------------------------------------------ write functions --- */

-- Create or update a pack's description (staff). Sector, jurisdiction and
-- language are fixed once a version has been published.
CREATE FUNCTION evals.sector_pack_save(p_id text, p_sector text, p_jurisdiction text, p_language text, p_domain_pack_id text, p_title jsonb, p_summary jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.sector_pack_writer(true); existing evals.sector_pack;
BEGIN
  SELECT * INTO existing FROM evals.sector_pack WHERE id = p_id FOR UPDATE;
  IF existing.id IS NULL THEN
    INSERT INTO evals.sector_pack(id, sector, jurisdiction, language, domain_pack_id, title, summary, created_by, updated_by)
    VALUES (p_id, p_sector, p_jurisdiction, p_language, p_domain_pack_id, p_title, p_summary, actor, actor);
    INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details) VALUES (NULL, actor, 'sector_pack.created', p_id, jsonb_build_object('sector', p_sector));
  ELSE
    IF (existing.sector, existing.jurisdiction, existing.language) IS DISTINCT FROM (p_sector, p_jurisdiction, p_language)
       AND EXISTS (SELECT 1 FROM evals.sector_pack_version WHERE pack_id = p_id AND status = 'published') THEN
      RAISE EXCEPTION 'a published pack keeps its sector, jurisdiction and language' USING ERRCODE = '55000';
    END IF;
    UPDATE evals.sector_pack SET sector = p_sector, jurisdiction = p_jurisdiction, language = p_language, domain_pack_id = p_domain_pack_id,
      title = p_title, summary = p_summary, updated_by = actor, updated_at = now() WHERE id = p_id;
    INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details) VALUES (NULL, actor, 'sector_pack.updated', p_id, jsonb_build_object('sector', p_sector));
  END IF;
  RETURN p_id;
END $$;

-- Open the next version of a pack (staff or expert). With p_copy_from (a
-- published version of the same pack), its items are copied with their
-- review: identical content keeps its recorded reviewer.
CREATE FUNCTION evals.sector_pack_version_open(p_pack_id text, p_notes text, p_copy_from uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.sector_pack_writer(false); next_version integer; created uuid; base evals.sector_pack_version;
BEGIN
  PERFORM 1 FROM evals.sector_pack WHERE id = p_pack_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown sector pack' USING ERRCODE = 'P0002'; END IF;
  IF p_copy_from IS NOT NULL THEN
    SELECT * INTO base FROM evals.sector_pack_version WHERE id = p_copy_from AND pack_id = p_pack_id AND status = 'published';
    IF base.id IS NULL THEN RAISE EXCEPTION 'a new version copies a published version of the same pack' USING ERRCODE = '22023'; END IF;
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO next_version FROM evals.sector_pack_version WHERE pack_id = p_pack_id;
  INSERT INTO evals.sector_pack_version(pack_id, version, notes, based_on_version_id, created_by)
  VALUES (p_pack_id, next_version, coalesce(p_notes, ''), p_copy_from, actor) RETURNING id INTO created;
  IF p_copy_from IS NOT NULL THEN
    INSERT INTO evals.sector_pack_item(pack_version_id, item_key, scope, topic, language, question, question_en, expected, key_facts, severity, difficulty,
      answerability, question_fingerprint, source_url, source_title, source_publisher, source_locator, source_excerpt, source_retrieved_at, source_as_of,
      rights_kind, rights_basis, licence_ref, author_id, author_note, updated_by, review_status, reviewer_profile_id, reviewer_id, reviewed_at, review_note, content_hash)
    SELECT created, item_key, scope, topic, language, question, question_en, expected, key_facts, severity, difficulty,
      answerability, question_fingerprint, source_url, source_title, source_publisher, source_locator, source_excerpt, source_retrieved_at, source_as_of,
      rights_kind, rights_basis, licence_ref, author_id, author_note, updated_by, review_status, reviewer_profile_id, reviewer_id, reviewed_at, review_note, content_hash
    FROM evals.sector_pack_item WHERE pack_version_id = p_copy_from;
  END IF;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
  VALUES (NULL, actor, 'sector_pack.version_opened', created::text, jsonb_build_object('pack_id', p_pack_id, 'version', next_version, 'copied_from', p_copy_from));
  RETURN created;
END $$;

-- Add or edit one item of an open version (staff or expert). An edit that
-- changes the content resets the review to pending.
CREATE FUNCTION evals.sector_pack_item_save(p_version_id uuid, p_item jsonb, p_fingerprint text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.sector_pack_writer(false); state text; existing evals.sector_pack_item; candidate evals.sector_pack_item; saved uuid;
BEGIN
  SELECT status INTO state FROM evals.sector_pack_version WHERE id = p_version_id FOR UPDATE;
  IF state IS NULL THEN RAISE EXCEPTION 'unknown sector pack version' USING ERRCODE = 'P0002'; END IF;
  IF state = 'published' THEN RAISE EXCEPTION 'items of a published sector pack version are immutable: create a new version' USING ERRCODE = '55000'; END IF;
  IF jsonb_typeof(p_item) <> 'object' OR p_item ? 'org_id' OR p_item ? 'workspace_id' OR p_item ? 'case_revision_id' THEN
    RAISE EXCEPTION 'sector pack items carry no workspace or customer case reference' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO existing FROM evals.sector_pack_item WHERE pack_version_id = p_version_id AND item_key = p_item->>'key' FOR UPDATE;
  candidate := existing;
  candidate.pack_version_id := p_version_id;
  candidate.item_key := p_item->>'key';
  candidate.scope := coalesce(p_item->>'scope', 'sector_generic');
  candidate.topic := p_item->>'topic';
  candidate.language := coalesce(p_item->>'language', (SELECT p.language FROM evals.sector_pack p JOIN evals.sector_pack_version v ON v.pack_id = p.id WHERE v.id = p_version_id));
  candidate.question := p_item->>'question';
  candidate.question_en := nullif(p_item->>'questionEn', '');
  candidate.expected := p_item->>'expected';
  candidate.key_facts := p_item->'keyFacts';
  candidate.severity := p_item->>'severity';
  candidate.difficulty := p_item->>'difficulty';
  candidate.answerability := coalesce(p_item->>'answerability', 'answerable');
  candidate.question_fingerprint := p_fingerprint;
  candidate.source_url := p_item->'source'->>'url';
  candidate.source_title := p_item->'source'->>'title';
  candidate.source_publisher := p_item->'source'->>'publisher';
  candidate.source_locator := p_item->'source'->>'locator';
  candidate.source_excerpt := p_item->'source'->>'excerpt';
  candidate.source_retrieved_at := (p_item->'source'->>'retrievedAt')::date;
  candidate.source_as_of := nullif(p_item->'source'->>'asOf', '')::date;
  candidate.rights_kind := p_item->'rights'->>'kind';
  candidate.rights_basis := p_item->'rights'->>'basis';
  candidate.licence_ref := nullif(p_item->'rights'->>'licenceRef', '');
  candidate.author_note := coalesce(p_item->>'authorNote', coalesce(existing.author_note, ''));
  IF candidate.source_retrieved_at > current_date THEN RAISE EXCEPTION 'a source cannot be retrieved in the future' USING ERRCODE = '22023'; END IF;
  IF existing.id IS NULL THEN
    INSERT INTO evals.sector_pack_item(pack_version_id, item_key, scope, topic, language, question, question_en, expected, key_facts, severity, difficulty,
      answerability, question_fingerprint, source_url, source_title, source_publisher, source_locator, source_excerpt, source_retrieved_at, source_as_of,
      rights_kind, rights_basis, licence_ref, author_id, author_note, updated_by, content_hash)
    VALUES (p_version_id, candidate.item_key, candidate.scope, candidate.topic, candidate.language, candidate.question, candidate.question_en, candidate.expected,
      candidate.key_facts, candidate.severity, candidate.difficulty, candidate.answerability, candidate.question_fingerprint, candidate.source_url, candidate.source_title,
      candidate.source_publisher, candidate.source_locator, candidate.source_excerpt, candidate.source_retrieved_at, candidate.source_as_of, candidate.rights_kind,
      candidate.rights_basis, candidate.licence_ref, actor, candidate.author_note, actor, repeat('0', 64))
    RETURNING id INTO saved;
    INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
    VALUES (NULL, actor, 'sector_pack.item_added', saved::text, jsonb_build_object('version_id', p_version_id, 'key', candidate.item_key));
    RETURN saved;
  END IF;
  IF evals.sector_pack_item_hash(candidate) = existing.content_hash AND candidate.author_note = existing.author_note THEN RETURN existing.id; END IF;
  UPDATE evals.sector_pack_item SET topic = candidate.topic, language = candidate.language, question = candidate.question, question_en = candidate.question_en,
    expected = candidate.expected, key_facts = candidate.key_facts, severity = candidate.severity, difficulty = candidate.difficulty, answerability = candidate.answerability,
    question_fingerprint = candidate.question_fingerprint, source_url = candidate.source_url, source_title = candidate.source_title, source_publisher = candidate.source_publisher,
    source_locator = candidate.source_locator, source_excerpt = candidate.source_excerpt, source_retrieved_at = candidate.source_retrieved_at, source_as_of = candidate.source_as_of,
    rights_kind = candidate.rights_kind, rights_basis = candidate.rights_basis, licence_ref = candidate.licence_ref, author_note = candidate.author_note, updated_by = actor,
    review_status = CASE WHEN evals.sector_pack_item_hash(candidate) = existing.content_hash THEN existing.review_status ELSE 'pending' END,
    reviewer_profile_id = CASE WHEN evals.sector_pack_item_hash(candidate) = existing.content_hash THEN existing.reviewer_profile_id END,
    reviewer_id = CASE WHEN evals.sector_pack_item_hash(candidate) = existing.content_hash THEN existing.reviewer_id END,
    reviewed_at = CASE WHEN evals.sector_pack_item_hash(candidate) = existing.content_hash THEN existing.reviewed_at END,
    review_note = CASE WHEN evals.sector_pack_item_hash(candidate) = existing.content_hash THEN existing.review_note END
  WHERE id = existing.id;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
  VALUES (NULL, actor, 'sector_pack.item_edited', existing.id::text, jsonb_build_object('version_id', p_version_id, 'key', candidate.item_key));
  RETURN existing.id;
END $$;

-- Remove an item from an open version (staff or expert).
CREATE FUNCTION evals.sector_pack_item_remove(p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.sector_pack_writer(false); removed evals.sector_pack_item;
BEGIN
  DELETE FROM evals.sector_pack_item WHERE id = p_item_id RETURNING * INTO removed;
  IF removed.id IS NULL THEN RAISE EXCEPTION 'unknown sector pack item' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
  VALUES (NULL, actor, 'sector_pack.item_removed', p_item_id::text, jsonb_build_object('version_id', removed.pack_version_id, 'key', removed.item_key, 'content_hash', removed.content_hash));
END $$;

-- An eligible expert records a review of one item of a version in review.
CREATE FUNCTION evals.sector_pack_item_review(p_item_id uuid, p_decision text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.sector_pack_writer(false); profile uuid := evals.sector_pack_expert_profile(true); item evals.sector_pack_item; state text;
BEGIN
  IF profile IS NULL THEN RAISE EXCEPTION 'only an eligible expert records a sector pack review' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approved','changes_requested','rejected') THEN RAISE EXCEPTION 'unknown review decision' USING ERRCODE = '22023'; END IF;
  IF p_decision <> 'approved' AND coalesce(length(trim(p_note)), 0) = 0 THEN RAISE EXCEPTION 'say what should change' USING ERRCODE = '22023'; END IF;
  SELECT * INTO item FROM evals.sector_pack_item WHERE id = p_item_id FOR UPDATE;
  IF item.id IS NULL THEN RAISE EXCEPTION 'unknown sector pack item' USING ERRCODE = 'P0002'; END IF;
  SELECT status INTO state FROM evals.sector_pack_version WHERE id = item.pack_version_id;
  IF state <> 'in_review' THEN RAISE EXCEPTION 'items are reviewed while their version is in review' USING ERRCODE = '55000'; END IF;
  IF actor = item.author_id OR actor = item.updated_by THEN RAISE EXCEPTION 'the author or last editor cannot review their own item' USING ERRCODE = '42501'; END IF;
  UPDATE evals.sector_pack_item SET review_status = p_decision, reviewer_profile_id = profile, reviewer_id = actor, reviewed_at = now(),
    review_note = nullif(trim(coalesce(p_note, '')), '') WHERE id = p_item_id;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
  VALUES (NULL, actor, 'sector_pack.item_reviewed', p_item_id::text, jsonb_build_object('decision', p_decision, 'reviewer_profile_id', profile, 'content_hash', item.content_hash));
END $$;

-- Move a version through its workflow (staff): submit for review, return to
-- draft, or publish. Publishing computes the version's content hash.
CREATE FUNCTION evals.sector_pack_version_transition(p_version_id uuid, p_to text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.sector_pack_writer(true); ver evals.sector_pack_version; version_hash text;
BEGIN
  SELECT * INTO ver FROM evals.sector_pack_version WHERE id = p_version_id FOR UPDATE;
  IF ver.id IS NULL THEN RAISE EXCEPTION 'unknown sector pack version' USING ERRCODE = 'P0002'; END IF;
  IF p_to = 'in_review' THEN
    IF NOT EXISTS (SELECT 1 FROM evals.sector_pack_item WHERE pack_version_id = p_version_id) THEN
      RAISE EXCEPTION 'add questions before asking for review' USING ERRCODE = '55000';
    END IF;
    UPDATE evals.sector_pack_version SET status = 'in_review', submitted_by = actor, submitted_at = now() WHERE id = p_version_id;
  ELSIF p_to = 'draft' THEN
    UPDATE evals.sector_pack_version SET status = 'draft' WHERE id = p_version_id;
  ELSIF p_to = 'published' THEN
    SELECT encode(sha256(convert_to(string_agg(item_key || ':' || content_hash, ',' ORDER BY item_key), 'UTF8')), 'hex') INTO version_hash
      FROM evals.sector_pack_item WHERE pack_version_id = p_version_id;
    UPDATE evals.sector_pack_version SET status = 'published', content_hash = version_hash, published_by = actor, published_at = now() WHERE id = p_version_id;
  ELSE
    RAISE EXCEPTION 'unknown sector pack version state' USING ERRCODE = '22023';
  END IF;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
  VALUES (NULL, actor, 'sector_pack.version_' || p_to, p_version_id::text, jsonb_build_object('pack_id', ver.pack_id, 'version', ver.version, 'from', ver.status));
  RETURN p_to;
END $$;

REVOKE ALL ON FUNCTION evals.sector_pack_save(text, text, text, text, text, jsonb, jsonb), evals.sector_pack_version_open(text, text, uuid),
  evals.sector_pack_item_save(uuid, jsonb, text), evals.sector_pack_item_remove(uuid), evals.sector_pack_item_review(uuid, text, text),
  evals.sector_pack_version_transition(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.sector_pack_save(text, text, text, text, text, jsonb, jsonb), evals.sector_pack_version_open(text, text, uuid),
  evals.sector_pack_item_save(uuid, jsonb, text), evals.sector_pack_item_remove(uuid), evals.sector_pack_item_review(uuid, text, text),
  evals.sector_pack_version_transition(uuid, text) TO evals_runtime;

/* ------------------------------------------- customer test-set links --- */

-- A case revision a workspace added from a pack, and the item it came from.
CREATE TABLE evals.sector_pack_case_link (
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  case_revision_id uuid NOT NULL,
  pack_item_id uuid NOT NULL REFERENCES evals.sector_pack_item(id),
  suite_id uuid NOT NULL,
  created_by text NOT NULL DEFAULT evals.actor_id() CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, case_revision_id),
  FOREIGN KEY (org_id, case_revision_id) REFERENCES evals.case_revision(org_id, id),
  FOREIGN KEY (org_id, suite_id) REFERENCES evals.suite(org_id, id)
);
CREATE INDEX sector_pack_case_link_item ON evals.sector_pack_case_link(pack_item_id);
CREATE FUNCTION evals.guard_sector_pack_case_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'sector pack links are immutable' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.sector_pack_item i JOIN evals.sector_pack_version v ON v.id = i.pack_version_id
                  WHERE i.id = NEW.pack_item_id AND v.status = 'published') THEN
    RAISE EXCEPTION 'only items of published sector packs enter a workspace test set' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sector_pack_case_link_guard BEFORE INSERT OR UPDATE OR DELETE ON evals.sector_pack_case_link
  FOR EACH ROW EXECUTE FUNCTION evals.guard_sector_pack_case_link();
ALTER TABLE evals.sector_pack_case_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.sector_pack_case_link FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.sector_pack_case_link USING (org_id = evals.org_id())
  WITH CHECK (org_id = evals.org_id() AND created_by = evals.actor_id());
REVOKE ALL ON evals.sector_pack_case_link FROM PUBLIC;
GRANT SELECT, INSERT ON evals.sector_pack_case_link TO evals_runtime;
CREATE INDEX case_unit_case_revision ON evals.case_unit(org_id, case_revision_id);

-- Anonymous per-item results across workspaces, by item key over every
-- version of the item's pack: counts only, never a workspace identifier.
-- Outcome counts are withheld below three contributing workspaces.
CREATE FUNCTION evals.sector_pack_item_stats(p_version_id uuid)
RETURNS TABLE (item_key text, workspaces integer, results integer, passed integer, partial integer, failed integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE pack text;
BEGIN
  IF NOT evals.can_author_sector_packs() THEN RAISE EXCEPTION 'sector pack statistics are for Caudals staff and experts' USING ERRCODE = '42501'; END IF;
  SELECT pack_id INTO pack FROM evals.sector_pack_version WHERE id = p_version_id;
  RETURN QUERY
  WITH outcomes AS (
    SELECT i.item_key AS key, l.org_id, latest.outcome
    FROM evals.sector_pack_case_link l
    JOIN evals.sector_pack_item i ON i.id = l.pack_item_id
    JOIN evals.sector_pack_version v ON v.id = i.pack_version_id AND v.pack_id = pack
    JOIN evals.case_unit cu ON cu.org_id = l.org_id AND cu.case_revision_id = l.case_revision_id
    JOIN evals.observation o ON o.org_id = cu.org_id AND o.case_unit_id = cu.id
    JOIN LATERAL (SELECT a.outcome FROM evals.assessment a WHERE a.org_id = o.org_id AND a.observation_id = o.id
                  ORDER BY a.created_at DESC, a.id DESC LIMIT 1) latest ON true
    WHERE latest.outcome <> 'unscorable'
  ), totals AS (
    SELECT key, count(DISTINCT org_id)::integer AS ws, count(*)::integer AS n,
      count(*) FILTER (WHERE outcome = 'pass')::integer AS p, count(*) FILTER (WHERE outcome = 'partial')::integer AS pa,
      count(*) FILTER (WHERE outcome = 'fail')::integer AS f
    FROM outcomes GROUP BY key
  )
  SELECT i.item_key, coalesce(t.ws, 0), coalesce(t.n, 0),
    CASE WHEN t.ws >= 3 THEN t.p END, CASE WHEN t.ws >= 3 THEN t.pa END, CASE WHEN t.ws >= 3 THEN t.f END
  FROM evals.sector_pack_item i LEFT JOIN totals t ON t.key = i.item_key
  WHERE i.pack_version_id = p_version_id
  ORDER BY i.item_key;
END $$;
REVOKE ALL ON FUNCTION evals.sector_pack_item_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.sector_pack_item_stats(uuid) TO evals_runtime;

/* ------------------------------------------- workspace library settings --- */

CREATE TABLE evals.workspace_library_setting (
  org_id uuid PRIMARY KEY REFERENCES evals.workspace(id),
  sector text CONSTRAINT workspace_library_sector CHECK (sector IS NULL OR sector ~ '^[a-z][a-z_]{1,59}$'),
  monthly_questions boolean NOT NULL DEFAULT false,
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 255),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE evals.workspace_library_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.workspace_library_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY members_read ON evals.workspace_library_setting FOR SELECT USING (org_id = evals.org_id());
REVOKE ALL ON evals.workspace_library_setting FROM PUBLIC;
GRANT SELECT ON evals.workspace_library_setting TO evals_runtime;

-- The workspace's sector (owners, editors, operators, staff) and its monthly
-- new-questions opt-in (owners, operators, staff; managed, PAYG and partner
-- plans only). NULL leaves a field unchanged; p_clear_sector clears it.
CREATE FUNCTION evals.set_workspace_library_setting(p_sector text, p_monthly boolean, p_clear_sector boolean DEFAULT false)
RETURNS evals.workspace_library_setting LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE org uuid := evals.org_id(); actor text := evals.actor_id(); member_role text; staff boolean := evals.is_platform_staff();
  prior evals.workspace_library_setting; saved_row evals.workspace_library_setting; workspace_plan text;
BEGIN
  IF org IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'workspace context required' USING ERRCODE = '42501'; END IF;
  SELECT role INTO member_role FROM evals.membership WHERE org_id = org AND user_id = actor;
  IF NOT staff AND coalesce(member_role, '') NOT IN ('owner','editor','operator') THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF p_monthly IS NOT NULL AND NOT staff AND member_role NOT IN ('owner','operator') THEN
    RAISE EXCEPTION 'only owners turn monthly new questions on or off' USING ERRCODE = '42501';
  END IF;
  IF p_monthly IS TRUE THEN
    SELECT e.plan INTO workspace_plan FROM evals.workspace_entitlement e WHERE e.org_id = org;
    IF coalesce(workspace_plan, '') NOT IN ('managed','payg','partner') THEN
      RAISE EXCEPTION 'monthly new questions need a managed or pay-as-you-go plan' USING ERRCODE = '55000';
    END IF;
  END IF;
  SELECT * INTO prior FROM evals.workspace_library_setting WHERE org_id = org FOR UPDATE;
  INSERT INTO evals.workspace_library_setting(org_id, sector, monthly_questions, updated_by)
  VALUES (org, CASE WHEN p_clear_sector THEN NULL ELSE p_sector END, coalesce(p_monthly, false), actor)
  ON CONFLICT (org_id) DO UPDATE SET
    sector = CASE WHEN p_clear_sector THEN NULL ELSE coalesce(p_sector, workspace_library_setting.sector) END,
    monthly_questions = coalesce(p_monthly, workspace_library_setting.monthly_questions),
    updated_by = actor, updated_at = now()
  RETURNING * INTO saved_row;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
  VALUES (org, actor, 'workspace.library_setting', org::text, jsonb_build_object(
    'before', CASE WHEN prior.org_id IS NULL THEN NULL ELSE jsonb_build_object('sector', prior.sector, 'monthly_questions', prior.monthly_questions) END,
    'after', jsonb_build_object('sector', saved_row.sector, 'monthly_questions', saved_row.monthly_questions)));
  RETURN saved_row;
END $$;
REVOKE ALL ON FUNCTION evals.set_workspace_library_setting(text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.set_workspace_library_setting(text, boolean, boolean) TO evals_runtime;

-- Workspaces with monthly new questions on, for the scheduler (no other data).
CREATE FUNCTION evals.monthly_questions_due() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT s.org_id FROM evals.workspace_library_setting s JOIN evals.workspace w ON w.id = s.org_id
   WHERE s.monthly_questions AND w.deleted_at IS NULL
   ORDER BY s.org_id
$$;
REVOKE ALL ON FUNCTION evals.monthly_questions_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.monthly_questions_due() TO evals_scheduler;

/* ------------------------------------------------------ source refresh --- */

-- One monthly re-read of a website source and what it found.
CREATE TABLE evals.source_refresh (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  source_id uuid NOT NULL,
  evaluation_id uuid NOT NULL,
  suite_id uuid NOT NULL,
  previous_revision_id uuid NOT NULL,
  website_job_id uuid,
  new_revision_id uuid,
  status text NOT NULL DEFAULT 'reading' CONSTRAINT source_refresh_status CHECK (status IN ('reading','drafting','proposed','unchanged','skipped','failed')),
  -- Page diff by content hash: {"new": [url], "changed": [url], "removed": n, "unchanged": n}.
  pages jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(pages) = 'object'),
  workflow_id uuid,
  step_id uuid,
  proposal_count integer NOT NULL DEFAULT 0 CHECK (proposal_count BETWEEN 0 AND 100),
  reason_code text CHECK (reason_code IS NULL OR reason_code ~ '^[a-z0-9_]{1,80}$'),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, source_id, period),
  FOREIGN KEY (org_id, source_id) REFERENCES evals.source(org_id, id),
  FOREIGN KEY (org_id, evaluation_id) REFERENCES evals.evaluation(org_id, id),
  FOREIGN KEY (org_id, suite_id) REFERENCES evals.suite(org_id, id),
  FOREIGN KEY (org_id, previous_revision_id) REFERENCES evals.source_revision(org_id, id),
  FOREIGN KEY (org_id, new_revision_id) REFERENCES evals.source_revision(org_id, id),
  FOREIGN KEY (org_id, website_job_id) REFERENCES evals.website_source_job(org_id, id)
);
CREATE INDEX source_refresh_open ON evals.source_refresh(org_id, status, updated_at) WHERE status IN ('reading','drafting');
CREATE INDEX source_refresh_period ON evals.source_refresh(org_id, period);
ALTER TABLE evals.source_refresh ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.source_refresh FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.source_refresh USING (org_id = evals.org_id()) WITH CHECK (org_id = evals.org_id());
REVOKE ALL ON evals.source_refresh FROM PUBLIC;
GRANT SELECT, INSERT ON evals.source_refresh TO evals_runtime;
GRANT UPDATE (website_job_id, new_revision_id, status, pages, workflow_id, step_id, proposal_count, reason_code, updated_at) ON evals.source_refresh TO evals_runtime;

/* --------------------------------------------------- question proposals --- */

CREATE TABLE evals.question_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  refresh_id uuid NOT NULL,
  suite_id uuid NOT NULL,
  source_revision_id uuid NOT NULL,
  anchor_id uuid NOT NULL,
  page_url text CHECK (page_url IS NULL OR length(page_url) <= 2000),
  change_kind text NOT NULL CHECK (change_kind IN ('new_page','changed_page')),
  question text NOT NULL CHECK (length(question) BETWEEN 8 AND 2000),
  expected text NOT NULL CHECK (length(expected) BETWEEN 1 AND 2000),
  key_facts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(key_facts) = 'array' AND jsonb_array_length(key_facts) <= 6),
  quote text NOT NULL CHECK (length(quote) BETWEEN 8 AND 4000),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  difficulty text NOT NULL CHECK (difficulty IN ('routine','advanced','challenge')),
  question_fingerprint text NOT NULL CHECK (question_fingerprint ~ '^[a-f0-9]{64}$'),
  generator_revision_id uuid NOT NULL,
  prompt_revision text NOT NULL CHECK (length(prompt_revision) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'proposed' CONSTRAINT question_proposal_status CHECK (status IN ('proposed','approved','rejected')),
  decided_by text,
  decided_at timestamptz,
  case_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, refresh_id, question_fingerprint),
  CONSTRAINT question_proposal_decision CHECK ((status = 'proposed') = (decided_by IS NULL AND decided_at IS NULL)
    AND (status = 'approved') = (case_revision_id IS NOT NULL)),
  FOREIGN KEY (org_id, refresh_id) REFERENCES evals.source_refresh(org_id, id),
  FOREIGN KEY (org_id, suite_id) REFERENCES evals.suite(org_id, id),
  FOREIGN KEY (org_id, source_revision_id) REFERENCES evals.source_revision(org_id, id),
  FOREIGN KEY (org_id, case_revision_id) REFERENCES evals.case_revision(org_id, id)
);
CREATE INDEX question_proposal_suite ON evals.question_proposal(org_id, suite_id, status, created_at DESC);
ALTER TABLE evals.question_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.question_proposal FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.question_proposal USING (org_id = evals.org_id()) WITH CHECK (org_id = evals.org_id() AND status = 'proposed');
REVOKE ALL ON evals.question_proposal FROM PUBLIC;
GRANT SELECT, INSERT ON evals.question_proposal TO evals_runtime;

CREATE FUNCTION evals.guard_question_proposal() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, evals AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'question proposals are kept as evidence' USING ERRCODE = '55000'; END IF;
  IF OLD.status <> 'proposed' THEN RAISE EXCEPTION 'a decided question proposal is immutable' USING ERRCODE = '55000'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','decided_by','decided_at','case_revision_id']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by','decided_at','case_revision_id']) THEN
    RAISE EXCEPTION 'a question proposal changes only by its decision' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_proposal_guard BEFORE UPDATE OR DELETE ON evals.question_proposal
  FOR EACH ROW EXECUTE FUNCTION evals.guard_question_proposal();

-- An owner, editor or operator (or Caudals staff) approves a proposal into
-- the test set (with the case revision that carries it) or rejects it.
CREATE FUNCTION evals.decide_question_proposal(p_id uuid, p_decision text, p_case_revision_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE org uuid := evals.org_id(); actor text := evals.actor_id(); proposal evals.question_proposal;
BEGIN
  IF org IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'workspace context required' USING ERRCODE = '42501'; END IF;
  IF NOT evals.is_platform_staff() AND NOT EXISTS (SELECT 1 FROM evals.membership WHERE org_id = org AND user_id = actor AND role IN ('owner','editor','operator')) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'unknown decision' USING ERRCODE = '22023'; END IF;
  SELECT * INTO proposal FROM evals.question_proposal WHERE org_id = org AND id = p_id FOR UPDATE;
  IF proposal.id IS NULL THEN RAISE EXCEPTION 'unknown question proposal' USING ERRCODE = 'P0002'; END IF;
  IF proposal.status <> 'proposed' THEN RAISE EXCEPTION 'this question was already decided' USING ERRCODE = '55000'; END IF;
  IF p_decision = 'approved' AND NOT EXISTS (
       SELECT 1 FROM evals.case_revision cr WHERE cr.org_id = org AND cr.id = p_case_revision_id
          AND cr.document->'extensions'->'caudals.evals/monthly-proposal'->>'proposal_id' = p_id::text) THEN
    RAISE EXCEPTION 'an approved proposal needs the case revision that carries it' USING ERRCODE = '22023';
  END IF;
  UPDATE evals.question_proposal SET status = p_decision, decided_by = actor, decided_at = now(),
    case_revision_id = CASE WHEN p_decision = 'approved' THEN p_case_revision_id END
  WHERE org_id = org AND id = p_id;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
  VALUES (org, actor, 'question_proposal.' || p_decision, p_id::text, jsonb_build_object('suite_id', proposal.suite_id, 'refresh_id', proposal.refresh_id, 'case_revision_id', p_case_revision_id));
END $$;
REVOKE ALL ON FUNCTION evals.decide_question_proposal(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.decide_question_proposal(uuid, text, uuid) TO evals_runtime;

COMMIT;
