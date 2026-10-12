/**
 * Platform billing jobs run by the evaluation scheduler (services/evals-worker/scheduler.ts)
 * under its service identity: the nightly ledger verifier and credit expiry.
 */
import { withTenant } from "../evals/repositories/db";
import { expireDue, recordVerification, type VerificationRun } from "./ledger";

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
