import { PgBoss } from 'pg-boss';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { queues, type Tenant, type TenantTransaction } from './store';
export const jobSchema=z.object({orgId:z.string().uuid(),stepId:z.string().uuid(),inputHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type JobData=z.infer<typeof jobSchema>;
export function createBoss(env:Record<string,string|undefined>=process.env,options:{bootstrap?:boolean}={}):PgBoss {
 const environment=z.enum(['development','production']).parse(env.EVALS_ENV);
 const schema=env.EVALS_QUEUE_SCHEMA;
 if(schema!==(environment==='production'?'evals_queue_prod':'evals_queue_dev'))throw new Error('queue_environment_mismatch');
 const connectionString=env.EVALS_QUEUE_DATABASE_URL_FILE?readFileSync(env.EVALS_QUEUE_DATABASE_URL_FILE,'utf8').trim():env.EVALS_QUEUE_DATABASE_URL;
 if(!connectionString)throw new Error('queue_database_missing');
 return new PgBoss({connectionString,schema,migrate:options.bootstrap===true,max:2,application_name:`evals-${environment}`});
}
export async function startBoss(boss:PgBoss) {await boss.start();for(const name of queues)await boss.createQueue(name);}
/** Outbox read/send/mark are separate short transactions. Duplicate delivery is expected. */
export async function dispatchOutbox(boss:Pick<PgBoss,'send'>,tx:TenantTransaction,tenant:Tenant,limit=25) {
 const events=await tx(tenant,async c=>(await c.query(`SELECT e.id,e.step_id,e.queue,s.input_hash FROM evals.outbox_event e
 JOIN evals.workflow_step s ON (s.org_id,s.id)=(e.org_id,e.step_id)
 WHERE e.org_id=$1 AND e.delivered_at IS NULL AND e.available_at<=now() ORDER BY e.created_at,e.id LIMIT $2`,[tenant.orgId,Math.min(100,limit)])).rows);
 for(const e of events) {
  await boss.send(e.queue,{orgId:tenant.orgId,stepId:e.step_id,inputHash:e.input_hash},{id:e.id,singletonKey:e.id,retryLimit:2,expireInSeconds:e.queue==='profile'||e.queue==='generate'?1200:180});
  await tx(tenant,async c=>{await c.query('UPDATE evals.outbox_event SET delivered_at=now() WHERE org_id=$1 AND id=$2 AND delivered_at IS NULL',[tenant.orgId,e.id]);});
 }
 return events.length;
}
