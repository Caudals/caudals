/**
 * The monthly allowance (launch spec v2 §6.5, §6.10; D-08; package L-14):
 * 1,000 credits a month for every free and pay-as-you-go workspace. It is a
 * `grant` of source `allowance` (no price, so no cash value and no VAT) that
 * expires at the end of the UTC month, granted once per workspace per month:
 * the ledger key `allowance:<YYYY-MM>` is unique per workspace, so a second
 * run, a second scheduler or a retry replays the first grant.
 *
 * Runs in the evals scheduler (every minute, cheap when nothing is due) while
 * BILLING_CREDITS_ENABLED is on, and grants only with PLANS_V2_ENABLED or to
 * workspaces an admin switched to plans v2 (billing.workspace_override). Work
 * paused for credits resumes once the allowance lands, so a new free
 * workspace whose first preparation started a few seconds before its grant
 * carries on by itself.
 */
import type { Pool, PoolClient } from "pg";
import { withTenant } from "../evals/repositories/db";
import { resumeCreditPausedWork } from "../evals/queue/credit-pause";
import { billingCreditsEnabled, monthEnd } from "./config";
import { grantCredits, type LedgerEntry } from "./ledger";
import { MONTHLY_ALLOWANCE_CREDITS, plansV2Enabled } from "./plans";
import { creditsToUcr } from "./units";

type Env = Record<string, string | undefined>;

export const ALLOWANCE_CAMPAIGN = "monthly_allowance";

/** The UTC month an allowance belongs to, as YYYY-MM. */
export function allowancePeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The grant's idempotency key (the ledger stores it as grant:allowance:<YYYY-MM>). */
export const allowanceKey = (period: string) => `allowance:${period}`;

export interface AllowanceTick { due: number; granted: number; failed: number; resumed: number }

/** Grants this month's allowance to one workspace (idempotent), in the caller's transaction. */
export async function grantMonthlyAllowance(db: PoolClient, orgId: string, now = new Date()): Promise<LedgerEntry> {
  const period = allowancePeriod(now);
  return grantCredits(db, {
    orgId, key: allowanceKey(period), amountUcr: creditsToUcr(MONTHLY_ALLOWANCE_CREDITS), source: "allowance",
    expiresAt: monthEnd(now), reason: `Monthly allowance ${period}`, campaign: ALLOWANCE_CAMPAIGN, refKind: "allowance", refId: period,
  });
}

/** One pass: every due workspace gets this month's allowance, each in its own transaction. */
export async function runMonthlyAllowance(actorId: string, options: { now?: Date; env?: Env; pool?: Pool; limit?: number } = {}): Promise<AllowanceTick> {
  const tick: AllowanceTick = { due: 0, granted: 0, failed: 0, resumed: 0 };
  const env = options.env ?? process.env;
  if (!billingCreditsEnabled(env)) return tick;
  const now = options.now ?? new Date();
  const period = allowancePeriod(now);
  const due = await withTenant({ orgId: "", actorId }, async db =>
    (await db.query("SELECT billing.allowance_due($1,$2,$3) AS org_id", [period, plansV2Enabled(env), options.limit ?? 200])).rows.map(row => String(row.org_id)),
  options.pool);
  tick.due = due.length;
  for (const orgId of due) {
    try {
      await withTenant({ orgId, actorId }, async db => {
        await grantMonthlyAllowance(db, orgId, now);
        tick.granted++;
        tick.resumed += await resumeCreditPausedWork(db, orgId);
      }, options.pool);
    } catch (error) {
      tick.failed++;
      console.error(JSON.stringify({ event: "billing_allowance_failed", orgId, code: error instanceof Error && /^[A-Z_]{3,40}$/.test(error.message) ? error.message : "unknown" }));
    }
  }
  return tick;
}
