import type { PoolClient } from 'pg';
/** Redacted operational counters; caller applies operator authorization. */
export async function executionMetrics(c:PoolClient,orgId:string) {
 const outbox=(await c.query(`SELECT count(*)::int AS pending,coalesce(extract(epoch FROM now()-min(created_at)),0)::float AS oldest_seconds FROM evals.outbox_event WHERE org_id=$1 AND delivered_at IS NULL`,[orgId])).rows[0];
 const leases=(await c.query("SELECT count(*)::int AS active,count(*) FILTER(WHERE lease_until<=now())::int AS expired FROM evals.workflow_step WHERE org_id=$1 AND status='running'",[orgId])).rows[0];
 const costs=(await c.query(`SELECT state,count(*)::int AS count,sum(amount)::text AS amount FROM evals.budget_reservation WHERE org_id=$1 GROUP BY state`,[orgId])).rows;
 const paused=(await c.query("SELECT reason_code,count(*)::int AS count FROM evals.workflow_step WHERE org_id=$1 AND status IN ('paused','unknown') GROUP BY reason_code",[orgId])).rows;
 return {outbox,leases,costs,paused};
}
