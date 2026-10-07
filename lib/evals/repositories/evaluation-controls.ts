import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { EvalError } from "../domain/errors";
import { controlWorkflow } from "../queue/store";
import { withTenant } from "./db";
import { idempotent, type EvidenceScope } from "./evidence";
import { lockRunQueue } from "./run-capacity";
import { controlRunInTransaction, createSelfServiceRunInTransaction } from "./stage-c";
import { startAutomaticGenerationInTransaction } from "./automatic-generation";

export type EvaluationControlAction = "pause" | "resume" | "stop" | "restart";
type Subject = { id: string; kind: "generation" | "run"; status: string; control_state?: string; workflow_id?: string; phase?: string; created_at: Date; updated_at: Date };
const ACTIVE_RUN = new Set(["queued", "running", "pause_requested", "paused", "cancel_requested"]);
const FINISHED_GENERATION = new Set(["needs_review", "quarantined", "failed"]);

async function currentSubject(db: PoolClient, scope: EvidenceScope, evaluationId: string) {
  const evaluation = (await db.query("SELECT * FROM evals.evaluation WHERE org_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE", [scope.orgId, evaluationId])).rows[0];
  if (!evaluation) throw new EvalError("SCOPE_DENIED", 404);
  const run = (await db.query("SELECT *, 'run' AS kind FROM evals.run WHERE org_id=$1 AND evaluation_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1", [scope.orgId, evaluationId])).rows[0] as Subject | undefined;
  const generation = (await db.query("SELECT *, 'generation' AS kind FROM evals.generation_job WHERE org_id=$1 AND evaluation_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1", [scope.orgId, evaluationId])).rows[0] as Subject | undefined;
  const subject = generation && (!run && !evaluation.selected_suite_version_id || run && generation.created_at > run.created_at) ? generation : run;
  return { evaluation, subject };
}

async function runningClaims(db: PoolClient, orgId: string, subject: Subject) {
  return Boolean((await db.query(`SELECT 1 FROM evals.workflow_step s JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id)
    WHERE w.org_id=$1 AND w.run_id=$2 AND s.status='running' UNION ALL
    SELECT 1 FROM evals.case_unit WHERE org_id=$1 AND run_id=$2 AND status='running' LIMIT 1`, [orgId, subject.id])).rowCount);
}

async function state(db: PoolClient, scope: EvidenceScope, evaluationId: string) {
  const { subject } = await currentSubject(db, scope, evaluationId);
  const savedRestart = (await db.query("SELECT id,status,reason_code,new_subject_id,subject_id FROM evals.evaluation_restart WHERE org_id=$1 AND evaluation_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1", [scope.orgId, evaluationId])).rows[0] ?? null;
  const restart = savedRestart && (savedRestart.subject_id === subject?.id || savedRestart.new_subject_id === subject?.id) ? savedRestart : null;
  if (!subject) return { subject: null, restart, actions: [] as EvaluationControlAction[] };
  const workflow = (await db.query("SELECT id,status FROM evals.execution_workflow WHERE org_id=$1 AND run_id=$2", [scope.orgId, subject.id])).rows[0];
  const draining = await runningClaims(db, scope.orgId, subject);
  let status = subject.status;
  if (subject.kind === "generation" && subject.control_state !== "active") status = subject.control_state === "paused" ? draining ? "pause_requested" : "paused" : draining ? "cancel_requested" : "stopped";
  else if (subject.kind === "generation" && ["paused", "pause_requested"].includes(workflow?.status)) status = draining ? "pause_requested" : "paused";
  const actions: EvaluationControlAction[] = [];
  if (restart?.status === "pending") actions.push("stop");
  else {
    const active = subject.kind === "run" ? ACTIVE_RUN.has(status) : subject.control_state === "active" && !FINISHED_GENERATION.has(status);
    if (active && !["paused", "pause_requested", "cancel_requested"].includes(status) && (subject.kind === "generation" || workflow)) actions.push("pause");
    // An unknown model outcome requires reconciliation or an explicit fresh restart.
    if (status === "paused" && !draining && (subject.kind === "run" ? ["paused","pause_requested"].includes(workflow?.status) : subject.control_state === "paused")) actions.push("resume");
    if (active || subject.kind === "generation" && subject.control_state === "paused") actions.push("stop");
    actions.push("restart");
  }
  return { subject: { id: subject.id, kind: subject.kind, status, phase: subject.phase, updatedAt: subject.updated_at }, restart, actions };
}

export function getEvaluationControls(scope: EvidenceScope, evaluationId: string) {
  return withTenant(scope, db => state(db, scope, evaluationId));
}

async function stopGeneration(db: PoolClient, scope: EvidenceScope, evaluationId: string, subject: Subject, action: "pause" | "stop" | "resume") {
  const workflow = (await db.query("SELECT id,status FROM evals.execution_workflow WHERE org_id=$1 AND id=$2 FOR UPDATE", [scope.orgId, subject.workflow_id])).rows[0];
  const job = (await db.query("SELECT * FROM evals.generation_job WHERE org_id=$1 AND id=$2 FOR UPDATE", [scope.orgId, subject.id])).rows[0];
  if (action === "resume") {
    if (job.control_state !== "paused" || await runningClaims(db, scope.orgId, subject)) throw new EvalError("VERSION_CONFLICT", 409, "Wait for preparation to pause before resuming.");
    if (workflow && ["paused", "pause_requested"].includes(workflow.status)) await controlWorkflow(db, scope.orgId, workflow.id, "resume");
  } else if (workflow) await controlWorkflow(db, scope.orgId, workflow.id, action === "pause" ? "pause" : "cancel");
  const intent = action === "resume" ? "active" : action === "pause" ? "paused" : "stopped";
  await db.query("UPDATE evals.generation_job SET control_state=$3,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, subject.id, intent]);
  const preparation = action === "stop" ? "canceled" : action === "pause" ? "needs_input" : job.status === "needs_input" ? "needs_input" : ["profiling", "profile_ready"].includes(job.status) ? "profiling" : "generating";
  await db.query("UPDATE evals.evaluation SET preparation_status=$3,reason_code=$4,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, evaluationId, preparation, action === "resume" ? null : `operator_${intent}`]);
}

export function controlEvaluation(scope: EvidenceScope, evaluationId: string, input: { action: EvaluationControlAction; subjectId: string; subjectKind: "generation" | "run"; locale: "en" | "es" }, key: string) {
  return withTenant(scope, db => idempotent(db, scope, `evaluation-control/${evaluationId}`, key, input, async () => {
    await lockRunQueue(db, scope.orgId);
    const { subject } = await currentSubject(db, scope, evaluationId);
    if (!subject || subject.id !== input.subjectId || subject.kind !== input.subjectKind) throw new EvalError("VERSION_CONFLICT", 409, "This evaluation has changed. Refresh it before trying again.");
    const current = await state(db, scope, evaluationId);
    if (!current.actions.includes(input.action)) throw new EvalError("VERSION_CONFLICT", 409, "This action is no longer available. Refresh the evaluation.");
    if (input.action === "stop") await db.query("UPDATE evals.evaluation_restart SET status='canceled',updated_at=now() WHERE org_id=$1 AND evaluation_id=$2 AND status='pending'", [scope.orgId, evaluationId]);
    if (subject.kind === "generation") await stopGeneration(db, scope, evaluationId, subject, input.action === "restart" ? "stop" : input.action);
    else if (input.action !== "restart" || ACTIVE_RUN.has(subject.status)) await controlRunInTransaction(db, scope, subject.id, input.action === "stop" || input.action === "restart" ? "cancel" : input.action);
    if (input.action === "restart") {
      const previous = subject.kind === "generation" ? (await db.query("SELECT * FROM evals.generation_job WHERE org_id=$1 AND id=$2", [scope.orgId, subject.id])).rows[0] : null;
      const selection = previous ? previous.start_input ?? { sourceRevisionIds: previous.source_revision_ids, title: previous.title, executionMode: previous.execution_mode, promptRevision: previous.prompt_revision, maxCases: previous.requested_case_count, complexity: previous.complexity, locale: input.locale } : { evaluationId };
      await db.query("INSERT INTO evals.evaluation_restart(id,org_id,evaluation_id,subject_kind,subject_id,input,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)", [randomUUID(), scope.orgId, evaluationId, subject.kind, subject.id, selection, scope.actorId]);
    }
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,$3,$4,$5)", [scope.orgId, scope.actorId, `evaluation.${input.action}`, evaluationId, { subjectId: subject.id, subjectKind: subject.kind }]);
    return state(db, scope, evaluationId);
  }));
}

/** Idempotent creation and intent completion commit together, including scheduler/page races. */
export async function advanceEvaluationRestarts(scope: EvidenceScope, evaluationId?: string) {
  const intents = await withTenant(scope, async db => (await db.query("SELECT id,evaluation_id FROM evals.evaluation_restart WHERE org_id=$1 AND status='pending' AND ($2::uuid IS NULL OR evaluation_id=$2) ORDER BY created_at LIMIT 10", [scope.orgId, evaluationId ?? null])).rows);
  let completed = 0;
  for (const intent of intents) {
    try {
      const done = await withTenant(scope, async db => {
        await lockRunQueue(db, scope.orgId);
        const { subject } = await currentSubject(db, scope, intent.evaluation_id);
        const request = (await db.query("SELECT * FROM evals.evaluation_restart WHERE org_id=$1 AND id=$2 AND status='pending' FOR UPDATE", [scope.orgId, intent.id])).rows[0];
        if (!request) return false;
        if (!subject || subject.id !== request.subject_id || subject.kind !== request.subject_kind) {
          await db.query("UPDATE evals.evaluation_restart SET status='canceled',reason_code='superseded',updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, request.id]);
          return false;
        }
        if (await runningClaims(db, scope.orgId, subject)) return false;
        const actor = { orgId: scope.orgId, actorId: request.created_by };
        // Recheck persisted authority before initiating new work from a saved request.
        await db.query("SELECT set_config('evals.actor_id',$1,true)", [actor.actorId]);
        const writer = (await db.query("SELECT 1 FROM evals.membership WHERE org_id=$1 AND user_id=$2 AND role IN ('owner','operator','editor') UNION ALL SELECT 1 FROM evals.platform_role WHERE user_id=$2 AND role='platform_admin'", [scope.orgId, actor.actorId])).rowCount;
        if (!writer) throw new EvalError("SCOPE_DENIED", 403);
        const key = `evaluation-restart-${request.id}`;
        const selection = { ...request.input };
        if(subject.kind === "run"){
          const currentTarget=(await db.query(`SELECT tr.id FROM evals.target_revision tr JOIN evals.target t ON (t.org_id,t.id)=(tr.org_id,tr.target_id)
            WHERE tr.org_id=$1 AND t.archived_at IS NULL AND tr.target_id=(SELECT target_id FROM evals.target_revision WHERE org_id=$1 AND id=(SELECT selected_target_revision_id FROM evals.evaluation WHERE org_id=$1 AND id=$2))
            ORDER BY tr.created_at DESC,tr.id DESC LIMIT 1`,[scope.orgId,intent.evaluation_id])).rows[0];
          if(currentTarget)selection.targetRevisionId=currentTarget.id;
        }
        const result = subject.kind === "generation"
          ? await startAutomaticGenerationInTransaction(db, actor, intent.evaluation_id, request.input, key)
          : await createSelfServiceRunInTransaction(db, actor, selection, key);
        const id = "jobId" in result ? result.jobId : result.id;
        await db.query("UPDATE evals.evaluation_restart SET status='completed',new_subject_id=$3,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, request.id, id]);
        return true;
      });
      if (done) completed++;
    } catch (error) {
      // A transient database outage leaves the durable request for the next tick.
      if (!(error instanceof EvalError)) throw error;
      await withTenant(scope, db => db.query("UPDATE evals.evaluation_restart SET status='failed',reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='pending'", [scope.orgId, intent.id, error.code]));
    }
  }
  return completed;
}
