import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { fixture,type Fixture } from './worker-fixture';
import { InvocationWorker } from '../../lib/evals/queue/worker';
import { controlWorkflow,digest } from '../../lib/evals/queue/store';
import { createBoss,dispatchOutbox } from '../../lib/evals/queue/boss';
import { publicAddress } from '../../lib/evals/providers/openai-compatible';
import { acquireCapacity } from '../../lib/evals/providers/registry';
import { ProviderFailure } from '../../lib/evals/providers/contracts';
const output={complete:true,finishReason:'stop',text:'fixture response',usage:{input:10,output:5,cached:0},latencyMs:10};
it('hashes stable JSON regardless of Postgres key ordering',()=>expect(digest({b:2,a:1})).toBe(digest({a:1,b:2})));
it('requires explicit environment-matching queue schema',()=>{
 expect(()=>createBoss({EVALS_ENV:'development',EVALS_QUEUE_SCHEMA:'evals_queue_prod'})).toThrow('queue_environment_mismatch');
});
it('blocks private, mapped, metadata and reserved addresses',()=>{
 for(const address of ['127.0.0.1','169.254.169.254','192.168.1.2','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])expect(publicAddress(address)).toBe(false);
 expect(publicAddress('8.8.8.8')).toBe(true);expect(publicAddress('2606:4700:4700::1111')).toBe(true);
});
describe.skipIf(!process.env.EVALS_TEST_DATABASE_URL)('durable worker',()=>{
 let f:Fixture;beforeAll(async()=>{f=await fixture();},30000);afterAll(async()=>{await f?.close();});
 const worker=(invoke=vi.fn(async()=>output))=>new InvocationWorker({tx:f.tx,keys:new Map(),actorId:f.tenant.actorId,workerId:randomUUID(),invoke,leaseSeconds:5});
 it('commits before acknowledgement, duplicate delivery makes one paid call and immutable output',async()=>{
  const task=await f.enqueue(),invoke=vi.fn(async()=>output),w=worker(invoke);
  await Promise.all([w.handle(task.job),w.handle(task.job)]);await w.handle(task.job);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect((await f.rows('SELECT status FROM evals.workflow_step WHERE id=$1',[task.job.stepId]))[0].status).toBe('completed');
  expect((await f.rows('SELECT settled,reserved FROM evals.execution_budget WHERE id=$1',[task.runBudgetId]))[0]).toEqual({settled:'0.020000000',reserved:'0.000000000'});
  await expect(f.pool.query("UPDATE evals.execution_result SET output='{}' WHERE step_id=$1",[task.job.stepId])).rejects.toThrow('immutable execution record');
 });
 it('freezes queued inputs and plans in the database',async()=>{
  const task=await f.enqueue();
  await expect(f.rows("UPDATE evals.workflow_step SET input='{}' WHERE id=$1",[task.job.stepId])).rejects.toThrow('immutable execution input');
  await expect(f.rows("UPDATE evals.execution_workflow SET plan_hash=$2 WHERE id=$1",[task.workflowId,'b'.repeat(64)])).rejects.toThrow('immutable execution plan');
 });
 it('preserves incomplete observations with partial workflow status',async()=>{
  const task=await f.enqueue();await worker(vi.fn(async()=>({...output,complete:false,finishReason:'length'}))).handle(task.job);
  expect((await f.rows('SELECT status FROM evals.workflow_step WHERE id=$1',[task.job.stepId]))[0].status).toBe('failed');
  expect((await f.rows('SELECT status FROM evals.execution_workflow WHERE id=$1',[task.workflowId]))[0].status).toBe('partial');
 });
 it('calls providers outside transactions and cancellation stops new dispatch while allowing settlement',async()=>{
  const task=await f.enqueue();const invoke=vi.fn(async()=>{
   const connections=await f.pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'");expect(connections.rows[0].count).toBe(0);
   await f.tx(f.tenant,c=>controlWorkflow(c,f.orgId,task.workflowId,'cancel'));return output;
  });await worker(invoke).handle(task.job);
  expect((await f.rows('SELECT status FROM evals.execution_workflow WHERE id=$1',[task.workflowId]))[0].status).toBe('partial');
  const canceled=await f.enqueue();await f.tx(f.tenant,c=>controlWorkflow(c,f.orgId,canceled.workflowId,'cancel'));await worker(invoke).handle(canceled.job);expect(invoke).toHaveBeenCalledTimes(1);
 });
 it('unknown provider acceptance retains liability and is never replayed',async()=>{
  const task=await f.enqueue(),invoke=vi.fn(async()=>{throw new ProviderFailure('network_unavailable','unknown');});const w=worker(invoke);
  await w.handle(task.job);await w.handle(task.job);
  expect(invoke).toHaveBeenCalledTimes(1);
  const result=(await f.rows('SELECT r.state,r.amount,r.actual FROM evals.budget_reservation r JOIN evals.execution_attempt a ON a.id=r.attempt_id WHERE a.step_id=$1',[task.job.stepId]))[0];
  expect(result.state).toBe('unresolved');expect(result.actual).toBeNull();expect(Number(result.amount)).toBeGreaterThan(0);
  await f.pool.query('UPDATE evals.provider_health SET circuit_until=NULL');
 });
 it('never invokes without budget and accounts for every throttled retry',async()=>{
  const blocked=await f.enqueue(),blockedInvoke=vi.fn(async()=>output);
  await f.rows('UPDATE evals.execution_budget SET ceiling=0 WHERE id=$1',[blocked.runBudgetId]);
  await worker(blockedInvoke).handle(blocked.job);expect(blockedInvoke).not.toHaveBeenCalled();
  expect((await f.rows('SELECT status,reason_code FROM evals.workflow_step WHERE id=$1',[blocked.job.stepId]))[0]).toEqual({status:'paused',reason_code:'budget_exceeded'});
  const task=await f.enqueue();let count=0;
  const invoke=vi.fn(async()=>{if(count++===0)throw new ProviderFailure('overloaded','rejected');return output;});
  const w=worker(invoke);await w.handle(task.job);
  await f.pool.query('UPDATE evals.provider_health SET circuit_until=NULL');
  await f.rows('UPDATE evals.workflow_step SET not_before=now() WHERE id=$1',[task.job.stepId]);
  await w.handle(task.job);expect(invoke).toHaveBeenCalledTimes(2);
  const entries=await f.rows('SELECT r.state,r.provenance FROM evals.budget_reservation r JOIN evals.execution_attempt a ON a.id=r.attempt_id WHERE a.step_id=$1 ORDER BY a.ordinal',[task.job.stepId]);
  expect(entries).toEqual([{state:'settled',provenance:'bounded_estimate'},{state:'settled',provenance:'reported_usage'}]);
 });
 it('fences a killed worker after acceptance; stale result cannot commit',async()=>{
  const task=await f.enqueue();let accepted!:()=>void;const started=new Promise<void>(resolve=>accepted=resolve);let release!:(value:typeof output)=>void;
  const response=new Promise<typeof output>(resolve=>release=resolve);const invoke=vi.fn(async()=>{accepted();return response;}),w=worker(invoke);
  const running=w.handle(task.job);await started;
  await f.rows("UPDATE evals.workflow_step SET lease_until=now()-interval '1 second' WHERE id=$1",[task.job.stepId]);await w.recover(f.tenant);release(output);await running;
  expect((await f.rows('SELECT status FROM evals.workflow_step WHERE id=$1',[task.job.stepId]))[0].status).toBe('unknown');
  expect(await f.rows('SELECT * FROM evals.execution_result WHERE step_id=$1',[task.job.stepId])).toHaveLength(0);
  await w.handle(task.job);expect(invoke).toHaveBeenCalledTimes(1);
 });
 it('serializes DGX residency across distinct models AND provider accounts',async()=>{
  const make=async(model:string)=>{
   const accountId=randomUUID(),id=randomUUID();
   await f.pool.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'local fixture','EUR',10,true)",[accountId]);
   return (await f.pool.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm)
    VALUES($1,$2,'dgx','http://dgx.invalid/v1',$3,'fixture',ARRAY['target'],'{}',2048,32,ARRAY['test'],ARRAY['EU'],100,100000) RETURNING *`,[id,accountId,model])).rows[0];
  };
  const a=await make('model-a'),b=await make('model-b');
  const results=await Promise.allSettled([f.tx(f.tenant,c=>acquireCapacity(c,a,randomUUID(),2048)),f.tx(f.tenant,c=>acquireCapacity(c,b,randomUUID(),2048))]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  await f.pool.query('UPDATE evals.provider_slot SET released_at=now() WHERE provider_revision_id=ANY($1::uuid[])',[[a.id,b.id]]);
 });
 it('persists outbox when publishing fails and tolerates publish/mark duplicate',async()=>{
  await f.enqueue();const send=vi.fn().mockRejectedValueOnce(new Error('queue offline'));
  await expect(dispatchOutbox({send},f.tx,f.tenant)).rejects.toThrow('queue offline');
  const pending=(await f.rows('SELECT count(*)::int AS n FROM evals.outbox_event WHERE delivered_at IS NULL AND available_at<=now()'))[0].n;expect(pending).toBeGreaterThan(0);
  send.mockResolvedValue(randomUUID());await dispatchOutbox({send},f.tx,f.tenant,100);
  expect((await f.rows('SELECT count(*)::int AS n FROM evals.outbox_event WHERE delivered_at IS NULL AND available_at<=now()'))[0].n).toBe(0);
 });
});
