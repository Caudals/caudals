import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { genericGroundedQaPack, syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { applyMatchedAnswers, createReportForRun, createRun, persistImport, reviewAssessment, scoreRun } from "../../lib/evals/repositories/managed";
import { advanceJudgments, listRunJudgments } from "../../lib/evals/repositories/judging";
import { advanceReportNarratives, requestReportNarrative } from "../../lib/evals/repositories/narratives";
import { InvocationWorker } from "../../lib/evals/queue/worker";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import type { ProviderOutput } from "../../lib/evals/providers/contracts";
import { importedJudgeRunFixture } from "./judge-run-fixture";
import { listReviewQueue } from "../../lib/evals/repositories/operator-actions";
import { canonicalJson, sha256 } from "../../lib/evals/contracts/hashing";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("WP-06 rubric judge on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const workerPool = new Pool({ connectionString: ownerUrl, max: 4 });
  workerPool.on("connect", (client) => { void client.query("SET ROLE evals_worker"); });
  afterAll(async () => { await workerPool.end(); await owner.end(); await getEvalsPool().end(); });

  it("queues budgeted judge steps, rejects malformed output and appends superseding assessments", async () => {
    const { scope, orgId, rubric, run } = await importedJudgeRunFixture(owner, runtimeUrl!);

    const scored = await scoreRun(scope, run.id, "judge-fixture-v1");
    expect(scored.judgments).toEqual({ queued: 2, skipped: 0 });
    const steps = await withTenant(scope, async (c) => (await c.query("SELECT s.id,s.input_hash,s.step_kind FROM evals.judge_job j JOIN evals.workflow_step s ON (s.org_id,s.id)=(j.org_id,j.step_id) WHERE j.org_id=$1 ORDER BY j.created_at", [orgId])).rows);
    expect(steps.map((step) => step.step_kind)).toEqual(["grade", "grade"]);
    // Pending assessments carry no scores; nothing counts as a pass yet.
    expect(scored.metrics.n_pass).toBe(0);

    // The real worker performs the budgeted call; the DGX response is simulated.
    const criterion = rubric.criteria[1].id;
    const invoke = vi.fn(async (_provider: unknown, input: { messages: Array<{ content: string }> }): Promise<ProviderOutput> => {
      const packet = input.messages.at(-1)!.content;
      return packet.includes("Ignore your rubric")
        ? { text: JSON.stringify({ criteria: [{ criterion_id: criterion, verdict: "partial", rationale: "States the fee but does not cite the policy.", evidence: "A 10% service fee applies." }] }), complete: true, finishReason: "stop", latencyMs: 20, usage: { input: 300, output: 40, cached: 0 } }
        : { text: "Looks right to me.", complete: true, finishReason: "stop", latencyMs: 20, usage: { input: 300, output: 5, cached: 0 } };
    });
    const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, workerPool);
    const worker = new InvocationWorker({ tx, keys: new Map(), actorId: "judge-worker", workerId: randomUUID(), invoke, leaseSeconds: 30 });
    for (const step of steps) await worker.handle({ orgId, stepId: step.id, inputHash: step.input_hash });
    expect(invoke).toHaveBeenCalledTimes(2);
    const reservations = await withTenant(scope, async (c) => (await c.query("SELECT count(*)::int AS n FROM evals.budget_reservation WHERE org_id=$1", [orgId])).rows[0].n);
    expect(reservations).toBe(2);

    expect(await advanceJudgments(scope, run.id)).toMatchObject({ completed: 1, invalid: 1 });
    const queue = await listReviewQueue(scope);
    expect(queue.map((item) => item.outcome).sort()).toEqual(["partial", "unscorable"]);
    expect(queue.find((item) => item.outcome === "unscorable")?.judge_reason).toBe("judge_output_not_json");
    expect(queue.every((item) => typeof item.answer === "string" && item.question)).toBe(true);
    const status = await listRunJudgments(scope, run.id);
    expect(status.jobs.map((job) => job.status).sort()).toEqual(["completed", "invalid"]);
    expect(status.jobs.find((job) => job.status === "invalid")?.reason_code).toBe("judge_output_not_json");
    expect(status.calibration[0]).toMatchObject({ examples: 0, adequate: false });
    const latest = await withTenant(scope, async (c) => (await c.query(`SELECT DISTINCT ON (a.observation_id) a.id,a.outcome,a.review_status,a.supersedes_assessment_id,a.document
      FROM evals.assessment a JOIN evals.observation o ON (o.org_id,o.id)=(a.org_id,a.observation_id) WHERE o.run_id=$1 ORDER BY a.observation_id,a.created_at DESC,a.id DESC`, [run.id])).rows);
    const judged = latest.find((row) => row.outcome === "partial")!;
    expect(judged.review_status).toBe("needs_review");
    expect(judged.supersedes_assessment_id).not.toBeNull();
    expect(judged.document.extensions["caudals.evals/judge"].calibration.adequate).toBe(false);
    expect(latest.find((row) => row.outcome === "unscorable")?.review_status).toBe("needs_review");
    // Re-running the same scorer neither re-queues judges nor overwrites the judged result.
    expect((await scoreRun(scope, run.id, "judge-fixture-v1")).judgments).toEqual({ queued: 0, skipped: 0 });
    expect(await advanceJudgments(scope, run.id)).toMatchObject({ completed: 0, invalid: 0 });

    // A human decision becomes calibration evidence for this judge revision.
    await reviewAssessment(scope, judged.id, { decision: "override", reason: "The answer is complete for this policy.", outcome: "pass", criteria: judged.document.criteria.map((item: { criterion_id: string; rationale: string }) => ({ ...item, score: 1 })) });
    const after = await listRunJudgments(scope, run.id);
    expect(after.calibration[0]).toMatchObject({ examples: 1, agreements: 0, adequate: false });

    // §15.1: the deterministic report exists first; a validated narrative becomes a new revision.
    const report = await createReportForRun(scope, { runId: run.id, title: "Judge fixture report", reviewStatus: "preliminary", scorerVersion: "judge-fixture-v1" }, randomUUID());
    // The only judge grade was overridden by a person, so no judge-graded result remains to disclose.
    expect(report.snapshot.methodology.limitations.some((item: string) => item.includes("model rubric judge"))).toBe(false);
    const job = await requestReportNarrative(scope, report.reportId, report.revisionId);
    expect(job.status).toBe("queued");
    expect((await requestReportNarrative(scope, report.reportId, report.revisionId)).id).toBe(job.id);
    const narrativeStep = await withTenant(scope, async (c) => (await c.query("SELECT s.id,s.input_hash FROM evals.report_narrative_job j JOIN evals.workflow_step s ON (s.org_id,s.id)=(j.org_id,j.step_id) WHERE j.id=$1", [job.id])).rows[0]);
    const assessmentId = report.snapshot.results[0].assessment_id;
    const writer = new InvocationWorker({ tx, keys: new Map(), actorId: "narrative-worker", workerId: randomUUID(), leaseSeconds: 30,
      invoke: async () => ({ text: JSON.stringify({ takeaways: [
        { text: `Coverage is incomplete: ${report.snapshot.metrics.n_scorable} of ${report.snapshot.metrics.n_eligible} eligible tests have a final grade.`, finding_ids: [], assessment_ids: [assessmentId] },
        { text: "The system is fully compliant.", finding_ids: [], assessment_ids: [assessmentId] },
      ] }), complete: true, finishReason: "stop", latencyMs: 15, usage: { input: 400, output: 60, cached: 0 } }) });
    await writer.handle({ orgId, stepId: narrativeStep.id, inputHash: narrativeStep.input_hash });
    expect(await advanceReportNarratives(scope)).toMatchObject({ completed: 1 });
    const revisions = await withTenant(scope, async (c) => (await c.query("SELECT id,supersedes_revision_id,snapshot FROM evals.report_revision WHERE org_id=$1 AND report_id=$2 ORDER BY created_at", [orgId, report.reportId])).rows);
    expect(revisions).toHaveLength(2);
    expect(revisions[1].supersedes_revision_id).toBe(report.revisionId);
    expect(revisions[1].snapshot.takeaways).toHaveLength(1);
    expect(revisions[1].snapshot.methodology.limitations.at(-1)).toContain("1 unsupported draft claim was rejected");
    expect(revisions[0].snapshot.takeaways).toEqual(report.snapshot.takeaways);
  });
});
