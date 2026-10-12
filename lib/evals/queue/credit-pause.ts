import type { PoolClient } from "pg";
import { controlWorkflow, event, projectWorkflow } from "./store";
import { projectExecutionRun } from "./run-status";

/**
 * Billing pauses (launch spec v2 §6.8, §6.10; L-11). Only enforce mode pauses
 * work: shadow mode never calls these.
 *
 * credits_exhausted: the workspace's credits do not cover the next call.
 * cap_reached: a spending cap was reached (caps arrive with L-12/L-14).
 */
export const CREDIT_PAUSE_REASONS = ["credits_exhausted", "cap_reached"] as const;
export type CreditPauseReason = typeof CREDIT_PAUSE_REASONS[number];

/**
 * The existing pause path for a billing reason: the workflow stops claiming
 * (running steps drain, queued steps pause) and a run shows the reason, set
 * before its status changes so the run_paused notice carries it.
 */
export async function pauseWorkflowForCredits(c: PoolClient, orgId: string, workflowId: string, reason: CreditPauseReason = "credits_exhausted") {
  const workflow = (await c.query(`UPDATE evals.execution_workflow SET reason_code=$3,updated_at=now(),
      status=CASE WHEN EXISTS (SELECT 1 FROM evals.workflow_step s WHERE s.org_id=$1 AND s.workflow_id=$2 AND s.status='running')
        THEN 'pause_requested' ELSE 'paused' END
    WHERE org_id=$1 AND id=$2 AND status IN ('queued','running') RETURNING run_id`, [orgId, workflowId, reason])).rows[0]
    ?? (await c.query("SELECT run_id FROM evals.execution_workflow WHERE org_id=$1 AND id=$2", [orgId, workflowId])).rows[0];
  await c.query("UPDATE evals.workflow_step SET status='paused',reason_code=$3,updated_at=now() WHERE org_id=$1 AND workflow_id=$2 AND status='queued'",
    [orgId, workflowId, reason]);
  await event(c, orgId, workflowId, "billing_paused", reason);
  await projectWorkflow(c, orgId, workflowId);
  if (!workflow?.run_id) return;
  const run = await c.query(`UPDATE evals.run SET reason_code=$3,updated_at=now()
    WHERE org_id=$1 AND id=$2 AND status NOT IN ('completed','partial','failed','canceled') RETURNING id`, [orgId, workflow.run_id, reason]);
  if (run.rowCount) await projectExecutionRun(c, orgId, workflow.run_id);
}

/**
 * Resume re-queues: every workflow of the workspace paused for a billing
 * reason goes back to the queue with its paused steps. Runs and generation
 * jobs paused for that reason return to their working state; a run waits in
 * the queue for its slot again.
 */
export async function resumeCreditPausedWork(c: PoolClient, orgId: string): Promise<number> {
  const workflows = (await c.query(`SELECT id,run_id FROM evals.execution_workflow
    WHERE org_id=$1 AND status IN ('paused','pause_requested') AND reason_code=ANY($2::text[]) ORDER BY created_at,id FOR UPDATE`,
  [orgId, CREDIT_PAUSE_REASONS])).rows as Array<{ id: string; run_id: string }>;
  for (const workflow of workflows) {
    await controlWorkflow(c, orgId, workflow.id, "resume");
    await c.query("UPDATE evals.execution_workflow SET reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2", [orgId, workflow.id]);
    await c.query(`UPDATE evals.run SET status='queued',reason_code=NULL,queued_at=clock_timestamp(),updated_at=now()
      WHERE org_id=$1 AND id=$2 AND status IN ('paused','pause_requested') AND reason_code=ANY($3::text[])`, [orgId, workflow.run_id, CREDIT_PAUSE_REASONS]);
    await c.query(`UPDATE evals.generation_batch b SET status='queued',reason_code=NULL,updated_at=now()
      FROM evals.generation_job g WHERE g.org_id=$1 AND g.workflow_id=$2 AND b.org_id=g.org_id AND b.generation_job_id=g.id
        AND b.status='paused' AND b.reason_code=ANY($3::text[])`, [orgId, workflow.id, CREDIT_PAUSE_REASONS]);
    await c.query(`UPDATE evals.generation_job g SET reason_code=NULL,updated_at=now(),
        status=CASE WHEN EXISTS (SELECT 1 FROM evals.generation_batch b WHERE b.org_id=g.org_id AND b.generation_job_id=g.id AND b.step_kind='draft')
          THEN 'drafting' ELSE 'profiling' END
      WHERE g.org_id=$1 AND g.workflow_id=$2 AND g.status='paused' AND g.reason_code=ANY($3::text[])`, [orgId, workflow.id, CREDIT_PAUSE_REASONS]);
  }
  return workflows.length;
}
