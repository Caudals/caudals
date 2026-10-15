-- Gap G3 (launch L-31 follow-up): the list of live public results pages, for
-- the sitemap and llms.txt once PUBLIC_RESULTS_INDEXED is on.
--
-- Same rule as evals.public_result_page_view (migration 104): published, not
-- taken down, its consent standing and covering a results page, the workspace
-- not deleted, the report not withdrawn and not a prospect sandbox. Returns
-- only the frozen public projection, the slug and the publication date.
-- Called by the public site with no tenant context. Additive: one function.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE FUNCTION evals.public_result_pages(p_limit integer DEFAULT 1000)
RETURNS TABLE (slug text, projection jsonb, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT p.slug, p.projection, p.published_at
  FROM evals.public_result_page p
  JOIN evals.publication_consent c ON (c.org_id, c.id) = (p.org_id, p.consent_id)
  JOIN evals.workspace w ON w.id = p.org_id
  JOIN evals.report r ON (r.org_id, r.id) = (c.org_id, c.report_id)
  WHERE p.unpublished_at IS NULL
    AND c.revoked_at IS NULL AND c.results_page
    AND w.deleted_at IS NULL AND r.publication_status <> 'withdrawn'
    AND NOT EXISTS (SELECT 1 FROM evals.prospect_snapshot ps WHERE ps.org_id = p.org_id)
  ORDER BY p.published_at DESC, p.slug
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000)
$$;

REVOKE ALL ON FUNCTION evals.public_result_pages(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.public_result_pages(integer) TO evals_runtime;

COMMIT;
