import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { caseSchema, rubricSchema, type CefCase, type Rubric } from "../contracts/cases";
import { assessmentSchema, observationSchema, type Assessment, type Observation } from "../contracts/results";
import { boundedOutputTokens, invocationSchema } from "../providers/contracts";
import { digest, enqueueInvocation, type Tenant } from "../queue/store";
import {
  JUDGE_EXTENSION, JUDGE_PROMPT_REVISION, calibrationSummary, candidateAnswer, combineJudgeAssessment,
  judgeCriterionIds, judgeSystemPrompt, judgeUserMessage, parseJudgeOutput, type CalibrationSummary, type SourceExcerpt,
} from "../scoring/judge";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";

// Rubric judge orchestration (spec §11.3, WP-06). A judge call is an ordinary
// budgeted invocation on the `grade` queue; this module creates the pass, then
// turns validated results into new superseding assessments. Nothing here calls
// the target again, and nothing is deleted or rewritten.

export type JudgeCandidate = { assessment: Assessment; observationId: string; observation: Observation; item: CefCase; rubric: Rubric };

type JudgeRoute = {
  provider_revision_id: string; price_revision_id: string; data_class: string; region: string;
  internal_cost_per_second: string; output_limit: number; context_limit: number; adapter: string; currency: string;
};

async function judgeRoute(db: PoolClient, orgId: string): Promise<JudgeRoute | null> {
  return (await db.query(`SELECT r.provider_revision_id,r.price_revision_id,r.data_class,r.region,r.internal_cost_per_second,
      p.adapter,p.output_limit,p.context_limit,pr.currency
    FROM evals.generation_provider_route r JOIN evals.provider_revision p ON p.id=r.provider_revision_id
    JOIN evals.price_revision pr ON (pr.id,pr.provider_revision_id)=(r.price_revision_id,r.provider_revision_id)
    WHERE r.org_id=$1 AND r.role='judge'`, [orgId])).rows[0] ?? null;
}

/** Exact excerpts for the anchors a case cites, from its frozen source revisions. */
async function sourceExcerpts(db: PoolClient, orgId: string, item: CefCase): Promise<SourceExcerpt[]> {
  const refs = item.reference.source_refs.slice(0, 5);
  if (!refs.length) return [];
  const rows = (await db.query("SELECT id,document FROM evals.source_revision WHERE org_id=$1 AND id=ANY($2::uuid[])", [orgId, refs.map((ref) => ref.source_revision_id)])).rows;
  return refs.flatMap((ref) => {
    const anchors = (rows.find((row) => row.id === ref.source_revision_id)?.document?.anchors ?? []) as Array<{ id: string; excerpt: string }>;
    const anchor = anchors.find((candidate) => candidate.id === ref.anchor);
    return anchor ? [{ source_revision_id: ref.source_revision_id, anchor: ref.anchor, excerpt: anchor.excerpt }] : [];
  });
}

/** Called inside the scoring transaction for each new assessment waiting on a judge. */
export async function queueRunJudgments(db: PoolClient, scope: EvidenceScope, runId: string, candidates: JudgeCandidate[]) {
  const pending = candidates.filter((candidate) => candidate.observation.status === "succeeded" && judgeCriterionIds(candidate.item, candidate.rubric).length > 0);
  if (!pending.length) return { queued: 0, skipped: 0 };
  const route = await judgeRoute(db, scope.orgId);
  const evaluation = (await db.query(`SELECT e.commercial_cap,e.currency FROM evals.run r JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
    WHERE r.org_id=$1 AND r.id=$2`, [scope.orgId, runId])).rows[0];
  const workspaceBudget = (await db.query("SELECT id,currency FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace' AND scope_id=$1", [scope.orgId])).rows[0];
  const unavailable = !route || route.adapter !== "dgx" ? "judge_route_unavailable"
    : !workspaceBudget || !evaluation || workspaceBudget.currency !== route.currency || evaluation.currency !== route.currency ? "judge_budget_unavailable" : null;
  if (unavailable) {
    // Recorded so the review queue can say why a person must grade these.
    for (const candidate of pending) {
      await db.query(`INSERT INTO evals.judge_job(org_id,run_id,observation_id,pending_assessment_id,case_revision_id,rubric_revision_id,criterion_ids,
          judge_model_revision_id,judge_prompt_revision,status,reason_code,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'skipped',$10,$11) ON CONFLICT (org_id,pending_assessment_id) DO NOTHING`,
      [scope.orgId, runId, candidate.observationId, candidate.assessment.assessment_id, candidate.item.revision_id, candidate.rubric.revision_id,
        judgeCriterionIds(candidate.item, candidate.rubric), route?.provider_revision_id ?? randomUUID(), JUDGE_PROMPT_REVISION, unavailable, scope.actorId]);
    }
    return { queued: 0, skipped: pending.length };
  }
  const passId = randomUUID(), workflowId = randomUUID();
  const runBudget = (await db.query(`INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,'run',$2,$3,$4) RETURNING id`,
    [scope.orgId, passId, evaluation.currency, evaluation.commercial_cap])).rows[0];
  const plan = digest({ runId, passId, judge: route!.provider_revision_id, prompt: JUDGE_PROMPT_REVISION });
  let queued = 0;
  for (const candidate of pending) {
    const jobId = randomUUID();
    const criterionIds = judgeCriterionIds(candidate.item, candidate.rubric);
    const excerpts = await sourceExcerpts(db, scope.orgId, candidate.item);
    const messages = [
      { role: "system" as const, content: judgeSystemPrompt() },
      { role: "user" as const, content: judgeUserMessage(candidate.item, candidate.observation, candidate.rubric, criterionIds, excerpts) },
    ];
    const invocation = invocationSchema.parse({
      probe: false, probeKind: "text", outputFormat: "json_object", judgeJobId: jobId,
      providerRevisionId: route!.provider_revision_id, priceRevisionId: route!.price_revision_id,
      workspaceBudgetId: workspaceBudget.id, runBudgetId: runBudget.id, role: "judge",
      dataClass: route!.data_class, region: route!.region, routing: "local_only", approvedProviderIds: [],
      messages, maxOutputTokens: boundedOutputTokens(messages, route!.context_limit, route!.output_limit, 1024),
      timeoutMs: 600000, internalCostPerSecond: route!.internal_cost_per_second,
    });
    await db.query(`INSERT INTO evals.judge_job(id,org_id,run_id,observation_id,pending_assessment_id,case_revision_id,rubric_revision_id,criterion_ids,
        judge_model_revision_id,judge_prompt_revision,workflow_id,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [jobId, scope.orgId, runId, candidate.observationId, candidate.assessment.assessment_id, candidate.item.revision_id, candidate.rubric.revision_id,
      criterionIds, route!.provider_revision_id, JUDGE_PROMPT_REVISION, workflowId, scope.actorId]);
    const stepId = await enqueueInvocation(db, scope as Tenant, { workflowId, runId: passId, planHash: plan, kind: "grade", version: 1, input: invocation });
    await db.query("UPDATE evals.judge_job SET step_id=$3,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, jobId, stepId]);
    queued++;
  }
  return { queued, skipped: 0 };
}

/** Agreement of this judge revision with later human decisions in the same workspace. */
export async function judgeCalibration(db: PoolClient, orgId: string, modelRevisionId: string, promptRevision: string): Promise<CalibrationSummary> {
  const rows = (await db.query(`SELECT j.outcome AS judge, COALESCE(h.outcome, j.outcome) AS human, cr.document->>'severity'='critical' AS critical
    FROM evals.assessment j
    JOIN evals.observation o ON (o.org_id,o.id)=(j.org_id,j.observation_id)
    JOIN evals.case_unit cu ON (cu.org_id,cu.id)=(o.org_id,o.case_unit_id)
    JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(cu.org_id,cu.case_revision_id)
    LEFT JOIN LATERAL (SELECT x.outcome FROM evals.assessment x WHERE x.org_id=j.org_id AND x.supersedes_assessment_id=j.id
      AND x.document->'author'->>'kind'='human' ORDER BY x.created_at DESC LIMIT 1) h ON true
    WHERE j.org_id=$1 AND j.document->'extensions'->'${JUDGE_EXTENSION}'->>'model_revision_id'=$2
      AND j.document->'extensions'->'${JUDGE_EXTENSION}'->>'prompt_revision'=$3
      AND (h.outcome IS NOT NULL OR EXISTS (SELECT 1 FROM evals.review_decision rd WHERE rd.org_id=j.org_id AND rd.assessment_id=j.id AND rd.decision='approve'))
    ORDER BY j.created_at DESC LIMIT 1000`, [orgId, modelRevisionId, promptRevision])).rows;
  return calibrationSummary(rows.map((row) => ({ judge: row.judge, human: row.human, critical: row.critical === true })));
}

/** Turns completed judge steps into superseding assessments. Safe to call repeatedly. */
export function advanceJudgments(scope: EvidenceScope, runId?: string, limit = 25) {
  return withTenant(scope, async (db) => {
    const jobs = (await db.query(`SELECT j.*, s.status AS step_status, s.reason_code AS step_reason, r.output
      FROM evals.judge_job j
      LEFT JOIN evals.workflow_step s ON (s.org_id,s.id)=(j.org_id,j.step_id)
      LEFT JOIN LATERAL (SELECT x.output FROM evals.execution_result x WHERE x.org_id=j.org_id AND x.step_id=j.step_id ORDER BY x.created_at DESC LIMIT 1) r ON true
      WHERE j.org_id=$1 AND j.status='queued' AND ($2::uuid IS NULL OR j.run_id=$2)
      ORDER BY j.created_at LIMIT $3 FOR UPDATE OF j SKIP LOCKED`, [scope.orgId, runId ?? null, limit])).rows;
    const outcome = { completed: 0, invalid: 0, failed: 0, pending: 0, superseded: 0 };
    const calibrations = new Map<string, CalibrationSummary>();
    for (const job of jobs) {
      const finish = (status: string, reason: string | null, resultId: string | null = null) => db.query(
        "UPDATE evals.judge_job SET status=$3,reason_code=$4,result_assessment_id=$5,updated_at=now() WHERE org_id=$1 AND id=$2",
        [scope.orgId, job.id, status, reason, resultId]);
      if (!job.output) {
        if (["failed", "paused", "canceled"].includes(job.step_status)) { await finish("failed", job.step_reason ?? `judge_step_${job.step_status}`); outcome.failed++; }
        else outcome.pending++;
        continue;
      }
      const row = (await db.query(`SELECT a.document AS pending, o.document AS observation, cr.document AS case_document, rr.document AS rubric_document,
          (SELECT x.id FROM evals.assessment x WHERE x.org_id=a.org_id AND x.observation_id=a.observation_id ORDER BY x.created_at DESC, x.id DESC LIMIT 1) AS latest_id
        FROM evals.assessment a JOIN evals.observation o ON (o.org_id,o.id)=(a.org_id,a.observation_id)
        JOIN evals.case_revision cr ON (cr.org_id,cr.id)=($1::uuid,$3::uuid)
        JOIN evals.rubric_revision rr ON (rr.org_id,rr.id)=($1::uuid,$4::uuid)
        WHERE a.org_id=$1 AND a.id=$2`, [scope.orgId, job.pending_assessment_id, job.case_revision_id, job.rubric_revision_id])).rows[0];
      if (!row) { await finish("failed", "judge_subject_missing"); outcome.failed++; continue; }
      // A reviewer already decided this result; the judge must not overwrite it.
      if (row.latest_id !== job.pending_assessment_id) { await finish("skipped", "superseded_before_judgment"); outcome.superseded++; continue; }
      const observation = observationSchema.parse(row.observation);
      const parsed = parseJudgeOutput(job.output, job.criterion_ids, candidateAnswer(observation));
      if (!parsed.ok) { await finish("invalid", parsed.reason); outcome.invalid++; continue; }
      const key = `${job.judge_model_revision_id}:${job.judge_prompt_revision}`;
      if (!calibrations.has(key)) calibrations.set(key, await judgeCalibration(db, scope.orgId, job.judge_model_revision_id, job.judge_prompt_revision));
      const assessment = combineJudgeAssessment({
        pending: assessmentSchema.parse(row.pending),
        item: caseSchema.parse(row.case_document),
        verdicts: parsed.verdicts,
        judge: { modelRevisionId: job.judge_model_revision_id, promptRevision: job.judge_prompt_revision, jobId: job.id },
        calibration: calibrations.get(key)!,
      });
      rubricSchema.parse(row.rubric_document);
      await db.query("INSERT INTO evals.assessment(id,org_id,observation_id,content_hash,document,outcome,review_status,supersedes_assessment_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [assessment.assessment_id, scope.orgId, job.observation_id, assessment.content_hash, assessment, assessment.outcome, assessment.review_status, assessment.supersedes_assessment_id]);
      for (const criterion of assessment.criteria) {
        await db.query("INSERT INTO evals.criterion_score(org_id,assessment_id,criterion_id,score,rationale) VALUES($1,$2,$3,$4,$5)",
          [scope.orgId, assessment.assessment_id, criterion.criterion_id, criterion.score, criterion.rationale]);
      }
      await finish("completed", null, assessment.assessment_id);
      outcome.completed++;
    }
    return outcome;
  });
}

/** Judge status for the operator run inspector. No prompts or raw model output. */
export function listRunJudgments(scope: EvidenceScope, runId: string) {
  return withTenant(scope, async (db) => {
    const jobs = (await db.query(`SELECT id,case_revision_id,status,reason_code,judge_model_revision_id,judge_prompt_revision,result_assessment_id,created_at,updated_at
      FROM evals.judge_job WHERE org_id=$1 AND run_id=$2 ORDER BY created_at LIMIT 500`, [scope.orgId, runId])).rows;
    const revisions = [...new Set(jobs.map((job) => `${job.judge_model_revision_id}:${job.judge_prompt_revision}`))];
    const calibration = await Promise.all(revisions.map(async (key) => {
      const [model, prompt] = key.split(":");
      return { modelRevisionId: model, promptRevision: prompt, ...(await judgeCalibration(db, scope.orgId, model, prompt)) };
    }));
    return { jobs, calibration };
  });
}
