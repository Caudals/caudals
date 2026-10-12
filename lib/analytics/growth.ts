import "server-only";
import { withTenant } from "@/lib/evals/repositories/db";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { EvalError } from "@/lib/evals/domain/errors";
import { analyticsV2Enabled } from "./funnel-events-server";
export type GrowthData = {
  weeks: { week: string; events: Record<string, number> }[];
  outcomes: { outcome: string; reason: string; count: number }[];
  sources: { source: string; visits: number; demos: number; accounts: number; activated: number }[];
  accounts: ({ orgId: string; createdAt: string; source: string; stage: string; systemType?: string | null; goal?: string | null } & Partial<AccountDetails>)[];
  cohorts: { week: string; accounts: number; active: number[] }[];
  /** Demo sign-ups per week and how many reached "test set ready" within 30 minutes (P-01, launch L-06). */
  activation?: { week: string; demoSignups: number; testSetIn30: number }[];
  /** "Get help" requests from first evaluations (launch L-06): open ones first, then the last 14 days. */
  help?: { id: string; orgId: string; evaluationId: string | null; reason: string; status: "open" | "resolved"; createdAt: string; notified: boolean }[];
};
/** Pipeline details per account (launch L-21, P-34 v2); null means unknown or not yet, never an invented zero. */
export type AccountDetails = {
  company: string | null;
  connection: string | null;
  lastActivity: string | null;
  latestScore: number | null;
  latestScored: number | null;
  creditsBought: number | null;
  plan: string | null;
  emailDomain: string | null;
  hasReport: boolean;
};
type WorkspaceDetailRow = { org_id: string; name: string; plan: string | null; connection_kind: string | null; last_activity: Date | string | null; latest_score: string | null; latest_scored: number | null; credits_bought: string | null; owner_domain: string | null; report_at: Date | string | null };
const num = (value: string | number | null | undefined) => (value === null || value === undefined ? null : Number(value));
export async function getGrowth(identity: EvalIdentity): Promise<GrowthData> {
  if (!analyticsV2Enabled() || !identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return withTenant({ orgId: "", actorId: identity.user.id }, async db => {
    await db.query("SET LOCAL statement_timeout='1500ms'");
    // SQL repeats the role check through RLS; a forged in-memory identity cannot read events.
    const authorized = (await db.query("SELECT 1 FROM evals.platform_role WHERE user_id=$1 AND role IN ('operator','platform_admin')", [identity.user.id])).rowCount;
    if (!authorized) throw new EvalError("SCOPE_DENIED", 404);
    const { rows } = await db.query(`WITH recent AS MATERIALIZED (
      SELECT event_name,org_id,metadata,attribution,occurred_at,date_trunc('week',occurred_at) AS week
      FROM public.product_analytics_event e WHERE occurred_at>=date_trunc('week',now())-interval '7 weeks'
        AND (e.org_id IS NULL OR NOT EXISTS(SELECT 1 FROM evals.prospect_snapshot p WHERE p.org_id=e.org_id))
    ), weeks AS (SELECT generate_series(date_trunc('week',now())-interval '7 weeks',date_trunc('week',now()),interval '1 week') AS week),
    counts AS (SELECT week,event_name,count(*)::int AS n FROM recent GROUP BY week,event_name),
    accounts AS (SELECT DISTINCT ON(org_id) org_id,occurred_at,week,metadata->>'acquisition' AS acquisition,
       COALESCE(NULLIF(attribution->>'utm_source',''),NULLIF(attribution->>'partner',''),NULLIF(attribution->>'ref',''),metadata->>'acquisition','unknown') AS source
       FROM recent WHERE event_name='account_created' AND org_id IS NOT NULL ORDER BY org_id,occurred_at),
    activation AS (SELECT org_id,min(occurred_at) AS at FROM recent WHERE event_name='report_viewed' GROUP BY org_id),
    stages AS (SELECT org_id,max(CASE event_name WHEN 'report_viewed' THEN 5 WHEN 'run_finished' THEN 4 WHEN 'run_started' THEN 3 WHEN 'test_set_ready' THEN 2 WHEN 'evaluation_created' THEN 1 ELSE 0 END) AS stage FROM recent GROUP BY org_id),
    by_source AS (SELECT COALESCE(NULLIF(r.attribution->>'utm_source',''),NULLIF(r.attribution->>'partner',''),NULLIF(r.attribution->>'ref',''),a.source,'unknown') AS source,
      count(*) FILTER(WHERE r.event_name='page_view')::int AS visits,
      count(*) FILTER(WHERE r.event_name='demo_started')::int AS demos,
      count(*) FILTER(WHERE r.event_name='account_created')::int AS accounts,
      count(DISTINCT r.org_id) FILTER(WHERE r.event_name='report_viewed')::int AS activated
      FROM recent r LEFT JOIN accounts a ON a.org_id=r.org_id GROUP BY 1),
    activity AS (SELECT DISTINCT org_id,week FROM recent WHERE org_id IS NOT NULL AND event_name IN ('run_started','report_viewed'))
    SELECT
      (SELECT jsonb_agg(jsonb_build_object('week',to_char(w.week,'YYYY-MM-DD'),'events',COALESCE((SELECT jsonb_object_agg(event_name,n) FROM counts c WHERE c.week=w.week),'{}'::jsonb)) ORDER BY w.week) FROM weeks w) AS weeks,
      (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (SELECT COALESCE(metadata->>'outcome','unknown') AS outcome,COALESCE(metadata->>'error_code','none') AS reason,count(*)::int AS count FROM recent WHERE event_name='demo_finished' GROUP BY 1,2 ORDER BY 3 DESC) x) AS outcomes,
      (SELECT COALESCE(jsonb_agg(s),'[]'::jsonb) FROM (SELECT * FROM by_source ORDER BY accounts DESC,demos DESC,visits DESC LIMIT 100) s) AS sources,
      (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (SELECT a.org_id AS "orgId",a.occurred_at AS "createdAt",a.source,
        CASE s.stage WHEN 5 THEN 'report_viewed' WHEN 4 THEN 'run_finished' WHEN 3 THEN 'run_started' WHEN 2 THEN 'test_set_ready' WHEN 1 THEN 'evaluation_created' ELSE 'account_created' END AS stage,
        o.system_type AS "systemType",o.goal
        FROM accounts a LEFT JOIN stages s ON s.org_id=a.org_id LEFT JOIN evals.workspace_onboarding o ON o.org_id=a.org_id ORDER BY a.occurred_at DESC LIMIT 200) x) AS accounts,
      (SELECT jsonb_agg(jsonb_build_object('week',to_char(w.week,'YYYY-MM-DD'),
        'demoSignups',(SELECT count(*) FROM accounts a WHERE a.week=w.week AND a.acquisition='demo'),
        'testSetIn30',(SELECT count(*) FROM accounts a WHERE a.week=w.week AND a.acquisition='demo' AND EXISTS(
          SELECT 1 FROM recent t WHERE t.event_name='test_set_ready' AND t.org_id=a.org_id AND t.occurred_at<=a.occurred_at+interval '30 minutes'))) ORDER BY w.week) FROM weeks w) AS activation,
      (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (SELECT h.id,h.org_id AS "orgId",h.evaluation_id AS "evaluationId",h.reason_code AS reason,h.status,h.created_at AS "createdAt",h.notified_at IS NOT NULL AS notified
        FROM evals.onboarding_help_request h WHERE h.status='open' OR h.created_at>now()-interval '14 days'
        ORDER BY (h.status='open') DESC,h.created_at DESC LIMIT 50) x) AS help,
      (SELECT jsonb_agg(jsonb_build_object('week',to_char(w.week,'YYYY-MM-DD'),'accounts',(SELECT count(*) FROM accounts a WHERE a.week=w.week),
        'active',(SELECT jsonb_agg((SELECT count(DISTINCT a.org_id) FROM accounts a JOIN activity v ON v.org_id=a.org_id WHERE a.week=w.week AND v.week=w.week+g.n*interval '1 week') ORDER BY g.n) FROM generate_series(0,7) g(n))) ORDER BY w.week) FROM weeks w) AS cohorts`);
    const growth = rows[0] as GrowthData;
    // Prospect sandboxes are ours, not accounts: excluded above and from the details.
    const details = new Map((await db.query<WorkspaceDetailRow>("SELECT * FROM evals.ops_workspace_details()")).rows.map(row => [row.org_id, row]));
    growth.accounts = growth.accounts.map(account => {
      const row = details.get(account.orgId);
      return { ...account, company: row?.name ?? null, connection: row?.connection_kind ?? null, lastActivity: row?.last_activity ? new Date(row.last_activity).toISOString() : null,
        latestScore: num(row?.latest_score), latestScored: row?.latest_scored ?? null, creditsBought: num(row?.credits_bought), plan: row?.plan ?? null, emailDomain: row?.owner_domain ?? null, hasReport: !!row?.report_at };
    });
    return growth;
  });
}
