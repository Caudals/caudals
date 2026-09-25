import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { finalizeRuns } from "../../lib/evals/repositories/finalize";
import { advanceJudgments } from "../../lib/evals/repositories/judging";
import { InvocationWorker } from "../../lib/evals/queue/worker";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import { importedJudgeRunFixture } from "./judge-run-fixture";
import { listEvaluationRuns, listReportShares } from "../../lib/evals/repositories/operator-actions";
import { createReportShare } from "../../lib/evals/repositories/managed";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("automatic run finalization on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const workerPool = new Pool({ connectionString: ownerUrl, max: 4 });
  workerPool.on("connect", (client) => { void client.query("SET ROLE evals_worker"); });
  afterAll(async () => { await workerPool.end(); await owner.end(); await getEvalsPool().end(); });

  it("grades, waits for judges, then publishes one preliminary report and notifies once", async () => {
    const { scope, orgId, rubric, run } = await importedJudgeRunFixture(owner, runtimeUrl!);
    const modes = ["imported_responses"];
    const phase = async () => withTenant(scope, async (c) => (await c.query("SELECT status,phase FROM evals.run WHERE org_id=$1 AND id=$2", [orgId, run.id])).rows[0]);
    expect(await phase()).toMatchObject({ status: "completed", phase: "grading" });

    expect(await finalizeRuns(scope, 5, modes)).toMatchObject({ scored: 1 });
    expect(await finalizeRuns(scope, 5, modes)).toMatchObject({ waiting: 1, reported: 0 });
    // Waiting on judge grades is not "partial" work.
    expect(await phase()).toMatchObject({ status: "completed", phase: "reporting" });

    const steps = await withTenant(scope, async (c) => (await c.query("SELECT s.id,s.input_hash FROM evals.judge_job j JOIN evals.workflow_step s ON (s.org_id,s.id)=(j.org_id,j.step_id) WHERE j.org_id=$1", [orgId])).rows);
    const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, workerPool);
    const worker = new InvocationWorker({ tx, keys: new Map(), actorId: "judge-worker", workerId: randomUUID(), leaseSeconds: 30,
      invoke: async () => ({ text: JSON.stringify({ criteria: [{ criterion_id: rubric.criteria[1].id, verdict: "pass", rationale: "Grounded in the policy.", evidence: "" }] }), complete: true, finishReason: "stop", latencyMs: 10 }) });
    for (const step of steps) await worker.handle({ orgId, stepId: step.id, inputHash: step.input_hash });
    expect(await advanceJudgments(scope, run.id)).toMatchObject({ completed: 2 });

    expect(await finalizeRuns(scope, 5, modes)).toMatchObject({ reported: 1 });
    expect(await phase()).toMatchObject({ status: "completed", phase: "done" });
    const state = await withTenant(scope, async (c) => ({
      reports: (await c.query("SELECT r.publication_status,rr.review_status,rr.snapshot->'metrics'->>'n_scorable' AS scorable FROM evals.report r JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(r.org_id,r.current_revision_id) WHERE r.org_id=$1", [orgId])).rows,
      notifications: (await c.query("SELECT kind FROM evals.notification WHERE org_id=$1", [orgId])).rows,
    }));
    expect(state.reports).toEqual([{ publication_status: "published", review_status: "preliminary", scorable: "2" }]);
    expect(state.notifications).toEqual([{ kind: "report_published" }]);
    expect(await finalizeRuns(scope, 5, modes)).toEqual({ scored: 0, reported: 0, failed: 0, waiting: 0 });

    const reportRow = await withTenant(scope, async (c) => (await c.query("SELECT id,current_revision_id FROM evals.report WHERE org_id=$1", [orgId])).rows[0]);
    const share = await createReportShare(scope, reportRow.id, { reportRevisionId: reportRow.current_revision_id, audience: "bearer", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), permittedFields: ["system", "metrics"] }, randomUUID());
    expect(share.token).toBeTruthy();
    const shares = await listReportShares(scope, reportRow.id);
    expect(shares).toEqual([expect.objectContaining({ audience: "bearer", access_count: 0, revoked_at: null })]);
    expect(JSON.stringify(shares)).not.toContain(String(share.token));
    expect(await listEvaluationRuns(scope, { relatedRunId: run.id })).toEqual([expect.objectContaining({ id: run.id, report_id: reportRow.id })]);
    await expect(listReportShares({ orgId: randomUUID(), actorId: scope.actorId }, reportRow.id)).rejects.toMatchObject({ status: 404 });
  });
});
