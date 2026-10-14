/**
 * The inference worker's side of workspace keys (BYOK, launch L-27). Only
 * the worker role reads provider_connection, and row-level security limits
 * it to the current workspace's own keys (and Caudals' platform keys).
 */
import type { PoolClient } from "pg";
import { CustomerKeyFailure } from "../providers/contracts";
import type { ByokKeyState } from "./shared";

/** Before a reservation: a removed or rejected workspace key stops the call here. */
export async function assertCustomerKeyUsable(c: PoolClient, accountId: string): Promise<void> {
  const row = (await c.query("SELECT check_state,revoked_at,(envelope IS NOT NULL) AS keyed FROM evals.provider_connection WHERE account_id=$1", [accountId])).rows[0];
  if (!row || row.revoked_at || !row.keyed) throw new CustomerKeyFailure("customer_key_revoked");
  if (row.check_state === "invalid") throw new CustomerKeyFailure("customer_key_invalid");
}

/**
 * Records what a real call learned about the key (working, out of quota,
 * rejected) for the owner's settings screen. In its own savepoint: a failed
 * status write never loses the call's result.
 */
export async function reportCustomerKey(c: PoolClient, accountId: string, state: ByokKeyState): Promise<void> {
  try {
    await c.query("SAVEPOINT byok_report");
  } catch {
    return;
  }
  try {
    await c.query("SELECT evals.byok_report($1,$2)", [accountId, state]);
    await c.query("RELEASE SAVEPOINT byok_report");
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    console.warn(JSON.stringify({ event: "byok_report_failed", code: typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : "unknown" }));
    try {
      await c.query("ROLLBACK TO SAVEPOINT byok_report");
      await c.query("RELEASE SAVEPOINT byok_report");
    } catch {
      /* the caller's transaction reports it */
    }
  }
}
