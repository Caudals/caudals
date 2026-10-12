/**
 * A real worker process for the L-11 crash tests: it runs one engine call in
 * enforce mode against the disposable production schema and stops at a
 * boundary, where the parent kills it with SIGKILL.
 *
 *   before   the claim (hold) committed, nothing dispatched
 *   after    the provider accepted the call, no answer recorded
 *   capture  the success transaction captured but has not committed
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { InvocationWorker } from "../../../lib/evals/queue/worker";
import { withTenant } from "../../../lib/evals/repositories/db";
import type { TenantTransaction } from "../../../lib/evals/queue/store";

const pool = new Pool({ connectionString: process.env.BILLING_CRASH_DATABASE_URL, max: 3 });
pool.on("connect", client => { void client.query("SET ROLE evals_worker"); });
const mode = process.env.BILLING_CRASH_MODE;
const waitForever = () => new Promise<never>(() => { setInterval(() => {}, 1000); });
const tx: TenantTransaction = async (tenant, fn) => {
  const result = await withTenant(tenant, async client => {
    const value = await fn(client);
    if (mode === "capture") {
      const captured = (await client.query("SELECT count(*)::int AS n FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='capture'", [tenant.orgId])).rows[0].n;
      if (captured > 0) { process.send?.("captured"); await waitForever(); }
    }
    return value;
  }, pool).catch(error => {
    // A busy provider slot is retried below, not a failure.
    if (!(error instanceof Error && ["provider_capacity_unavailable", "provider_circuit_open"].includes(error.message))) process.send?.({ db_error: error instanceof Error ? error.message : "error" });
    throw error;
  });
  if (mode === "before" && result && typeof result === "object" && "attemptId" in result) { process.send?.("reserved"); await waitForever(); }
  return result;
};
const keys = new Map([["v1", Buffer.from(process.env.BILLING_CRASH_KEY!, "hex")]]);
const worker = new InvocationWorker({
  tx, keys, actorId: "service:evals-worker", workerId: randomUUID(), leaseSeconds: 5, billing: () => "enforce",
  invoke: async () => {
    if (mode === "after") { process.send?.("accepted"); return waitForever(); }
    return { text: "Looks right.", complete: true, finishReason: "stop", latencyMs: 5, usage: { input: 300, output: 40, cached: 0 } };
  },
});
const job = JSON.parse(process.env.BILLING_CRASH_JOB!);
(async () => {
  // handle() returns without a boundary only when a provider slot was busy (the step stays queued): try again.
  for (let attempt = 0; attempt < 200; attempt++) {
    await worker.handle(job);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  process.send?.({ failed: "provider_slot_never_free" });
})().catch(error => { process.send?.({ failed: error instanceof Error ? error.message : "failed" }); process.exit(1); });
