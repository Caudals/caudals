-- UI review leftovers (launch U1, 2026-10-15). Read-only additions: no table,
-- column or row changes.
--
-- * evals.list_workspace_people(p_org_id): the people in a workspace, with
--   their names and roles, for Settings → Members. The caller must be scoped
--   to that workspace (evals.org_id()) and allowed to manage it: a platform
--   admin, or a member holding the owner or operator role. That is the rule
--   of the invitations policy (031 manage_invites) and of
--   requireWorkspace(..., "manage"). Anyone else gets no rows. Other people's
--   memberships and every auth name and address are not readable by the
--   runtime role, hence SECURITY DEFINER.
-- * evals.expert_name(p_profile_id): an expert's display name for the ops
--   review-order and expert-bench screens. Platform staff only
--   (evals.is_operator()); everyone else gets NULL. Customers never receive
--   expert identities.
-- * billing.fraud_queue: each top-up velocity row also carries peak_24h, the
--   most top-ups the workspace started within any 24 hours of the period.
--   That is the count the queue's criterion (three or more) is about; the
--   rows used to show only the last 24 hours, which read "0" for an older
--   burst. The function body is otherwise 094's.
--
-- Forward repair: drop the two new functions and restore fraud_queue from
-- 094; the rollback does exactly that.
BEGIN;

CREATE FUNCTION evals.list_workspace_people(p_org_id uuid)
RETURNS TABLE (user_id text, name text, email text, role text, joined_at timestamptz, partner_managed boolean, is_self boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, public AS $$
  SELECT m.user_id, u.name::text, u.email::text, m.role, m.created_at, m.partner_id IS NOT NULL, m.user_id = evals.actor_id()
  FROM evals.membership m
  JOIN public.auth_user u ON u.id = m.user_id
  JOIN evals.workspace w ON w.id = m.org_id AND w.deleted_at IS NULL
  WHERE p_org_id = evals.org_id() AND m.org_id = p_org_id
    AND (evals.is_admin() OR EXISTS (
      SELECT 1 FROM evals.membership me
      WHERE me.org_id = p_org_id AND me.user_id = evals.actor_id() AND me.role IN ('owner', 'operator')))
  ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 WHEN 'viewer' THEN 2 ELSE 3 END, lower(u.email), m.user_id
  LIMIT 500
$$;
REVOKE ALL ON FUNCTION evals.list_workspace_people(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.list_workspace_people(uuid) TO evals_runtime;

CREATE FUNCTION evals.expert_name(p_profile_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, public AS $$
  SELECT nullif(btrim(u.name::text), '')
  FROM evals.expert_profile p JOIN public.auth_user u ON u.id = p.user_id
  WHERE p.id = p_profile_id AND evals.is_operator()
$$;
REVOKE ALL ON FUNCTION evals.expert_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.expert_name(uuid) TO evals_runtime;

CREATE OR REPLACE FUNCTION billing.fraud_queue(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE since timestamptz; signups jsonb; velocity jsonb; flagged jsonb; disputes jsonb; frozen jsonb;
BEGIN
  IF billing.actor_kind(billing._actor()) <> 'user' OR NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  since := now() - make_interval(days => p_days);
  WITH free AS (
    SELECT w.id, w.name, w.created_at,
      (SELECT min(split_part(lower(u.email), '@', 2)) FROM evals.membership m JOIN public.auth_user u ON u.id = m.user_id
        WHERE m.org_id = w.id AND m.role = 'owner') AS domain,
      (SELECT count(DISTINCT lower(split_part(split_part(tr.document->>'endpoint', '://', 2), '/', 1)))
        FROM evals.target_revision tr WHERE tr.org_id = w.id AND tr.created_at > now() - interval '30 days'
          AND tr.document->>'endpoint' LIKE 'http%') AS hosts,
      (SELECT count(*) FROM evals.run r WHERE r.org_id = w.id AND r.created_at > now() - interval '1 day') AS runs_day
    FROM evals.workspace w JOIN evals.workspace_entitlement e ON e.org_id = w.id AND e.plan = 'free'
    WHERE w.deleted_at IS NULL AND w.created_at > since
  ), shared AS (
    SELECT domain FROM free WHERE domain IS NOT NULL GROUP BY domain HAVING count(*) > 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('org_id', f.id, 'workspace', f.name, 'created_at', f.created_at, 'domain', f.domain,
      'hosts', f.hosts, 'runs_last_day', f.runs_day, 'flags', to_jsonb(array_remove(ARRAY[
        CASE WHEN f.hosts >= 3 THEN 'many_hosts' END,
        CASE WHEN f.domain IN (SELECT domain FROM shared) THEN 'shared_domain' END,
        CASE WHEN f.runs_day >= 3 THEN 'many_runs' END], NULL))) ORDER BY f.created_at DESC), '[]'::jsonb)
  INTO signups
  FROM free f WHERE f.hosts >= 3 OR f.runs_day >= 3 OR f.domain IN (SELECT domain FROM shared);

  SELECT coalesce(jsonb_agg(jsonb_build_object('org_id', v.org_id, 'workspace', w.name, 'orders_24h', v.n24, 'orders', v.n,
      'peak_24h', v.peak, 'failed', v.failed, 'paid_net_cents', v.paid) ORDER BY v.peak DESC, v.n24 DESC, v.failed DESC), '[]'::jsonb)
  INTO velocity
  FROM (SELECT o.org_id, count(*) AS n, count(*) FILTER (WHERE o.created_at > now() - interval '24 hours') AS n24,
          count(*) FILTER (WHERE o.status = 'failed' OR o.failure_count > 0) AS failed,
          coalesce(sum(o.net_cents) FILTER (WHERE o.paid_at IS NOT NULL), 0) AS paid, max(p.c) AS peak
        FROM billing.top_up_order o
        CROSS JOIN LATERAL (SELECT count(*) AS c FROM billing.top_up_order x
          WHERE x.org_id = o.org_id AND x.created_at BETWEEN o.created_at - interval '24 hours' AND o.created_at) p
        WHERE o.created_at > since GROUP BY o.org_id) v
  JOIN evals.workspace w ON w.id = v.org_id
  WHERE v.peak >= 3 OR v.failed >= 2;

  SELECT coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'org_id', o.org_id, 'workspace', w.name, 'status', o.status,
      'livemode', o.livemode, 'net_cents', o.net_cents, 'card_country', o.card_country, 'flags', to_jsonb(o.risk_flags), 'created_at', o.created_at)
      ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO flagged
  FROM billing.top_up_order o JOIN evals.workspace w ON w.id = o.org_id
  WHERE o.created_at > since AND cardinality(o.risk_flags) > 0;

  SELECT coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'org_id', o.org_id, 'workspace', w.name, 'status', o.status,
      'livemode', o.livemode, 'net_cents', o.net_cents, 'dispute', o.stripe_dispute_id, 'updated_at', o.updated_at) ORDER BY o.updated_at DESC), '[]'::jsonb)
  INTO disputes
  FROM billing.top_up_order o JOIN evals.workspace w ON w.id = o.org_id
  WHERE o.status IN ('disputed','charged_back') OR (o.stripe_dispute_id IS NOT NULL AND o.updated_at > since);

  SELECT coalesce(jsonb_agg(jsonb_build_object('org_id', a.org_id, 'workspace', w.name, 'frozen_reason', a.frozen_reason,
      'available_ucr', a.available_ucr, 'updated_at', a.updated_at) ORDER BY a.updated_at DESC), '[]'::jsonb)
  INTO frozen
  FROM billing.credit_account a JOIN evals.workspace w ON w.id = a.org_id AND w.deleted_at IS NULL WHERE a.frozen_reason IS NOT NULL;

  RETURN jsonb_build_object('since', since, 'signups', signups, 'velocity', velocity, 'flagged_orders', flagged, 'disputes', disputes,
    'frozen_accounts', frozen);
END $$;

COMMIT;
