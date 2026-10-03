import type { PoolClient } from "pg";
import { EvalError } from "../domain/errors";

/** Fully paused work holds no execution slot. Claims still draining do. */
export async function assertRunCapacity(db: PoolClient, orgId: string, excludeRunId?: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`self-service-runs:${orgId}`]);
  const row = (await db.query(`SELECT e.max_active_runs,
    (SELECT count(*)::int FROM evals.run r WHERE r.org_id=$1
      AND ($2::uuid IS NULL OR r.id<>$2)
      AND (r.status IN ('queued','running','pause_requested','cancel_requested')
        OR (r.status='paused' AND (EXISTS (
          SELECT 1 FROM evals.case_unit u WHERE u.org_id=r.org_id AND u.run_id=r.id AND u.status='running'
        ) OR EXISTS (
          SELECT 1 FROM evals.execution_workflow w JOIN evals.workflow_step s
            ON (s.org_id,s.workflow_id)=(w.org_id,w.id)
          WHERE w.org_id=r.org_id AND w.run_id=r.id AND s.status='running'
        ))))) AS active
    FROM evals.workspace_entitlement e WHERE e.org_id=$1`, [orgId, excludeRunId ?? null])).rows[0];
  if (!row || row.active >= row.max_active_runs) {
    throw new EvalError("SCOPE_DENIED", 409, "The workspace active-run allowance is in use.");
  }
}
