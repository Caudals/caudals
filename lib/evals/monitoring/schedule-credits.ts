/**
 * Schedules on credits (launch L-18, spec v2 P-24, §6.7, §6.10).
 *
 * A schedule may carry a credit cap: the most its runs may use in one UTC
 * month (billing.spend_cap, scope 'schedule', written through
 * billing.set_spend_cap, which checks the owner and audits). Each dispatched
 * slot is checked before its run is created:
 *
 *   1. the schedule's cap: what its runs used this month (captures and
 *      meters, minus refunds, plus open holds) plus the run's p90 estimate;
 *   2. the balance: available credits, or what auto-recharge would cover,
 *      against the p90 (the same gate as a manual start, §6.7);
 *   3. the workspace's monthly and fixed per-run caps (L-15).
 *
 * Where credits are enforced (BILLING_ENFORCE or the workspace's override)
 * a slot that fails a check is skipped with `credits_exhausted` or
 * `cap_reached`, and the owners are alerted. In shadow mode the same verdict
 * is recorded on the dispatch (`admission`) and the run goes ahead. Contract
 * workspaces run on their agreement: nothing is checked. Admission itself
 * (createSelfServiceRun → admitRun) still applies to the run that starts.
 *
 * No React and no "server-only": the evals scheduler imports it.
 */
import type { PoolClient } from "pg";
import { monthWindow, readAccount } from "../../billing/account-view";
import { admissionRequirementUcr, workspaceEngineMode, type EngineBillingMode } from "../../billing/engine";
import { autoRechargeCover, monthCommittedUcr, readSpendCaps } from "../../billing/limits";
import { UCR_PER_CREDIT, wholeCreditsUp } from "../../billing/units";

type Env = Record<string, string | undefined>;
const ZERO = BigInt(0);
const big = (value: unknown) => (value === null || value === undefined ? ZERO : BigInt(String(value)));

export type ScheduleSkipReason = "credits_exhausted" | "cap_reached";
export type CapScope = "schedule" | "monthly" | "run";

/** What the credit check saw for one dispatched slot (stored on schedule_dispatch.admission). µcr as strings. */
export interface ScheduleAdmission {
  mode: Exclude<EngineBillingMode, "off">;
  billingMode: string;
  p90Ucr: string;
  availableUcr: string;
  scheduleCapUcr: string | null;
  scheduleSpentUcr: string;
  autoRechargeCovers: boolean;
  verdict: "admit" | ScheduleSkipReason;
  capScope: CapScope | null;
  checkedAt: string;
}

/** The credit caps of these schedules (µcr), keyed by schedule id. */
export async function scheduleCaps(db: PoolClient, orgId: string, scheduleIds: string[]): Promise<Map<string, bigint>> {
  if (!scheduleIds.length) return new Map();
  const rows = (await db.query("SELECT subject_id,cap_ucr FROM billing.spend_cap WHERE org_id=$1 AND scope='schedule' AND subject_id=ANY($2::uuid[]) AND cap_ucr IS NOT NULL",
    [orgId, scheduleIds])).rows;
  return new Map(rows.map(row => [String(row.subject_id), big(row.cap_ucr)]));
}

/**
 * What one schedule's runs used in the UTC month of `at`: their captures and
 * meters minus the entries that gave them back, plus credits still held for
 * them (the same rule as a run's spend, lib/billing/account-view.ts).
 */
export async function scheduleMonthSpendUcr(db: PoolClient, orgId: string, scheduleId: string, at: Date = new Date()): Promise<bigint> {
  const window = monthWindow(at);
  const row = (await db.query(`WITH runs AS (
      SELECT d.run_id FROM evals.schedule_dispatch d JOIN evals.run r ON (r.org_id,r.id)=(d.org_id,d.run_id)
      WHERE d.org_id=$1 AND d.schedule_id=$2 AND r.created_at >= $3 AND r.created_at < $4
    ), debit AS (
      SELECT e.id, -e.amount_ucr AS gross_ucr FROM billing.ledger_entry e
      WHERE e.org_id=$1 AND e.run_id IN (SELECT run_id FROM runs) AND e.entry_type IN ('capture','action')
    )
    SELECT coalesce((SELECT sum(gross_ucr) FROM debit), 0)
      - coalesce((SELECT sum(x.amount_ucr) FROM billing.ledger_entry x JOIN debit d ON d.id = x.reverses_entry_id WHERE x.org_id=$1), 0)
      + coalesce((SELECT sum(h.amount_ucr) FROM billing.credit_hold h WHERE h.org_id=$1 AND h.run_id IN (SELECT run_id FROM runs) AND h.state='held'), 0) AS spend`,
  [orgId, scheduleId, window.start, window.end])).rows[0];
  return big(row?.spend);
}

/**
 * The credit check for one slot, inside the dispatch transaction. Null where
 * credits are off or the workspace is on a contract (nothing to check).
 * Errors from the estimator propagate where credits are enforced (admission
 * would fail the same way) and admit in shadow mode (shadow never blocks).
 */
export async function scheduleAdmission(db: PoolClient, processMode: EngineBillingMode, orgId: string,
  input: { scheduleId: string; evaluationId: string; suiteVersionId: string; targetRevisionId: string }, env: Env = process.env, now: Date = new Date()): Promise<ScheduleAdmission | null> {
  if (processMode === "off") return null;
  const mode = await workspaceEngineMode(db, processMode, orgId);
  if (mode === "off") return null;
  const account = await readAccount(db, orgId);
  if (!account || account.billingMode === "contract") return null;
  let p90: bigint;
  try {
    p90 = (await admissionRequirementUcr(db, orgId, { evaluationId: input.evaluationId, suiteVersionId: input.suiteVersionId, targetRevisionId: input.targetRevisionId })).p90Ucr;
  } catch (error) {
    if (mode === "enforce") throw error;
    console.warn(JSON.stringify({ event: "schedule_admission_shadow_error", org: orgId, code: error instanceof Error ? error.name : "unknown" }));
    return null;
  }
  const cap = (await scheduleCaps(db, orgId, [input.scheduleId])).get(input.scheduleId) ?? null;
  const spent = await scheduleMonthSpendUcr(db, orgId, input.scheduleId, now);
  const result: ScheduleAdmission = {
    mode, billingMode: account.billingMode, p90Ucr: p90.toString(), availableUcr: account.availableUcr.toString(),
    scheduleCapUcr: cap === null ? null : cap.toString(), scheduleSpentUcr: spent.toString(),
    autoRechargeCovers: false, verdict: "admit", capScope: null, checkedAt: now.toISOString(),
  };
  if (cap !== null && spent + p90 > cap) return { ...result, verdict: "cap_reached", capScope: "schedule" };
  if (account.availableUcr < p90) {
    const cover = await autoRechargeCover(db, orgId, p90 - account.availableUcr, env);
    if (!cover.covers) return { ...result, verdict: "credits_exhausted" };
    result.autoRechargeCovers = true;
  }
  const caps = await readSpendCaps(db, orgId);
  if (caps.monthlyUcr !== null && (await monthCommittedUcr(db, orgId, account.heldUcr, now)) + p90 > caps.monthlyUcr) {
    return { ...result, verdict: "cap_reached", capScope: "monthly" };
  }
  if (caps.perRunUcr !== null && p90 > caps.perRunUcr) return { ...result, verdict: "cap_reached", capScope: "run" };
  return result;
}

/** Whole credits, rounded up (what a person must have). */
export const creditsUp = (ucr: string | bigint | null | undefined) => (ucr === null || ucr === undefined ? null : Number(wholeCreditsUp(BigInt(ucr))));
/** Whole credits, rounded down (a balance is never overstated). */
export const creditsDown = (ucr: string | bigint | null | undefined) => {
  if (ucr === null || ucr === undefined) return null;
  const value = BigInt(ucr);
  return Number((value < ZERO ? ZERO : value) / UCR_PER_CREDIT);
};
