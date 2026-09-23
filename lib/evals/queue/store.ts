import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from '../contracts/hashing';
import type { PoolClient } from 'pg';
import { invocationSchema, type Invocation } from '../providers/contracts';
import { candidateInputSchema } from '../contracts/projections';
import { scenarioSchema,toolFixtureSchema } from '../contracts/scenarios';
import { z } from 'zod';
export type Tenant={orgId:string;actorId:string};
export type TenantTransaction=<T>(tenant:Tenant,fn:(client:PoolClient)=>Promise<T>)=>Promise<T>;
export const queues=['ingest','profile','generate','validate','execute_api','execute_browser','grade','aggregate','report','export','notify','cleanup'] as const;
export type Queue=typeof queues[number];
export const targetExecutionSchema=z.strictObject({kind:z.literal('target_execution'),runId:z.uuid(),caseUnitId:z.uuid(),caseRevisionId:z.uuid(),targetRevisionId:z.uuid(),repetition:z.number().int().nonnegative(),candidateInput:candidateInputSchema,scenario:scenarioSchema.optional(),toolFixture:toolFixtureSchema.nullable().optional(),timeoutMs:z.number().int().min(100).max(120000),destinationPolicyId:z.string().min(1).max(200)});
export type TargetExecution=z.infer<typeof targetExecutionSchema>;
export const browserDiscoverySchema=z.strictObject({kind:z.literal('website_discovery'),targetRevisionId:z.uuid(),connectionCheckId:z.uuid(),candidateId:z.uuid(),timeoutMs:z.number().int().min(1000).max(120000),destinationPolicyId:z.string().min(1).max(200)});
export type BrowserDiscovery=z.infer<typeof browserDiscoverySchema>;
export function digest(value:unknown):string{return sha256(canonicalJson(value));}
export async function event(client:PoolClient,orgId:string,workflowId:string,kind:string,reason?:string) {
 await client.query('INSERT INTO evals.execution_event(org_id,workflow_id,kind,reason_code) VALUES($1,$2,$3,$4)',[orgId,workflowId,kind,reason??null]);
}
/** Call in the domain transaction that freezes its run plan. Atomic step + durable outbox. */
export async function enqueueInvocation(client:PoolClient,tenant:Tenant,args:{workflowId:string;runId:string;planHash:string;kind:Queue;version:number;input:Invocation}) {
 const input=invocationSchema.parse(args.input), hash=digest(input);
 if(!['execute_api','generate','profile','grade'].includes(args.kind))throw new Error('unsupported_invocation_queue');
 await client.query(`INSERT INTO evals.execution_workflow(id,org_id,run_id,plan_hash,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(org_id,id) DO NOTHING`,[args.workflowId,tenant.orgId,args.runId,args.planHash,tenant.actorId]);
 const workflow=(await client.query('SELECT * FROM evals.execution_workflow WHERE org_id=$1 AND id=$2 FOR UPDATE',[tenant.orgId,args.workflowId])).rows[0];
 if(workflow.run_id!==args.runId || workflow.plan_hash!==args.planHash || !['queued','running'].includes(workflow.status))throw new Error('workflow_plan_conflict');
 const result=await client.query(`INSERT INTO evals.workflow_step(org_id,workflow_id,step_kind,input_hash,version,input) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(org_id,workflow_id,step_kind,input_hash,version) DO NOTHING RETURNING id`,[tenant.orgId,args.workflowId,args.kind,hash,args.version,input]);
 if(result.rows[0]) {
  await client.query('INSERT INTO evals.outbox_event(org_id,step_id,queue) VALUES($1,$2,$3)',[tenant.orgId,result.rows[0].id,args.kind]);
  await event(client,tenant.orgId,args.workflowId,'step_queued');return result.rows[0].id as string;
 }
 return (await client.query('SELECT id FROM evals.workflow_step WHERE org_id=$1 AND workflow_id=$2 AND step_kind=$3 AND input_hash=$4 AND version=$5',[tenant.orgId,args.workflowId,args.kind,hash,args.version])).rows[0].id as string;
}
export async function enqueueTargetExecution(client:PoolClient,tenant:Tenant,args:{workflowId:string;runId:string;planHash:string;version:number;queue?:'execute_api'|'execute_browser';input:TargetExecution}){const input=targetExecutionSchema.parse(args.input),hash=digest(input),queue=args.queue??'execute_api';await client.query(`INSERT INTO evals.execution_workflow(id,org_id,run_id,plan_hash,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(org_id,id) DO NOTHING`,[args.workflowId,tenant.orgId,args.runId,args.planHash,tenant.actorId]);const workflow=(await client.query('SELECT * FROM evals.execution_workflow WHERE org_id=$1 AND id=$2 FOR UPDATE',[tenant.orgId,args.workflowId])).rows[0];if(workflow.run_id!==args.runId||workflow.plan_hash!==args.planHash||!['queued','running'].includes(workflow.status))throw new Error('workflow_plan_conflict');const result=await client.query(`INSERT INTO evals.workflow_step(org_id,workflow_id,step_kind,input_hash,version,input) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(org_id,workflow_id,step_kind,input_hash,version) DO NOTHING RETURNING id`,[tenant.orgId,args.workflowId,queue,hash,args.version,input]);const id=result.rows[0]?.id??(await client.query("SELECT id FROM evals.workflow_step WHERE org_id=$1 AND workflow_id=$2 AND step_kind=$3 AND input_hash=$4 AND version=$5",[tenant.orgId,args.workflowId,queue,hash,args.version])).rows[0].id;if(result.rows[0]){await client.query("INSERT INTO evals.outbox_event(org_id,step_id,queue) VALUES($1,$2,$3)",[tenant.orgId,id,queue]);await event(client,tenant.orgId,args.workflowId,'step_queued');}return id as string;}
export async function enqueueBrowserDiscovery(client:PoolClient,tenant:Tenant,args:{workflowId:string;targetRevisionId:string;planHash:string;version:number;input:BrowserDiscovery}){const input=browserDiscoverySchema.parse(args.input),hash=digest(input);await client.query(`INSERT INTO evals.execution_workflow(id,org_id,run_id,plan_hash,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(org_id,id) DO NOTHING`,[args.workflowId,tenant.orgId,args.workflowId,args.planHash,tenant.actorId]);const result=await client.query(`INSERT INTO evals.workflow_step(org_id,workflow_id,step_kind,input_hash,version,input) VALUES($1,$2,'execute_browser',$3,$4,$5) ON CONFLICT(org_id,workflow_id,step_kind,input_hash,version) DO NOTHING RETURNING id`,[tenant.orgId,args.workflowId,hash,args.version,input]);const id=result.rows[0]?.id??(await client.query("SELECT id FROM evals.workflow_step WHERE org_id=$1 AND workflow_id=$2 AND step_kind='execute_browser' AND input_hash=$3 AND version=$4",[tenant.orgId,args.workflowId,hash,args.version])).rows[0].id;if(result.rows[0]){await client.query("INSERT INTO evals.outbox_event(org_id,step_id,queue) VALUES($1,$2,'execute_browser')",[tenant.orgId,id]);await event(client,tenant.orgId,args.workflowId,'website_discovery_queued');}return id as string;}
export async function controlWorkflow(client:PoolClient,orgId:string,workflowId:string,action:'pause'|'resume'|'cancel') {
 const w=(await client.query('SELECT * FROM evals.execution_workflow WHERE org_id=$1 AND id=$2 FOR UPDATE',[orgId,workflowId])).rows[0];
 if(!w)throw new Error('workflow_missing');
 if(['completed','partial','failed','canceled'].includes(w.status))return;
 if(action==='resume' && !['paused','pause_requested'].includes(w.status))throw new Error('workflow_not_paused');
 const status=action==='cancel'?'cancel_requested':action==='pause'?'pause_requested':'running';
 await client.query('UPDATE evals.execution_workflow SET status=$3,updated_at=now() WHERE org_id=$1 AND id=$2',[orgId,workflowId,status]);
 if(action==='cancel')await client.query("UPDATE evals.workflow_step SET status='canceled',updated_at=now() WHERE org_id=$1 AND workflow_id=$2 AND status IN ('queued','paused')",[orgId,workflowId]);
 if(action==='resume') {
  const steps=await client.query("UPDATE evals.workflow_step SET status='queued',reason_code=NULL WHERE org_id=$1 AND workflow_id=$2 AND status='paused' RETURNING id,step_kind",[orgId,workflowId]);
  for(const step of steps.rows)await client.query('INSERT INTO evals.outbox_event(org_id,step_id,queue) VALUES($1,$2,$3)',[orgId,step.id,step.step_kind]);
 }
 await event(client,orgId,workflowId,status);await projectWorkflow(client,orgId,workflowId);
}
export async function projectWorkflow(client:PoolClient,orgId:string,workflowId:string) {
 const w=(await client.query('SELECT status FROM evals.execution_workflow WHERE org_id=$1 AND id=$2 FOR UPDATE',[orgId,workflowId])).rows[0];
 const steps=(await client.query('SELECT status FROM evals.workflow_step WHERE org_id=$1 AND workflow_id=$2',[orgId,workflowId])).rows;
 if(!steps.length)return;
 const usable=(await client.query('SELECT EXISTS(SELECT 1 FROM evals.execution_result r JOIN evals.workflow_step s ON (s.org_id,s.id)=(r.org_id,r.step_id) WHERE s.org_id=$1 AND s.workflow_id=$2) AS yes',[orgId,workflowId])).rows[0].yes;
 const active=steps.some(s=>s.status==='running');const pending=steps.some(s=>['queued','paused'].includes(s.status));
 let status=w.status;
 if(w.status==='cancel_requested'&&!active)status=usable?'partial':'canceled';
 else if(w.status==='pause_requested'&&!active)status='paused';
 else if(!active&&steps.some(s=>s.status==='paused'))status='paused';
 else if(!active&&!pending)status=steps.every(s=>s.status==='completed')?'completed':usable?'partial':'failed';
 if(status!==w.status){await client.query('UPDATE evals.execution_workflow SET status=$3,updated_at=now() WHERE org_id=$1 AND id=$2',[orgId,workflowId,status]);await event(client,orgId,workflowId,status);}
}
export const workerIdentity=()=>randomUUID();
