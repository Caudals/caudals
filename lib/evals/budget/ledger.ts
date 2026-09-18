import type { PoolClient } from 'pg';
import { units } from './money';

export class BudgetExceeded extends Error { constructor() { super('budget_exceeded'); } }
export interface ReservationInput {
  orgId: string; attemptId: string; accountId: string; workspaceBudgetId: string; runBudgetId: string; runId: string; amount: string; currency: string;
}
/** Caller must use a transaction. Locks always take provider, then ordered tenant budgets. */
export async function reserve(client: PoolClient, input: ReservationInput): Promise<string> {
  units(input.amount);
  const binding=(await client.query(`SELECT p.account_id,w.run_id,pr.currency FROM evals.execution_attempt a
    JOIN evals.workflow_step s ON (s.org_id,s.id)=(a.org_id,a.step_id)
    JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id)
    JOIN evals.provider_revision p ON p.id=a.provider_revision_id
    JOIN evals.price_revision pr ON pr.id=a.price_revision_id AND pr.provider_revision_id=p.id
    WHERE a.org_id=$1 AND a.id=$2 AND a.status='reserved'`,[input.orgId,input.attemptId])).rows[0];
  if(!binding||binding.account_id!==input.accountId||binding.run_id!==input.runId||binding.currency!==input.currency)throw new Error('reservation_scope_mismatch');
  const account = (await client.query('SELECT * FROM evals.provider_account WHERE id=$1 FOR UPDATE', [input.accountId])).rows[0];
  if (!account?.enabled || account.currency !== input.currency) throw new Error('provider_budget_unavailable');
  const budgets = (await client.query('SELECT * FROM evals.execution_budget WHERE org_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE', [input.orgId, [input.workspaceBudgetId, input.runBudgetId]])).rows;
  const workspace = budgets.find(b => b.id === input.workspaceBudgetId && b.kind === 'workspace' && b.scope_id === input.orgId);
  const run = budgets.find(b => b.id === input.runBudgetId && b.kind === 'run' && b.scope_id === input.runId);
  if (!workspace || !run || budgets.length !== 2) throw new Error('budget_scope_mismatch');
  for (const b of [account, ...budgets]) {
    if (b.currency !== input.currency) throw new Error('currency_mismatch');
    if (units(b.settled) + units(b.reserved) + units(input.amount) > units(b.ceiling)) throw new BudgetExceeded();
  }
  const result = await client.query(`INSERT INTO evals.budget_reservation(org_id,attempt_id,account_id,workspace_budget_id,run_budget_id,amount)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [input.orgId,input.attemptId,input.accountId,input.workspaceBudgetId,input.runBudgetId,input.amount]);
  await client.query('UPDATE evals.provider_account SET reserved=reserved+$2::numeric WHERE id=$1', [input.accountId,input.amount]);
  await client.query('UPDATE evals.execution_budget SET reserved=reserved+$3::numeric WHERE org_id=$1 AND id=ANY($2::uuid[])', [input.orgId,[input.workspaceBudgetId,input.runBudgetId],input.amount]);
  return result.rows[0].id;
}
/** Unknown liabilities retain their entire reservation. Idempotent settlement is audited. */
export async function settle(client: PoolClient, orgId: string, attemptId: string, actual: string, provenance: 'reported_usage'|'bounded_estimate'|'confirmed_not_dispatched', internalEstimate = '0'): Promise<void> {
  units(actual); units(internalEstimate);
  // Same global lock order as reserve, before locking reservation/tenant budgets.
  const found = (await client.query('SELECT * FROM evals.budget_reservation WHERE org_id=$1 AND attempt_id=$2', [orgId,attemptId])).rows[0];
  if (!found) throw new Error('reservation_missing');
  await client.query('SELECT id FROM evals.provider_account WHERE id=$1 FOR UPDATE', [found.account_id]);
  await client.query('SELECT id FROM evals.execution_budget WHERE org_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE', [orgId,[found.workspace_budget_id,found.run_budget_id]]);
  const r = (await client.query('SELECT * FROM evals.budget_reservation WHERE id=$1 FOR UPDATE', [found.id])).rows[0];
  if (['settled','released'].includes(r.state)) {
    if (units(r.actual) !== units(actual)) throw new Error('settlement_conflict');
    return;
  }
  // Record genuine invoice discrepancies even above the reserve: next dispatch blocks.
  await client.query('UPDATE evals.provider_account SET reserved=reserved-$2::numeric,settled=settled+$3::numeric WHERE id=$1', [r.account_id,r.amount,actual]);
  await client.query('UPDATE evals.execution_budget SET reserved=reserved-$3::numeric,settled=settled+$4::numeric WHERE org_id=$1 AND id=ANY($2::uuid[])', [orgId,[r.workspace_budget_id,r.run_budget_id],r.amount,actual]);
  await client.query(`UPDATE evals.budget_reservation SET state=$2,actual=$3,provenance=$4,settled_at=now() WHERE id=$1`, [r.id,provenance==='confirmed_not_dispatched'?'released':'settled',actual,provenance]);
  await client.query('INSERT INTO evals.execution_cost_entry(org_id,reservation_id,amount,provenance,internal_estimate) VALUES($1,$2,$3,$4,$5)', [orgId,r.id,actual,provenance,internalEstimate]);
}
