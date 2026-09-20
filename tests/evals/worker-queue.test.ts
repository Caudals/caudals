import { randomBytes,randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe,expect,it,vi } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { fixture } from './worker-fixture';
import { createBoss,dispatchOutbox,startBoss,type JobData } from '../../lib/evals/queue/boss';
import { InvocationWorker } from '../../lib/evals/queue/worker';

describe.skipIf(!process.env.EVALS_TEST_DATABASE_URL)('pg-boss 10.3.3 durable integration',()=>{
 it('uses a queue-only owner, survives restart, and consumes actual duplicate deliveries once',async()=>{
  const f=await fixture();const role=`evals_q_${randomUUID().replaceAll('-','')}`,password=randomBytes(24).toString('hex');
  const admin=new Pool({connectionString:process.env.EVALS_TEST_DATABASE_URL,max:1});let boss:PgBoss|undefined;let queuePool:Pool|undefined;
  try {
   // Both identifiers and password are generated internally, never user input.
   await f.pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
   await f.pool.query(`CREATE SCHEMA evals_queue_dev AUTHORIZATION ${role}`);
   const database=(await f.pool.query('SELECT current_database() AS name')).rows[0].name;
   const url=new URL(process.env.EVALS_TEST_DATABASE_URL!);url.pathname=`/${database}`;url.username=role;url.password=password;
   queuePool=new Pool({connectionString:url.href,max:1});
   await expect(queuePool.query('SELECT * FROM evals.execution_workflow')).rejects.toThrow(/permission denied/);
   const make=(bootstrap=false)=>createBoss({EVALS_ENV:'development',EVALS_QUEUE_SCHEMA:'evals_queue_dev',EVALS_QUEUE_DATABASE_URL:url.href},{bootstrap});
   await f.pool.query(`GRANT CREATE ON DATABASE ${database} TO ${role}`);
   boss=make(true);await startBoss(boss);await boss.stop({graceful:true});
   await f.pool.query(`REVOKE CREATE ON DATABASE ${database} FROM ${role}`);
   await expect(queuePool.query('CREATE SCHEMA forbidden_other_schema')).rejects.toThrow(/permission denied/);
   boss=make();await startBoss(boss);
   const task=await f.enqueue();await dispatchOutbox(boss,f.tx,f.tenant);
   expect((await f.rows('SELECT delivered_at FROM evals.outbox_event WHERE step_id=$1',[task.job.stepId]))[0].delivered_at).not.toBeNull();
   await boss.stop({graceful:true});boss=make();await startBoss(boss);
   const original=await boss.fetch<JobData>('execute_api');expect(original).toHaveLength(1);expect(original[0].data).toEqual(task.job);
   const invoke=vi.fn(async()=>({text:'queued fixture',complete:true,finishReason:'stop',usage:{input:10,output:5,cached:0},latencyMs:1}));
   const worker=new InvocationWorker({tx:f.tx,keys:new Map(),actorId:f.tenant.actorId,workerId:randomUUID(),invoke});
   await worker.handle(original[0].data);await boss.complete('execute_api',original[0].id);
   // Separate pg-boss job with identical domain identity simulates outbox redelivery.
   expect(await boss.send('execute_api',task.job,{id:randomUUID()})).not.toBeNull();
   const duplicate=await boss.fetch<JobData>('execute_api');expect(duplicate).toHaveLength(1);
   await worker.handle(duplicate[0].data);await boss.complete('execute_api',duplicate[0].id);
   expect(invoke).toHaveBeenCalledTimes(1);
   expect((await f.rows('SELECT count(*)::int AS n FROM evals.execution_result WHERE step_id=$1',[task.job.stepId]))[0].n).toBe(1);
   expect((await boss.getJobById('execute_api',duplicate[0].id))?.state).toBe('completed');
  }finally{
   await boss?.stop({graceful:true});await queuePool?.end();await f.close();
   await admin.query(`DROP ROLE IF EXISTS ${role}`);await admin.end();
  }
 },30000);
});
