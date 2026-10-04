import type { PoolClient } from "pg";

/** Project control intent together with case outcomes, including draining claims. */
export async function projectExecutionRun(db: PoolClient, orgId: string, runId: string) {
  const statuses = (await db.query("SELECT status FROM evals.case_unit WHERE org_id=$1 AND run_id=$2", [orgId, runId])).rows.map(row => row.status as string);
  if (!statuses.length) return;
  const workflow = (await db.query("SELECT status FROM evals.execution_workflow WHERE org_id=$1 AND run_id=$2", [orgId, runId])).rows[0];
  const draining = statuses.includes("running") || Boolean((await db.query(`SELECT 1 FROM evals.workflow_step s JOIN evals.execution_workflow w
    ON (w.org_id,w.id)=(s.org_id,s.workflow_id) WHERE w.org_id=$1 AND w.run_id=$2 AND s.status='running' LIMIT 1`, [orgId, runId])).rows[0]);
  const pending = statuses.some(status => ["pending", "queued", "running"].includes(status));
  const usable = statuses.includes("succeeded");
  let status = pending ? "running" : statuses.every(value => value === "succeeded") ? "completed" : usable ? "partial" : "failed";
  if (["pause_requested", "paused"].includes(workflow?.status) && pending) status = draining ? "pause_requested" : "paused";
  if (["cancel_requested", "canceled"].includes(workflow?.status)) status = draining ? "cancel_requested" : usable ? "partial" : "canceled";
  await db.query(`UPDATE evals.run SET status=$3,
    phase=CASE WHEN $3 IN ('completed','partial','failed') THEN 'grading' ELSE 'target_execution' END,
    updated_at=now() WHERE org_id=$1 AND id=$2`, [orgId, runId, status]);
}
