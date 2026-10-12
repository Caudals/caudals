/**
 * Kill-the-worker tests for credit holds (spec v2 §6.8, P-49; L-11): a real
 * worker process in enforce mode is killed with SIGKILL before dispatch,
 * after the provider accepted the call, and inside the transaction that
 * captures. Recovery and a fresh worker finish the work: every hold ends
 * captured, released or expired exactly once and the call is charged once.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { InvocationWorker } from "../../lib/evals/queue/worker";
import { enqueueInvocation, type TenantTransaction } from "../../lib/evals/queue/store";
import type { Invocation } from "../../lib/evals/providers/contracts";
import { expireDue, grantCredits, verifyAccounts } from "../../lib/billing/ledger";
import { creditsToUcr } from "../../lib/billing/units";
import { encryptSecret } from "../../lib/evals/security/envelope";
import { importedJudgeRunFixture } from "./judge-run-fixture";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const SYSTEM = "service:evals-scheduler";
const B = (value: number | string | bigint) => BigInt(value);
const key = randomBytes(32), keys = new Map([["v1", key]]);

describe.skipIf(!ownerUrl || !runtimeUrl)("credit holds survive SIGKILL at every boundary (L-11)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const rolePool = (role: string, max: number) => {
    const pool = new Pool({ connectionString: ownerUrl, max });
    pool.on("connect", client => { void client.query(`SET ROLE ${role}`); });
    return pool;
  };
  const workerPool = rolePool("evals_worker", 6), schedulerPool = rolePool("evals_scheduler", 2);
  const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, workerPool);
  afterAll(async () => { await Promise.all([owner.end(), workerPool.end(), schedulerPool.end(), getEvalsPool().end()]); });

  async function engineStep() {
    const f = await importedJudgeRunFixture(owner, runtimeUrl!);
    await owner.query("UPDATE evals.workspace_entitlement SET plan='free' WHERE org_id=$1", [f.orgId]);
    await withTenant({ orgId: f.orgId, actorId: SYSTEM }, db => grantCredits(db, { orgId: f.orgId, key: `grant-${randomUUID()}`, amountUcr: creditsToUcr(10), source: "grant" }), schedulerPool);
    const workspaceBudget = (await owner.query("SELECT id FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace'", [f.orgId])).rows[0].id;
    const runBudget = (await owner.query("INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,'run',$2,'EUR',10) RETURNING id", [f.orgId, f.run.id])).rows[0].id;
    // A commercial model (GPT-6 Luna through OpenRouter: 15 · 70 credits per 1M) with its own
    // slots; the DGX's single residency slot is shared with other test files.
    const providerId = randomUUID(), priceId = randomUUID(), accountId = randomUUID(), recordId = randomUUID(), versionId = randomUUID();
    await owner.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'crash fixture','EUR',100,true)", [accountId]);
    await owner.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
      VALUES($1,$2,'openai_compatible','https://openrouter.ai/api/v1','openai/gpt-6-luna','fixture',ARRAY['judge'],'{"text":true,"boundedTokens":true}',16384,1024,ARRAY['synthetic'],ARRAY['private'],10000,100000000,16)`, [providerId, accountId]);
    await owner.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0.0000001,0.0000004,0.0000001,0,0,'fixture')", [priceId, providerId]);
    await owner.query("INSERT INTO evals.secret_record(id,org_id,purpose,scope_id,created_by) VALUES($1,$2,'provider',$3,'fixture')", [recordId, f.orgId, providerId]);
    await owner.query("INSERT INTO evals.secret_version(id,org_id,record_id,envelope,created_by) VALUES($1,$2,$3,$4,'fixture')",
      [versionId, f.orgId, recordId, encryptSecret(Buffer.from("fixture-provider-key"), { orgId: f.orgId, recordId, versionId, purpose: "provider", scopeId: providerId }, "v1", keys)]);
    const input: Invocation = { probe: false, probeKind: "text", outputFormat: "text", providerRevisionId: providerId, priceRevisionId: priceId, secretVersionId: versionId,
      workspaceBudgetId: workspaceBudget, runBudgetId: runBudget, role: "judge", dataClass: "synthetic", region: "private", routing: "approved_providers",
      approvedProviderIds: [providerId], messages: [{ role: "user", content: "Grade this answer." }], maxOutputTokens: 256, timeoutMs: 60000, internalCostPerSecond: "0" };
    const tenant = { orgId: f.orgId, actorId: f.actorId };
    const stepId = await withTenant(tenant, db => enqueueInvocation(db, tenant, { workflowId: randomUUID(), runId: f.run.id, planHash: "c".repeat(64), kind: "grade", version: 1, input }));
    const step = (await owner.query("SELECT id,input_hash FROM evals.workflow_step WHERE id=$1", [stepId])).rows[0];
    return { ...f, job: { orgId: f.orgId, stepId: step.id, inputHash: step.input_hash } };
  }

  for (const mode of ["before", "after", "capture"] as const) it(`never double-charges when the worker is killed ${mode === "capture" ? "during capture" : `${mode} dispatch`}`, async () => {
    const f = await engineStep();
    let child: ReturnType<typeof fork> | undefined;
    try {
      child = fork("tests/evals/fixtures/billing-crash-child.ts", [], {
        execArgv: ["--conditions=react-server", "--import", "tsx"],
        env: { ...process.env, BILLING_CRASH_DATABASE_URL: ownerUrl, BILLING_CRASH_JOB: JSON.stringify(f.job), BILLING_CRASH_MODE: mode, BILLING_CRASH_KEY: key.toString("hex") },
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      const signal = await Promise.race([
        once(child, "message").then(([message]) => message),
        once(child, "exit").then(() => { throw new Error("Child exited before its boundary"); }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Child boundary timeout")), 20_000)),
      ]);
      expect(signal).toBe(mode === "before" ? "reserved" : mode === "after" ? "accepted" : "captured");
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
      child = undefined;
      // PostgreSQL rolls back the killed process's open transaction once its connection is gone.
      for (let wait = 0; wait < 50; wait++) {
        const open = (await owner.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE state LIKE 'idle in transaction%' AND usename=current_user AND backend_type='client backend' AND query LIKE '%billing.ledger_entry%'")).rows[0].n;
        if (!open) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const held = (await owner.query("SELECT state,amount_ucr FROM billing.credit_hold WHERE org_id=$1", [f.orgId])).rows;
      expect(held).toHaveLength(1);
      expect(held[0].state).toBe("held");
      expect((await owner.query("SELECT count(*)::int AS n FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='capture'", [f.orgId])).rows[0].n).toBe(0);

      // The lease expires; recovery and a fresh worker finish the step.
      await owner.query("UPDATE evals.workflow_step SET lease_until=now()-interval '1 second' WHERE id=$1", [f.job.stepId]);
      let calls = 0;
      const worker = new InvocationWorker({ tx, keys, actorId: "service:evals-worker", workerId: randomUUID(), leaseSeconds: 5, billing: () => "enforce",
        invoke: async () => { calls++; return { text: "Looks right.", complete: true, finishReason: "stop", latencyMs: 5, usage: { input: 300, output: 40, cached: 0 } }; } });
      await worker.recover({ orgId: f.orgId, actorId: "service:evals-worker" });
      const afterRecovery = (await owner.query("SELECT state FROM billing.credit_hold WHERE org_id=$1", [f.orgId])).rows.map(row => row.state);
      // Never dispatched: released in full. Dispatched (unknown outcome): held until it expires.
      expect(afterRecovery).toEqual([mode === "before" ? "released" : "held"]);
      await owner.query("UPDATE evals.workflow_step SET not_before=now() WHERE id=$1", [f.job.stepId]);
      await worker.handle(f.job);
      expect(calls).toBe(1);
      expect((await owner.query("SELECT status FROM evals.workflow_step WHERE id=$1", [f.job.stepId])).rows[0].status).toBe("completed");
      // A retried capture is a no-op.
      await worker.handle(f.job);
      expect(calls).toBe(1);
      // 24 hours later the unknown call's hold expires: the customer never pays for it.
      await owner.query("UPDATE billing.credit_hold SET expires_at=now()-interval '1 second' WHERE org_id=$1 AND state='held'", [f.orgId]);
      await withTenant({ orgId: f.orgId, actorId: SYSTEM }, db => expireDue(db, { orgId: f.orgId }), schedulerPool);

      const holds = (await owner.query("SELECT id,state,amount_ucr,captured_ucr,released_ucr FROM billing.credit_hold WHERE org_id=$1 ORDER BY created_at", [f.orgId])).rows;
      expect(holds.map(hold => hold.state)).toEqual([mode === "before" ? "released" : "expired", "captured"]);
      for (const hold of holds) {
        expect(B(hold.captured_ucr) + B(hold.released_ucr)).toBe(B(hold.amount_ucr));
        const counts = Object.fromEntries((await owner.query("SELECT entry_type,count(*)::int AS n FROM billing.ledger_entry WHERE org_id=$1 AND hold_id=$2 GROUP BY entry_type", [f.orgId, hold.id])).rows.map(row => [row.entry_type, row.n]));
        expect(counts.hold).toBe(1);
        expect(counts.capture ?? 0).toBe(hold.state === "captured" ? 1 : 0);
        expect(counts.release ?? 0).toBeLessThanOrEqual(1);
      }
      const captures = (await owner.query("SELECT amount_ucr FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='capture'", [f.orgId])).rows;
      // 300 + 40 tokens at the rate of the revision the run froze (15 · 70 credits per 1M in revision 1).
      const rate = (await owner.query(`SELECT m.input_ucr_per_m,m.output_ucr_per_m FROM evals.run r
        CROSS JOIN LATERAL billing.rate_for(r.price_book_revision_id,'openrouter','openai/gpt-6-luna',300) m WHERE r.id=$1`, [f.run.id])).rows[0];
      const expected = (B(300) * B(rate.input_ucr_per_m) + B(40) * B(rate.output_ucr_per_m) + B(999_999)) / B(1_000_000);
      expect(captures.map(row => B(row.amount_ucr))).toEqual([-expected]);
      const account = (await owner.query("SELECT available_ucr,held_ucr FROM billing.credit_account WHERE org_id=$1", [f.orgId])).rows[0];
      expect({ available: B(account.available_ucr), held: B(account.held_ucr) }).toEqual({ available: creditsToUcr(10) - expected, held: B(0) });
      expect((await withTenant({ orgId: f.orgId, actorId: SYSTEM }, db => verifyAccounts(db, f.orgId), schedulerPool))[0].issues).toEqual([]);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill("SIGKILL"); await exited; }
    }
  }, 60_000);
});
