/**
 * Platform billing jobs run by the evaluation scheduler (services/evals-worker/scheduler.ts)
 * under its service identity: the nightly ledger verifier, credit expiry,
 * price-book activation, the weekly provider-price check and the monthly
 * ECB FX update.
 */
import { withTenant } from "../evals/repositories/db";
import { expireDue, recordVerification, type VerificationRun } from "./ledger";
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
