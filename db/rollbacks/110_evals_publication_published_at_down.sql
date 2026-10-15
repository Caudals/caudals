-- Rollback for db/migrations/110_evals_publication_published_at.sql: puts back
-- the migration 104 bodies of the three functions (which read
-- report_revision.published_at) and drops the helper. Rows are untouched.
BEGIN;

CREATE OR REPLACE FUNCTION evals.record_publication_consent(
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

CREATE OR REPLACE FUNCTION evals.publish_result_page(p_consent uuid, p_slug text, p_review_note text)
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

CREATE OR REPLACE FUNCTION evals.sector_index_inputs(p_quarter text)
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

DROP FUNCTION IF EXISTS evals.revision_published_at(uuid, uuid);
DELETE FROM public.evals_migration_history WHERE name = '110_evals_publication_published_at.sql';

COMMIT;
