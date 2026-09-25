import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixture, seedAttempt, type Fixture } from './worker-fixture';
import { reserve, settle } from '../../lib/evals/budget/ledger';
import { decimal, units, worstCase } from '../../lib/evals/budget/money';
import { stageAOwnerUrl } from './stage-a-env';
it('uses exact nano-unit arithmetic and rounds uncertainty upward',()=>{
 expect(decimal(units('0.1')+units('0.2'))).toBe('0.300000000');
 expect(worstCase({input_price:'0.000000001',output_price:'0',cache_price:'0',tool_price:'0',uncertainty_bps:1},1,0)).toBe('0.000000002');
 expect(()=>units('1e-9')).toThrow('invalid_decimal');expect(()=>units('0.0000000001')).toThrow();
});
describe.skipIf(!stageAOwnerUrl)('atomic three-cap ledger',()=>{
 let f:Fixture;beforeAll(async()=>{f=await fixture();},30000);afterAll(async()=>{await f?.close();});
 for(const cap of ['provider','workspace','run'] as const)it(`serializes concurrent ${cap} cap reservations`,async()=>{
  const task=await f.enqueue();
  await f.pool.query('UPDATE evals.provider_account SET ceiling=settled+reserved+100 WHERE id=$1',[f.accountId]);
  await f.rows('UPDATE evals.execution_budget SET ceiling=settled+reserved+100 WHERE org_id=$1',[f.orgId]);
  if(cap==='provider')await f.pool.query('UPDATE evals.provider_account SET ceiling=settled+reserved+0.1 WHERE id=$1',[f.accountId]);
  else await f.rows('UPDATE evals.execution_budget SET ceiling=settled+reserved+0.1 WHERE id=$1',[cap==='workspace'?f.workspaceBudgetId:task.runBudgetId]);
  const invoke=()=>f.tx(f.tenant,async c=>{
   // Separate steps allow actual simultaneous independent attempts.
   const other=await c.query(`INSERT INTO evals.workflow_step(org_id,workflow_id,step_kind,input_hash,version,input) VALUES($1,$2,'execute_api',$3,1,'{}') RETURNING id`,[f.orgId,task.workflowId,crypto.randomUUID().replaceAll('-','').repeat(2)]);
   const attemptId=await seedAttempt(c,f.orgId,other.rows[0].id,f.providerId,f.priceId);
   return reserve(c,{orgId:f.orgId,attemptId,accountId:f.accountId,workspaceBudgetId:f.workspaceBudgetId,runBudgetId:task.runBudgetId,runId:task.runId,amount:'0.1',currency:'EUR'});
  });
  const results=await Promise.allSettled([invoke(),invoke(),invoke(),invoke()]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(3);
 });
 it('retains unknown liabilities and settles exactly once',async()=>{
  await f.pool.query('UPDATE evals.provider_account SET ceiling=100 WHERE id=$1',[f.accountId]);await f.rows('UPDATE evals.execution_budget SET ceiling=100 WHERE org_id=$1',[f.orgId]);
  const task=await f.enqueue();let attemptId='';
  await f.tx(f.tenant,async c=>{attemptId=await seedAttempt(c,f.orgId,task.job.stepId,f.providerId,f.priceId);await reserve(c,{orgId:f.orgId,attemptId,accountId:f.accountId,workspaceBudgetId:f.workspaceBudgetId,runBudgetId:task.runBudgetId,runId:task.runId,amount:'1',currency:'EUR'});await c.query("UPDATE evals.budget_reservation SET state='unresolved' WHERE attempt_id=$1",[attemptId]);});
  expect((await f.rows('SELECT reserved FROM evals.execution_budget WHERE id=$1',[task.runBudgetId]))[0].reserved).toBe('1.000000000');
  await f.tx(f.tenant,c=>settle(c,f.orgId,attemptId,'0.3','reported_usage'));
  await f.tx(f.tenant,c=>settle(c,f.orgId,attemptId,'0.3','reported_usage'));
  expect((await f.rows('SELECT settled,reserved FROM evals.execution_budget WHERE id=$1',[task.runBudgetId]))[0]).toEqual({settled:'0.300000000',reserved:'0.000000000'});
  await expect(f.tx(f.tenant,c=>settle(c,f.orgId,attemptId,'0.4','reported_usage'))).rejects.toThrow('settlement_conflict');
 });
});
