-- Launch L-01 (spec v2, P-41/P-42): evidence that a person accepted a legal
-- document, with the version they saw.
--
-- evals.terms_acceptance is append-only: one row per document accepted, never
-- updated or deleted (a trigger refuses both, even for the owner). Rows are
-- written only through evals.record_terms_acceptance(), which records for the
-- transaction's actor (evals.actor_id()) and, when a workspace is named,
-- requires the actor to be a member of it. Sign-up records `terms` and
-- `privacy` with context `signup`; checkout (L-12) and the DPA click-through
-- (L-30) reuse the same function with contexts `checkout` and `dpa`. Document
-- and context are checked by format rather than by a fixed list, so a later
-- package adds a value without a schema change; the application keeps the
-- list of known values (lib/legal/versions.ts).
--
-- A request id makes a retry idempotent: the same actor, document, version,
-- context and request id return the first row.
--
-- Forward repair: purely additive. The rollback refuses while any acceptance
-- exists, because the rows are legal evidence.
BEGIN;

CREATE TABLE evals.terms_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.auth_user(id),
  org_id uuid REFERENCES evals.workspace(id),
  document text NOT NULL CONSTRAINT terms_acceptance_document_format
    CHECK (document ~ '^[a-z][a-z0-9_]{1,39}$'),
  version text NOT NULL CONSTRAINT terms_acceptance_version_format
    CHECK (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([.-][a-z0-9]{1,16})?$'),
  context text NOT NULL CONSTRAINT terms_acceptance_context_format
    CHECK (context ~ '^[a-z][a-z0-9_]{1,39}$'),
  locale text CHECK (locale IS NULL OR locale IN ('en','es')),
  request_id text CHECK (request_id IS NULL OR length(request_id) BETWEEN 1 AND 200),
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX terms_acceptance_user ON evals.terms_acceptance (user_id, document, accepted_at DESC);
CREATE INDEX terms_acceptance_org ON evals.terms_acceptance (org_id, document, accepted_at DESC)
  WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX terms_acceptance_request ON evals.terms_acceptance (user_id, document, version, context, request_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE evals.terms_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.terms_acceptance FORCE ROW LEVEL SECURITY;
-- A person sees their own acceptances; workspace members see the workspace's
-- (L-30 shows DPA status in Settings); platform administrators see all.
CREATE POLICY terms_acceptance_read ON evals.terms_acceptance FOR SELECT USING (
  user_id = evals.actor_id()
  OR evals.is_admin()
  OR (org_id IS NOT NULL AND org_id = evals.org_id() AND EXISTS (
    SELECT 1 FROM evals.membership m WHERE m.org_id = terms_acceptance.org_id AND m.user_id = evals.actor_id()))
);

CREATE FUNCTION evals.terms_acceptance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable terms acceptance' USING ERRCODE = '55000'; END $$;
CREATE TRIGGER terms_acceptance_immutable BEFORE UPDATE OR DELETE ON evals.terms_acceptance
  FOR EACH ROW EXECUTE FUNCTION evals.terms_acceptance_immutable();
CREATE TRIGGER terms_acceptance_no_truncate BEFORE TRUNCATE ON evals.terms_acceptance
  FOR EACH STATEMENT EXECUTE FUNCTION evals.terms_acceptance_immutable();

REVOKE ALL ON evals.terms_acceptance FROM PUBLIC;
GRANT SELECT ON evals.terms_acceptance TO evals_runtime;

CREATE FUNCTION evals.record_terms_acceptance(
  p_org_id uuid, p_document text, p_version text, p_context text, p_locale text, p_request_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  recorded uuid;
  recorded_org uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF p_org_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM evals.membership m JOIN evals.workspace w ON w.id = m.org_id
    WHERE m.org_id = p_org_id AND m.user_id = actor AND w.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'SCOPE_DENIED';
  END IF;
  INSERT INTO evals.terms_acceptance (user_id, org_id, document, version, context, locale, request_id)
    VALUES (actor, p_org_id, p_document, p_version, p_context, p_locale, p_request_id)
    ON CONFLICT (user_id, document, version, context, request_id) WHERE request_id IS NOT NULL DO NOTHING
    RETURNING id INTO recorded;
  IF recorded IS NULL THEN
    SELECT t.id, t.org_id INTO recorded, recorded_org FROM evals.terms_acceptance t
    WHERE t.user_id = actor AND t.document = p_document AND t.version = p_version
      AND t.context = p_context AND t.request_id = p_request_id;
    IF recorded_org IS DISTINCT FROM p_org_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  END IF;
  RETURN recorded;
END $$;

REVOKE ALL ON FUNCTION evals.record_terms_acceptance(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.record_terms_acceptance(uuid, text, text, text, text, text) TO evals_runtime;

COMMIT;
