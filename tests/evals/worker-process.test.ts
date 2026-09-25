import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { describe,it,expect } from 'vitest';
import { fixture } from './worker-fixture';
import { InvocationWorker } from '@/lib/evals/queue/worker';
import { stageAOwnerUrl } from './stage-a-env';
describe.skipIf(!stageAOwnerUrl)('actual SIGKILL recovery boundaries',()=>{
 for(const mode of ['before','after'])it(`preserves accounting when killed ${mode} provider acceptance`,async()=>{
  const f=await fixture();let child:ReturnType<typeof fork>|undefined;
  try{
   const task=await f.enqueue();
   child=fork('tests/evals/fixtures/worker-crash-child.ts',[],{execArgv:['--conditions=react-server','--import','tsx'],env:{...process.env,EVALS_CRASH_DATABASE_URL:f.pool.options.connectionString,EVALS_CRASH_JOB:JSON.stringify(task.job),EVALS_CRASH_MODE:mode},stdio:['ignore','ignore','ignore','ipc']});
   const signal=await Promise.race([once(child,'message').then(([message])=>message),once(child,'exit').then(()=>{throw new Error('Child exited before boundary');}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Child boundary timeout')),15000))]);
   expect(signal).toBe(mode==='before'?'reserved':'accepted');
   const exited=once(child,'exit');child.kill('SIGKILL');await exited;child=undefined;
   await f.pool.query("UPDATE evals.workflow_step SET lease_until=now()-interval '1 second' WHERE id=$1",[task.job.stepId]);
   let calls=0;const worker=new InvocationWorker({tx:f.tx,keys:new Map(),actorId:f.tenant.actorId,workerId:randomUUID(),leaseSeconds:5,invoke:async()=>{calls++;return {text:'complete',complete:true,finishReason:'stop',latencyMs:1,usage:{input:10,output:5,cached:0}};}});
   await worker.recover(f.tenant);
   const before=await f.rows('SELECT state,actual FROM evals.budget_reservation ORDER BY created_at');
   expect(before[0].state).toBe(mode==='before'?'released':'unresolved');
   await worker.handle(task.job);
   expect(calls).toBe(mode==='before'?1:0);
   const status=(await f.rows('SELECT status FROM evals.workflow_step WHERE id=$1',[task.job.stepId]))[0].status;
   expect(status).toBe(mode==='before'?'completed':'unknown');
  }finally{if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}await f.close();}
 },30000);
});
