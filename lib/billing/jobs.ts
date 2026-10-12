/**
 * Platform billing jobs run by the evaluation scheduler (services/evals-worker/scheduler.ts)
 * under its service identity: the nightly ledger verifier, credit expiry,
 * price-book activation, the weekly provider-price check and the monthly
 * ECB FX update.
 */
import { withTenant } from "../evals/repositories/db";
import { pendingShadowAdmissions, recordShadowAdmission, type EngineBillingMode } from "./engine";
import { expireDue, recordVerification, refundRun, type VerificationRun } from "./ledger";
import { activateDuePriceBooks, type PriceBookRevision } from "./price-book";
import {
  comparePriceBook, fetchEcbUsdRate, fetchOpenRouterListings, fxUpdateDue, loadPriceCheckState, priceCheckDue, recordFxRate, recordPriceCheck, type PriceCheckReport,
} from "./price-check";

const HOUR = 3_600_000;
/** The verifier runs once when the scheduler starts and once in the 03:00 UTC hour. */
export const BILLING_VERIFY_UTC_HOUR = 3;

export function billingVerificationDue(lastRunAt: number, now = new Date()): boolean {
  return lastRunAt === 0 || (now.getUTCHours() === BILLING_VERIFY_UTC_HOUR && now.getTime() - lastRunAt > HOUR);
}

/** Expiry runs hourly while the credit layer is on, so credits lapse within an hour of their date. */
export function billingExpiryDue(lastRunAt: number, now = new Date()): boolean {
  return now.getTime() - lastRunAt >= HOUR;
}

/** Checks every account's invariants (spec §6.9) and records the result in billing.verification_run. */
export function runBillingVerification(actorId: string): Promise<VerificationRun> {
  return withTenant({ orgId: "", actorId }, db => recordVerification(db));
}

/** Releases holds past their expiry and expires due lots, in batches of `batch` accounts per transaction. */
export async function runBillingExpiry(actorId: string, batch = 50, maxBatches = 20): Promise<{ accounts: number; holds: number; lots: number; expiredUcr: bigint }> {
  const total = { accounts: 0, holds: 0, lots: 0, expiredUcr: BigInt(0) };
  for (let round = 0; round < maxBatches; round++) {
    const rows = await withTenant({ orgId: "", actorId }, db => expireDue(db, { limit: batch }));
    for (const row of rows) { total.accounts++; total.holds += row.holdsExpired; total.lots += row.lotsExpired; total.expiredUcr += row.expiredUcr; }
    if (rows.length < batch) break;
  }
  return total;
}

/** Price-book upkeep runs hourly: status labels follow effective dates (prices already apply by date). */
export function priceBookUpkeepDue(lastRunAt: number, now = new Date()): boolean {
  return now.getTime() - lastRunAt >= HOUR;
}

export function runPriceBookActivation(actorId: string): Promise<PriceBookRevision[]> {
  return withTenant({ orgId: "", actorId }, db => activateDuePriceBooks(db));
}

/** Records this month's ECB rate when it is due (first working day, after 15:00 UTC). Returns it, or null when not due. */
export async function runFxUpdate(actorId: string, now = new Date(), fetchImpl?: typeof fetch): Promise<{ date: string; usdPerEur: string } | null> {
  const latest = await withTenant({ orgId: "", actorId }, async db =>
    (await db.query("SELECT to_char(max(rate_date),'YYYY-MM-DD') AS d FROM billing.fx_rate WHERE currency='USD'")).rows[0]?.d as string | null);
  if (!fxUpdateDue(latest, now)) return null;
  const rate = await fetchEcbUsdRate(fetchImpl);
  // A rate from before this month (a holiday on the first working day) waits for the next attempt.
  if (latest && rate.date <= latest) return null;
  await withTenant({ orgId: "", actorId }, db => recordFxRate(db, rate));
  return rate;
}

/** The weekly provider-price check: compares, records and returns the report, or null when not due. No transaction is held across the fetch. */
export async function runPriceCheck(actorId: string, now = new Date(), fetchImpl?: typeof fetch): Promise<PriceCheckReport | null> {
  const state = await withTenant({ orgId: "", actorId }, db => loadPriceCheckState(db));
  if (!priceCheckDue(state.lastCheck, now)) return null;
  if (!state.book) throw new Error("price_book_missing");
  const report = comparePriceBook(state.book, await fetchOpenRouterListings(fetchImpl), state.fx);
  await withTenant({ orgId: "", actorId }, db => recordPriceCheck(db, report));
  return report;
}

/* ------------------------------------------- engine hooks (L-11, §6.8) --- */

/**
 * The hourly reconciler while the credit layer is on: shadow holds unsettled
 * after 24 h are released (real holds expire through runBillingExpiry), and
 * failed runs (no usable result) get every charge back, once, with the key
 * run-refund:<run_id>. Each workspace refund runs in its own transaction.
 */
export async function runBillingReconciler(actorId: string, mode: EngineBillingMode): Promise<{ shadowExpired: number; refunds: number; shadowRefunds: number; failed: number }> {
  const result = { shadowExpired: 0, refunds: 0, shadowRefunds: 0, failed: 0 };
  if (mode === "off") return result;
  if (mode === "shadow") {
    result.shadowExpired = await withTenant({ orgId: "", actorId }, async db =>
      Number((await db.query("SELECT billing.shadow_expire_holds(500) AS n")).rows[0].n));
  }
  const candidates = await withTenant({ orgId: "", actorId }, async db =>
    (await db.query("SELECT org_id,run_id,ledger,shadow FROM billing.run_refund_candidates(100)")).rows as Array<{ org_id: string; run_id: string; ledger: boolean; shadow: boolean }>);
  for (const row of candidates) {
    try {
      await withTenant({ orgId: row.org_id, actorId }, async db => {
        if (row.ledger) { await refundRun(db, { orgId: row.org_id, runId: row.run_id, reason: "run_failed_no_usable_result" }); result.refunds++; }
        if (row.shadow && (await db.query("SELECT billing.shadow_refund_run($1,$2,'run_failed_no_usable_result') AS ok", [row.org_id, row.run_id])).rows[0].ok) result.shadowRefunds++;
      });
    } catch {
      result.failed++;
    }
  }
  return result;
}

/** Shadow admissions (§6.8 step 1) for runs started in the last minutes, off the request path. */
export async function runShadowAdmissions(scope: { orgId: string; actorId: string }): Promise<number> {
  const runs = await withTenant(scope, db => pendingShadowAdmissions(db, scope.orgId));
  let recorded = 0;
  for (const run of runs) if (await withTenant(scope, db => recordShadowAdmission(db, scope.orgId, run))) recorded++;
  return recorded;
}

/** The daily shadow diff report runs at scheduler start and in the 04:00 UTC hour, for the previous UTC day. */
export const SHADOW_REPORT_UTC_HOUR = 4;
export function shadowReportDue(lastRunAt: number, now = new Date()): boolean {
  return lastRunAt === 0 || (now.getUTCHours() === SHADOW_REPORT_UTC_HOUR && now.getTime() - lastRunAt > HOUR);
}
export function previousUtcDay(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
}
export interface ShadowReport { id: string; day: string; mismatches: number; report: Record<string, unknown> }
/** Computes and keeps the shadow diff for one UTC day (billing.shadow_report). */
export function runShadowReport(actorId: string, day: string): Promise<ShadowReport> {
  return withTenant({ orgId: "", actorId }, async db => {
    const row = (await db.query("SELECT id,to_char(day,'YYYY-MM-DD') AS day,mismatches,report FROM billing.record_shadow_report($1::date)", [day])).rows[0];
    return { id: row.id, day: row.day, mismatches: row.mismatches, report: row.report };
  });
}
/** The shadow diff for one UTC day (one workspace, or all), computed without keeping it (scripts/billing/shadow-report.ts). */
export function shadowDiff(actorId: string, day: string, orgId: string | null = null): Promise<Record<string, unknown>> {
  return withTenant({ orgId: "", actorId }, async db => (await db.query("SELECT billing.shadow_diff($1::date,$2::uuid) AS d", [day, orgId])).rows[0].d);
}
