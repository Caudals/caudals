import type { PoolClient } from "pg";
import { EvalError } from "../domain/errors";

/** Acquire before workflow/job row locks so API and both worker services agree. */
export async function lockRunQueue(db: PoolClient, orgId: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`self-service-runs:${orgId}`]);
}

/** Capacity is checked at dispatch; missing/disabled entitlements still deny creation. */
export async function assertRunAllowance(db: PoolClient, orgId: string) {
  await lockRunQueue(db, orgId);
  const row = (await db.query("SELECT max_active_runs FROM evals.workspace_entitlement WHERE org_id=$1", [orgId])).rows[0];
  if (!row || row.max_active_runs < 1) {
    throw new EvalError("SCOPE_DENIED", 409, "Evaluation runs are not enabled for this workspace.");
  }
}

// A paused workflow releases its slot after its last claim drains. Include
// workflow state for runs created by older releases before run projection.
const holdsSlot = `(
  (r.status IN ('queued','running','pause_requested','cancel_requested') AND (
    EXISTS (SELECT 1 FROM evals.execution_workflow w WHERE w.org_id=r.org_id AND w.run_id=r.id
      AND w.status IN ('running','pause_requested','cancel_requested'))
    OR (r.status='running' AND NOT EXISTS (
      SELECT 1 FROM evals.execution_workflow w WHERE w.org_id=r.org_id AND w.run_id=r.id
        AND w.status IN ('paused','completed','partial','failed','canceled'))
      AND NOT EXISTS (SELECT 1 FROM evals.runner_job j WHERE j.org_id=r.org_id AND j.run_id=r.id
        AND (j.status NOT IN ('ready','claimed') OR j.expires_at<=now())))
  ))
  OR EXISTS (SELECT 1 FROM evals.case_unit u WHERE u.org_id=r.org_id AND u.run_id=r.id AND u.status='running')
  OR EXISTS (SELECT 1 FROM evals.execution_workflow w JOIN evals.workflow_step s
    ON (s.org_id,s.workflow_id)=(w.org_id,w.id)
    WHERE w.org_id=r.org_id AND w.run_id=r.id AND s.status='running')
)`;
const waiting = `(r.status='queued' OR (r.status='paused' AND r.reason_code='runner_wait'))
  AND NOT EXISTS (SELECT 1 FROM evals.execution_workflow w WHERE w.org_id=r.org_id AND w.run_id=r.id
    AND w.status NOT IN ('queued','running'))
  AND NOT EXISTS (SELECT 1 FROM evals.runner_job j WHERE j.org_id=r.org_id AND j.run_id=r.id
    AND (j.status NOT IN ('ready','claimed') OR j.expires_at<=now()))`;

/** Reserve a run slot atomically, in queue order, before reserving any call.
 * The caller holds lockRunQueue before locking its workflow or private job.
 * Generation, connection probes and grading do not call this function.
 */
export async function startQueuedRun(db: PoolClient, orgId: string, runId: string): Promise<boolean> {
  await lockRunQueue(db, orgId);
  const run = (await db.query(`SELECT r.status,${holdsSlot} AS active FROM evals.run r WHERE r.org_id=$1 AND r.id=$2`, [orgId, runId])).rows[0];
  if (!run) return false;
  if (run.active) return true; // Subsequent cases and draining claims share this slot.
  const allowance = (await db.query("SELECT max_active_runs FROM evals.workspace_entitlement WHERE org_id=$1", [orgId])).rows[0];
  if (!allowance || allowance.max_active_runs < 1) return false;
  const active = (await db.query(`SELECT count(*)::int AS n FROM evals.run r WHERE r.org_id=$1 AND ${holdsSlot}`, [orgId])).rows[0].n;
  if (active >= allowance.max_active_runs) return false;
  const next = (await db.query(`SELECT r.id FROM evals.run r WHERE r.org_id=$1 AND ${waiting} AND NOT ${holdsSlot}
    ORDER BY r.queued_at,r.id LIMIT 1`, [orgId])).rows[0];
  if (next?.id !== runId) return false;
  const result = await db.query(`UPDATE evals.run SET status='running',reason_code=NULL,updated_at=now()
    WHERE org_id=$1 AND id=$2 AND (status='queued' OR (status='paused' AND reason_code='runner_wait')) RETURNING id`, [orgId, runId]);
  return result.rowCount === 1;
}

/** Waiting jobs stay durable across restarts without consuming attempts or cost. */
export async function deferRunStep(db: PoolClient, orgId: string, stepId: string, queue: string) {
  await db.query("UPDATE evals.workflow_step SET reason_code='run_capacity_wait',updated_at=now() WHERE org_id=$1 AND id=$2", [orgId, stepId]);
  await db.query(`INSERT INTO evals.outbox_event(org_id,step_id,queue,available_at)
    SELECT $1,$2,$3,now()+interval '5 seconds' WHERE NOT EXISTS (
      SELECT 1 FROM evals.outbox_event WHERE org_id=$1 AND step_id=$2 AND delivered_at IS NULL AND available_at>now())`, [orgId, stepId, queue]);
}
