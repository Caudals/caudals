import "server-only";
import { withTenant } from "@/lib/evals/repositories/db";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { health } from "@/lib/demo/health";
import { GROWTH_TARGETS, ratio, targetStage, type GrowthTargets, type OpsDigestData, type TargetStage } from "./targets";

/**
 * Growth KPIs and demo health for the ops Overview (launch L-21, spec v2
 * §5.3): the last seven days from the same aggregates as the weekly digest,
 * against the §7.11 targets in force. Unknown values are null, never 0.
 */
export type OpsKpis = {
  stage: TargetStage;
  targets: GrowthTargets;
  signups: number;
  activation: { activated: number; cohort: number; rate: number | null };
  payingCustomers: number | null;
  snapshotsShared: number;
  stuckRuns: number;
  demo: {
    starts: number;
    finished: number;
    succeeded: number;
    successRate: number | null;
    p50Seconds: number | null;
    failures: Array<{ reason: string; count: number }>;
    queue: number;
    primaryDown: boolean;
    fallbackDown: boolean;
  };
};

export async function getOpsKpis(identity: EvalIdentity): Promise<OpsKpis | null> {
  if (!identity.platformRole) return null;
  try {
    const data = await withTenant({ orgId: "", actorId: identity.user.id }, async (db) => {
      await db.query("SET LOCAL statement_timeout='1500ms'");
      return (await db.query("SELECT evals.ops_digest_data(now()-interval '7 days',now()) AS data")).rows[0].data as OpsDigestData;
    });
    const f = data.funnel;
    const stage = targetStage();
    const circuits = health();
    return {
      stage,
      targets: GROWTH_TARGETS[stage],
      signups: f.new_accounts,
      activation: { activated: f.activation_activated, cohort: f.activation_cohort, rate: ratio(f.activation_activated, f.activation_cohort) },
      payingCustomers: f.purchases_recorded ? f.paying_customers : null,
      snapshotsShared: f.snapshots_shared,
      stuckRuns: data.stuck_run_count,
      demo: {
        starts: f.demo_starts, finished: f.demo_finished, succeeded: f.demo_succeeded, successRate: ratio(f.demo_succeeded, f.demo_finished),
        p50Seconds: f.demo_p50_s === null ? null : Number(f.demo_p50_s), failures: data.demo_failures.slice(0, 3), queue: data.demo_queue,
        primaryDown: circuits.primary.down, fallbackDown: circuits.fallback.down,
      },
    };
  } catch {
    // The overview must render even if the aggregates are slow or unavailable.
    return null;
  }
}

/** Per-workspace plan, credits, activity and owner domain for the Clients view (launch L-21). */
export type ClientDetail = {
  orgId: string;
  kind: "client" | "free" | "snapshot";
  plan: string | null;
  billingMode: string | null;
  credits: number | null;
  creditsBought: number | null;
  lastActivity: string | null;
  emailDomain: string | null;
  latestScore: number | null;
};

export async function getClientDetails(identity: EvalIdentity): Promise<ClientDetail[]> {
  if (!identity.platformRole) return [];
  const rows = await withTenant({ orgId: "", actorId: identity.user.id }, async (db) => (await db.query("SELECT * FROM evals.ops_workspace_details()")).rows);
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return rows.map((row) => ({
    orgId: row.org_id, kind: row.kind, plan: row.plan ?? null, billingMode: row.billing_mode ?? null, credits: num(row.available_credits),
    creditsBought: num(row.credits_bought), lastActivity: row.last_activity ? new Date(row.last_activity).toISOString() : null,
    emailDomain: row.owner_domain ?? null, latestScore: num(row.latest_score),
  }));
}
