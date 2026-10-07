import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setEngineRoute, clearEvaluationRoute, getEvaluationEngineSettings } from "../../lib/evals/repositories/engine-settings";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { resolveModelRoute } from "../../lib/evals/repositories/model-routes";
import { importedJudgeRunFixture } from "./judge-run-fixture";
import { startAutomaticGeneration } from "../../lib/evals/repositories/automatic-generation";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { createPrefixedId } from "../../lib/operator/ids";
const ownerUrl=process.env.EVALS_TEST_OWNER_URL,runtimeUrl=process.env.EVALS_TEST_DATABASE_URL;
(ownerUrl && runtimeUrl ? describe : describe.skip)("per-evaluation model choices on PostgreSQL",()=>{
 const owner=new Pool({connectionString:ownerUrl,max:1});
 afterAll(async()=>{await owner.end();await getEvalsPool().end();});
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
    VALUES($1,$2,'dgx','https://example.test/v1',$3,$4,$5,'{}',32000,4096,ARRAY['customer_confidential'],ARRAY['private_wireguard'],1,10,100000)`,[id,account,model,actorId,['context_analyzer','generator','judge','report_writer']]);
   await owner.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0,0,0,0,0,'fixture')",[price,id]);
   providers.push({id,price,account});
  }
  const roles=['context_analyzer','generator','judge','report_writer'];
  for(const role of roles)await owner.query("INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,'customer_confidential','private_wireguard',0,$5)",[orgId,role,providers[0].id,providers[0].price,actorId]);
  for(const role of roles)await owner.query("INSERT INTO evals.evaluation_model_route(org_id,evaluation_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,$5,'customer_confidential','private_wireguard',0,$6)",[orgId,evaluationId,role,providers[1].id,providers[1].price,actorId]);
  return {orgId,actorId,projectId,evaluationId,otherEvaluationId,providers};
 }
 async function generation(f:Awaited<ReturnType<typeof fixture>>){
  const id=randomUUID();await owner.query(`INSERT INTO evals.generation_job(org_id,id,evaluation_id,workflow_id,title,execution_mode,source_revision_ids,prompt_revision,prompt_revision_id,requested_case_count,status,created_by)
   VALUES($1,$2,$3,$4,'Fixture','imported_responses',$5,'fixture',$6,5,'profiling',$7)`,[f.orgId,id,f.evaluationId,randomUUID(),[randomUUID()],randomUUID(),f.actorId]);return id;
 }
 it("applies the evaluation choice without changing siblings or workspace defaults",async()=>{
  const f=await fixture();
  await withTenant(f,async c=>{
   expect((await resolveModelRoute(c,f.orgId,'generator',f.evaluationId))?.model_id).toBe('chosen');
   expect((await resolveModelRoute(c,f.orgId,'generator',f.otherEvaluationId))?.model_id).toBe('default');
   expect((await resolveModelRoute(c,f.orgId,'generator'))?.source).toBe('workspace');
  });
  await owner.query("DELETE FROM evals.evaluation_model_route WHERE org_id=$1 AND evaluation_id=$2 AND role='generator'",[f.orgId,f.evaluationId]);
  await withTenant(f,async c=>expect((await resolveModelRoute(c,f.orgId,'generator',f.evaluationId))?.model_id).toBe('default'));
 });
 it("pins every job role and keeps it after reset or default changes",async()=>{
  const f=await fixture(),id=await generation(f);
  await owner.query("DELETE FROM evals.evaluation_model_route WHERE org_id=$1",[f.orgId]);
  await withTenant(f,async c=>{
   for(const role of ['context_analyzer','generator','judge','report_writer'] as const)expect((await resolveModelRoute(c,f.orgId,role,f.evaluationId,{kind:'generation',id}))?.model_id).toBe('chosen');
   expect((await resolveModelRoute(c,f.orgId,'generator',f.evaluationId))?.model_id).toBe('default');
  });
  await expect(owner.query("UPDATE evals.generation_job SET model_routes='{}' WHERE id=$1",[id])).rejects.toThrow(/immutable job model routes/);
  await owner.query("UPDATE evals.generation_job SET status='drafting' WHERE id=$1",[id]);
 });
 it("leaves pre-migration jobs on their legacy defaults when an evaluation choice is added",async()=>{
  const f=await fixture(),id=await generation(f);
  // Reproduce a row created before the snapshot column and trigger existed.
  await owner.query("BEGIN");
  try {
   await owner.query("ALTER TABLE evals.generation_job DISABLE TRIGGER frozen_models");
   await owner.query("UPDATE evals.generation_job SET model_routes=NULL WHERE id=$1",[id]);
   await owner.query("ALTER TABLE evals.generation_job ENABLE TRIGGER frozen_models");
   await owner.query("COMMIT");
  }catch(error){await owner.query("ROLLBACK");throw error;}
  await withTenant(f,async c=>{
   expect((await resolveModelRoute(c,f.orgId,'generator',f.evaluationId,{kind:'generation',id}))?.model_id).toBe('default');
   expect((await resolveModelRoute(c,f.orgId,'generator',f.evaluationId))?.model_id).toBe('chosen');
  });
 });
 it("queues the first generation call from the frozen evaluation choice",async()=>{
  const f=await fixture(),{source}=syntheticAccountingFixture(f.actorId),artifactId=randomUUID();
  await owner.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready',now()+interval '1 day')",[artifactId,f.orgId,f.projectId,source.artifact.path,'test/'+artifactId,source.artifact.sha256,source.artifact.size_bytes,source.artifact.media_type]);
  await owner.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,'caudals_owned')",[source.source_id,f.orgId,f.projectId,source.title]);
  await owner.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'utf8-text-v1')",[source.revision_id,f.orgId,source.source_id,artifactId,source.content_hash,source]);
  const anchor=source.anchors[0],[,start,end]=anchor.locator.split(':');
  await owner.query("INSERT INTO evals.source_chunk(id,org_id,source_revision_id,ordinal,excerpt,anchor) VALUES($1,$2,$3,0,$4,$5)",[anchor.id,f.orgId,source.revision_id,anchor.excerpt,{start:Number(start),end:Number(end)}]);
  await owner.query("INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,'workspace',$1,'EUR',10)",[f.orgId]);
  const input={sourceRevisionIds:[source.revision_id],title:'Scoped generation',executionMode:'imported_responses',promptRevision:'fixture',maxCases:5},key=randomUUID();
  const queued=await startAutomaticGeneration(f,f.evaluationId,input,key);
  expect(await startAutomaticGeneration(f,f.evaluationId,input,key)).toEqual(queued);
  const step=(await owner.query("SELECT input FROM evals.workflow_step WHERE id=$1",[queued.stepId])).rows[0];
  expect(step.input.providerRevisionId).toBe(f.providers[1].id);
  await owner.query("DELETE FROM evals.evaluation_model_route WHERE org_id=$1",[f.orgId]);
  await withTenant(f,async c=>expect((await resolveModelRoute(c,f.orgId,'context_analyzer',f.evaluationId,{kind:'generation',id:queued.jobId}))?.provider_revision_id).toBe(step.input.providerRevisionId));
 });
 it("isolates reads and denies configuration writes to the runtime role",async()=>{
  const f=await fixture(),foreign=await fixture();
  await withTenant(f,async c=>{
   expect((await resolveModelRoute(c,f.orgId,'generator',foreign.evaluationId))?.model_id).toBe('default');
   expect((await c.query("SELECT * FROM evals.evaluation_model_route WHERE org_id=$1",[foreign.orgId])).rows).toHaveLength(0);
  });
  await expect(withTenant(f,c=>c.query("DELETE FROM evals.evaluation_model_route WHERE org_id=$1",[f.orgId]))).rejects.toThrow(/permission denied/);
 });
 it("retains an explicit unavailable model instead of silently using the default",async()=>{
  const f=await fixture();await owner.query("UPDATE evals.provider_revision SET retired_at=now() WHERE id=$1",[f.providers[1].id]);
  await owner.query("UPDATE evals.provider_account SET enabled=false WHERE id=$1",[f.providers[1].account]);
  const id=await generation(f);
  await withTenant(f,async c=>{
   expect((await resolveModelRoute(c,f.orgId,'generator',f.evaluationId))?.model_id).toBe('chosen');
   expect((await resolveModelRoute(c,f.orgId,'generator',f.evaluationId,{kind:'generation',id}))?.model_id).toBe('chosen');
  });
 });
 it("uses the real audited setter and reset with admin authorization and free-plan limits",async()=>{
  const f=await fixture();
  const dir=mkdtempSync(join(tmpdir(),'evaluation-models-'));
  writeFileSync(join(dir,'admin.url'),process.env.EVALS_TEST_ADMIN_URL!,{mode:0o600});
  process.env.EVALS_ADMIN_DATABASE_URL_FILE=join(dir,'admin.url');
  await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')",[f.actorId]);
  const account=f.providers[0].account;
  await owner.query("INSERT INTO evals.provider_connection(account_id,adapter,endpoint,created_by) VALUES($1,'openai_compatible','https://example.test/v1',$2)",[account,f.actorId]);
  const identity:EvalIdentity={user:{id:f.actorId,name:'Fixture',email:'fixture@example.test'},platformRole:'platform_admin',workspaces:[{id:f.orgId,name:'Fixture',role:'owner'}]};
  const input={scope:'evaluation',evaluationId:f.evaluationId,role:'generator',connectionId:account,modelId:'api-fixture',allRoles:true};
  await expect(setEngineRoute({...identity,platformRole:null},f.orgId,input)).rejects.toMatchObject({code:'SCOPE_DENIED'});
  await setEngineRoute(identity,f.orgId,input);
  expect((await getEvaluationEngineSettings(identity,f.orgId,f.evaluationId)).evaluation.map(route=>route.model_id)).toEqual(['api-fixture','api-fixture','api-fixture','api-fixture']);
  expect((await owner.query("SELECT action FROM evals.audit_event WHERE org_id=$1 AND action='engine.route.evaluation'",[f.orgId])).rowCount).toBe(1);
  await clearEvaluationRoute(identity,f.orgId,f.evaluationId,'all');
  expect((await getEvaluationEngineSettings(identity,f.orgId,f.evaluationId)).evaluation).toHaveLength(0);
  await owner.query("UPDATE evals.workspace_entitlement SET plan='free' WHERE org_id=$1",[f.orgId]);
  await expect(setEngineRoute(identity,f.orgId,input)).rejects.toThrow(/Free workspaces/);
  expect((await owner.query("SELECT * FROM evals.evaluation_model_route WHERE org_id=$1",[f.orgId])).rowCount).toBe(0);
  await expect(clearEvaluationRoute(identity,f.orgId,randomUUID(),'all')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 });
 it("freezes run grading and writing roles before execution",async()=>{
  const f=await importedJudgeRunFixture(owner,runtimeUrl!);
  await owner.query("DELETE FROM evals.generation_provider_route WHERE org_id=$1",[f.orgId]);
  await withTenant(f.scope,async c=>{for(const role of ['judge','report_writer'] as const)expect((await resolveModelRoute(c,f.orgId,role,f.evaluationId,{kind:'run',id:f.run.id}))?.model_id).toBe('fixture-judge');});
  await expect(owner.query("UPDATE evals.run SET model_routes='{}' WHERE id=$1",[f.run.id])).rejects.toThrow(/immutable job model routes/);
 });
});
