import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { startAutomaticGeneration, advanceAutomaticGeneration, advancePendingGenerations, getAutomaticGeneration } from "../../lib/evals/repositories/automatic-generation";
import { controlEvaluation, getEvaluationControls, advanceEvaluationRestarts } from "../../lib/evals/repositories/evaluation-controls";
import { listActivity } from "../../lib/evals/repositories/notifications";
import { queueRequiredInputNotifications } from "../../lib/evals/operations/notifications";
import { InvocationWorker } from "../../lib/evals/queue/worker";
import type { JobData } from "../../lib/evals/queue/boss";
const ownerUrl=process.env.EVALS_TEST_OWNER_URL,runtimeUrl=process.env.EVALS_TEST_DATABASE_URL;
(ownerUrl && runtimeUrl ? describe : describe.skip)("durable evaluation controls",()=>{
 const owner=new Pool({connectionString:ownerUrl,max:1}),workerPool=new Pool({connectionString:ownerUrl,max:4});
 workerPool.on("connect",client=>{void client.query("SET ROLE evals_worker");});
 afterAll(async()=>{await owner.end();await workerPool.end();await getEvalsPool().end();});
 async function fixture(){
  process.env.EVALS_DATABASE_URL=runtimeUrl!;
  const actorId=createPrefixedId("au"),orgId=randomUUID(),projectId=randomUUID(),evaluationId=randomUUID(),otherEvaluationId=randomUUID();
  await owner.query("SELECT set_config('evals.actor_id',$1,false),set_config('evals.org_id',$2,false)",[actorId,orgId]);
  await owner.query(`INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,'Models fixture',$2,true)`,[actorId,randomUUID()+"@example.test"]);
  await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Models fixture',$2)",[orgId,actorId]);
  await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')",[orgId,actorId]);
  await owner.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Models fixture')",[projectId,orgId]);
  for(const id of [evaluationId,otherEvaluationId])await owner.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Models fixture','source_grounded',5,'EUR')",[id,orgId,projectId]);
  const providers=[] as Array<{id:string;price:string;account:string}>;
  for(const model of ['default','chosen']){
   const account=randomUUID(),id=randomUUID(),price=randomUUID();
   await owner.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'Fixture','EUR',100,true)",[account]);
   await owner.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,concurrency_limit,rpm,tpm)
    VALUES($1,$2,'openai_compatible','https://example.test/v1',$3,$4,$5,'{"text":true,"boundedTokens":true,"jsonObject":true}',32000,4096,ARRAY['customer_confidential'],ARRAY['private_wireguard'],1,10,100000)`,[id,account,model,actorId,['context_analyzer','generator','judge','report_writer']]);
   await owner.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0,0,0,0,0,'fixture')",[price,id]);
   await owner.query("INSERT INTO evals.provider_connection(account_id,adapter,endpoint,created_by) VALUES($1,'openai_compatible','https://example.test/v1',$2)",[account,actorId]);
   providers.push({id,price,account});
  }
  const roles=['context_analyzer','generator','judge','report_writer'];
  for(const role of roles)await owner.query("INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,'customer_confidential','private_wireguard',0,$5)",[orgId,role,providers[0].id,providers[0].price,actorId]);
  for(const role of roles)await owner.query("INSERT INTO evals.evaluation_model_route(org_id,evaluation_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,$5,'customer_confidential','private_wireguard',0,$6)",[orgId,evaluationId,role,providers[1].id,providers[1].price,actorId]);
  return {orgId,actorId,projectId,evaluationId,otherEvaluationId,providers};
 }

 async function prepare(){
  const f=await fixture();const {source}=syntheticAccountingFixture(f.actorId),artifactId=randomUUID();
  await owner.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready',now()+interval '1 day')",[artifactId,f.orgId,f.projectId,source.artifact.path,'fixture/'+artifactId,source.artifact.sha256,source.artifact.size_bytes,source.artifact.media_type]);
  await owner.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,'caudals_owned')",[source.source_id,f.orgId,f.projectId,source.title]);
  await owner.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'fixture')",[source.revision_id,f.orgId,source.source_id,artifactId,source.content_hash,source]);
  const input={sourceRevisionIds:[source.revision_id],title:'Saved preparation',executionMode:'imported_responses',promptRevision:'fixture',maxCases:45,complexity:'expert',locale:'es'};
  const job=await startAutomaticGeneration(f,f.evaluationId,input,randomUUID());
  const queueJob=(await owner.query("SELECT id,input_hash FROM evals.workflow_step WHERE id=$1",[job.stepId])).rows[0];
  return {...f,job,input,queueJob:{orgId:f.orgId,stepId:job.stepId,inputHash:queueJob.input_hash} as JobData};
 }
 const command=(f:Awaited<ReturnType<typeof prepare>>,action:'pause'|'resume'|'stop'|'restart',key=randomUUID())=>controlEvaluation(f,f.evaluationId,{action,subjectId:f.job.jobId,subjectKind:'generation',locale:'es'},key);
 const worker=(actorId:string,invoke:NonNullable<ConstructorParameters<typeof InvocationWorker>[0]['invoke']>)=>new InvocationWorker({tx:(scope,fn)=>withTenant(scope,fn,workerPool),keys:new Map(),actorId,workerId:randomUUID(),invoke});
 it('pauses queued preparation before spending, resumes its frozen job and audits both actions',async()=>{
  const f=await prepare();let calls=0;
  const w=worker(f.actorId,async()=>{calls++;return {text:'{}',complete:true,finishReason:'stop',latencyMs:1};});
  expect((await command(f,'pause')).subject?.status).toBe('paused');
  await w.handle(f.queueJob);expect(calls).toBe(0);
  expect(await queueRequiredInputNotifications(f)).toBe(0);
  expect((await listActivity(f)).find(item=>item.id===f.job.jobId)).toMatchObject({stage:'paused',active:false});
  await expect(advanceAutomaticGeneration(f,f.evaluationId,f.job.jobId,randomUUID())).resolves.toMatchObject({status:'paused'});
  await command(f,'resume');await w.handle(f.queueJob);expect(calls).toBe(1);
  expect((await getAutomaticGeneration(f,f.evaluationId)).status).toBe('profile_ready');
  expect((await owner.query("SELECT action FROM evals.audit_event WHERE org_id=$1 AND action LIKE 'evaluation.%' ORDER BY created_at",[f.orgId])).rows.map(x=>x.action)).toEqual(['evaluation.pause','evaluation.resume']);
 });
 it('preserves pause intent when an in-flight model completion arrives',async()=>{
  const f=await prepare();let signal!:()=>void,finish!:()=>void;
  const started=new Promise<void>(resolve=>{signal=resolve;}),released=new Promise<void>(resolve=>{finish=resolve;});
  const w=worker(f.actorId,async()=>{signal();await released;return {text:'{}',complete:true,finishReason:'stop',latencyMs:1};});
  const running=w.handle(f.queueJob);await Promise.race([started,running.then(()=>{throw Error('not dispatched');})]);
  try{
   expect((await command(f,'pause')).subject?.status).toBe('pause_requested');
   await expect(command(f,'resume')).rejects.toMatchObject({code:'VERSION_CONFLICT'});
   finish();await running;
   expect((await getAutomaticGeneration(f,f.evaluationId)).status).toBe('paused');
   expect(await advancePendingGenerations(f)).toBe(0);
   await command(f,'resume');expect((await getAutomaticGeneration(f,f.evaluationId)).status).toBe('profile_ready');
  }finally{finish();await running;}
 });
 it('drains before restarting, creates only once, keeps evidence and freezes current models',async()=>{
  const f=await prepare();let signal!:()=>void,finish!:()=>void;
  const started=new Promise<void>(resolve=>{signal=resolve;}),released=new Promise<void>(resolve=>{finish=resolve;});
  const running=worker(f.actorId,async()=>{signal();await released;return {text:'{}',complete:true,finishReason:'stop',latencyMs:1};}).handle(f.queueJob);
  await Promise.race([started,running.then(()=>{throw Error('not dispatched');})]);
  try{
   const key=randomUUID();expect((await command(f,'restart',key)).restart?.status).toBe('pending');
   await command(f,'restart',key);expect(await advanceEvaluationRestarts(f)).toBe(0);
   await owner.query("DELETE FROM evals.evaluation_model_route WHERE org_id=$1",[f.orgId]);
   finish();await running;
   expect((await getAutomaticGeneration(f,f.evaluationId,f.job.jobId)).status).toBe('stopped');
   expect((await listActivity(f)).find(item=>item.id===f.job.jobId)).toMatchObject({stage:'canceled',active:false});
   const done=await Promise.all([advanceEvaluationRestarts(f),advanceEvaluationRestarts(f)]);expect(done.reduce((a,b)=>a+b,0)).toBe(1);
   const next=(await owner.query("SELECT id,model_routes,start_input,control_state FROM evals.generation_job WHERE org_id=$1 ORDER BY created_at DESC",[f.orgId])).rows;
   expect(next).toHaveLength(2);expect(next[0].start_input).toEqual(f.input);expect(next[0].model_routes.generator.model_id).toBe('default');expect(next[1].control_state).toBe('stopped');
   expect((await owner.query("SELECT 1 FROM evals.execution_result WHERE org_id=$1",[f.orgId])).rowCount).toBe(1);
   await expect(command(f,'pause')).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  }finally{finish();await running;}
 });
 it('cancels a pending restart when stopped and rejects cross-workspace controls',async()=>{
  const f=await prepare(),other=await fixture();await command(f,'restart');
  const retry=await command(f,'stop');expect(retry.restart?.status).toBe('canceled');expect(await advanceEvaluationRestarts(f)).toBe(0);
  await expect(getEvaluationControls(other,f.evaluationId)).rejects.toMatchObject({code:'SCOPE_DENIED'});
  await expect(controlEvaluation(other,f.evaluationId,{action:'stop',subjectId:f.job.jobId,subjectKind:'generation',locale:'en'},randomUUID())).rejects.toMatchObject({code:'SCOPE_DENIED'});
 });
 it('does not start new work after the requesting writer loses access',async()=>{
  const f=await prepare();await command(f,'restart');await owner.query("DELETE FROM evals.membership WHERE org_id=$1",[f.orgId]);
  const scheduler={orgId:f.orgId,actorId:f.actorId};
  await advanceEvaluationRestarts(scheduler);
  expect((await owner.query("SELECT status FROM evals.evaluation_restart WHERE org_id=$1",[f.orgId])).rows[0].status).toBe('failed');
  expect((await owner.query("SELECT 1 FROM evals.generation_job WHERE org_id=$1",[f.orgId])).rowCount).toBe(1);
 });
});
