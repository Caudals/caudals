-- Restores the 087 cohort (free workspaces only). Safe at any time: it
-- changes one function body and no data; emails already sent stay recorded.
BEGIN;

CREATE OR REPLACE FUNCTION evals.lifecycle_email_candidates(p_limit integer DEFAULT 200)
RETURNS TABLE (
  user_id text, org_id uuid, workspace_name text, email text, name text, locale text, signed_up_at timestamptz,
  has_test_set boolean, has_run boolean, has_report boolean, first_report_at timestamptz,
  shared boolean, runs_after_first_report integer, last_activity_at timestamptz,
  recorded jsonb, last_sent_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, public AS $$
  WITH cohort AS (
    SELECT DISTINCT ON (s.org_id) s.org_id, w.name AS workspace_name, m.user_id, u.email, u.name, s.locale AS signup_locale, s.consumed_at AS signed_up_at
    FROM evals.self_serve_signup s
    JOIN evals.workspace w ON w.id = s.org_id AND w.deleted_at IS NULL
    JOIN evals.workspace_entitlement e ON e.org_id = s.org_id AND e.plan = 'free'
    JOIN evals.membership m ON m.org_id = s.org_id AND m.role = 'owner'
    JOIN public.auth_user u ON u.id = m.user_id AND u."emailVerified"
    WHERE s.consumed_at IS NOT NULL AND s.consumed_at > now() - interval '45 days'
      AND NOT EXISTS (SELECT 1 FROM evals.platform_role r WHERE r.user_id = m.user_id)
      AND NOT EXISTS (SELECT 1 FROM evals.email_preference p WHERE p.user_id = m.user_id AND NOT p.lifecycle)
    ORDER BY s.org_id, m.created_at
  ), facts AS (
    SELECT c.*,
      (SELECT min(rr.created_at) FROM evals.report rp
         JOIN evals.report_revision rr ON rr.org_id = rp.org_id AND rr.report_id = rp.id
        WHERE rp.org_id = c.org_id AND rp.publication_status IN ('published','superseded')) AS first_report
    FROM cohort c
  )
  SELECT f.user_id, f.org_id, f.workspace_name, f.email, f.name,
    COALESCE(p.locale, f.signup_locale, 'en'),
    f.signed_up_at,
    EXISTS (SELECT 1 FROM evals.generation_job g WHERE g.org_id = f.org_id AND (g.status = 'needs_review' OR g.suite_version_id IS NOT NULL))
      OR EXISTS (SELECT 1 FROM evals.run r WHERE r.org_id = f.org_id),
    EXISTS (SELECT 1 FROM evals.run r WHERE r.org_id = f.org_id),
    f.first_report IS NOT NULL,
    f.first_report,
    EXISTS (SELECT 1 FROM evals.share_grant g WHERE g.org_id = f.org_id)
      OR EXISTS (SELECT 1 FROM evals.invitation i WHERE i.org_id = f.org_id)
      OR (SELECT count(*) FROM evals.membership m2 WHERE m2.org_id = f.org_id) > 1,
    (SELECT count(*)::integer FROM evals.run r WHERE r.org_id = f.org_id AND f.first_report IS NOT NULL AND r.created_at > f.first_report),
    GREATEST(
      f.signed_up_at,
      (SELECT max(r.created_at) FROM evals.run r WHERE r.org_id = f.org_id),
      (SELECT max(v.created_at) FROM evals.evaluation v WHERE v.org_id = f.org_id),
      (SELECT max(g.created_at) FROM evals.generation_job g WHERE g.org_id = f.org_id),
      (SELECT max(x."createdAt") FROM public.auth_session x WHERE x."userId" = f.user_id)),
    COALESCE((SELECT jsonb_object_agg(l.step, jsonb_build_object('status', l.status, 'attempts', l.attempts, 'updated_at', l.updated_at))
      FROM evals.lifecycle_email l WHERE l.user_id = f.user_id), '{}'::jsonb),
    (SELECT max(l.sent_at) FROM evals.lifecycle_email l WHERE l.user_id = f.user_id AND l.status = 'sent')
  FROM facts f
  LEFT JOIN evals.email_preference p ON p.user_id = f.user_id
  ORDER BY f.signed_up_at
  LIMIT LEAST(GREATEST(p_limit, 1), 1000)
$$;

COMMIT;
