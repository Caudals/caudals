import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { withTenant } from '../../lib/evals/repositories/db';
import type { TenantTransaction } from '../../lib/evals/queue/store';
import { enqueueInvocation } from '../../lib/evals/queue/store';
import type { Invocation } from '../../lib/evals/providers/contracts';
export async function fixture() {
 const url=new URL(process.env.EVALS_TEST_DATABASE_URL!);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('disposable_local_database_required');
 const admin=new Pool({connectionString:url.href,max:2});const database=`evals_wp03_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE DATABASE ${database}`);url.pathname=`/${database}`;
 const pool=new Pool({connectionString:url.href,max:8});
 await pool.query('CREATE SCHEMA evals; CREATE TABLE evals.workspace(id uuid PRIMARY KEY)');
 await pool.query(readFileSync('db/migrations/033_evals_execution.sql','utf8'));
 await pool.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='evals_worker') THEN CREATE ROLE evals_worker NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$`);
 // Fixture equivalents of the two identity accessors; full 031 integration is parent-owned.
 await pool.query("CREATE FUNCTION evals.org_id() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('evals.org_id',true),'')::uuid $$; CREATE FUNCTION evals.actor_id() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('evals.actor_id',true),'') $$");
 await pool.query(readFileSync('infra/evals/worker-grants.sql','utf8'));
 const workerPool=new Pool({connectionString:url.href,max:6});
 workerPool.on('connect',client=>{void client.query('SET ROLE evals_worker').catch(()=>client.release(true));});
 const tx:TenantTransaction=(tenant,fn)=>withTenant(tenant,fn,workerPool);
 const orgId=randomUUID(),actorId='worker-fixture';await pool.query('INSERT INTO evals.workspace(id) VALUES($1)',[orgId]);
 const accountId=randomUUID(),providerId=randomUUID(),priceId=randomUUID();
 await pool.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'fixture','EUR',100,true)",[accountId]);
 await pool.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
 VALUES($1,$2,'openai_compatible','https://example.com/v1','fixture-model','fixture',ARRAY['target'], '{"text":true,"boundedTokens":true}',2048,128,ARRAY['test'],ARRAY['EU'],1000,1000000,16)`,[providerId,accountId]);
 await pool.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0.001,0.002,0.001,0,0,'fixture')",[priceId,providerId]);
 const tenant={orgId,actorId},workspaceBudgetId=randomUUID();
 await tx(tenant,c=>c.query("INSERT INTO evals.execution_budget(id,org_id,kind,scope_id,currency,ceiling) VALUES($1,$2,'workspace',$2,'EUR',100)",[workspaceBudgetId,orgId]));
 async function enqueue(overrides:Partial<Invocation>={}) {
  const runId=randomUUID(),workflowId=randomUUID(),runBudgetId=randomUUID();
  return tx(tenant,async c=>{
   await c.query("INSERT INTO evals.execution_budget(id,org_id,kind,scope_id,currency,ceiling) VALUES($1,$2,'run',$3,'EUR',100)",[runBudgetId,orgId,runId]);
   const input:Invocation={probe:false,probeKind:'text',outputFormat:'text',providerRevisionId:providerId,priceRevisionId:priceId,workspaceBudgetId,runBudgetId,role:'target',dataClass:'test',region:'EU',routing:'approved_providers',approvedProviderIds:[providerId],messages:[{role:'user',content:'hello'}],maxOutputTokens:128,timeoutMs:1000,internalCostPerSecond:'0',...overrides};
   const stepId=await enqueueInvocation(c,tenant,{workflowId,runId,planHash:'a'.repeat(64),kind:'execute_api',version:1,input});
   const step=(await c.query('SELECT * FROM evals.workflow_step WHERE id=$1',[stepId])).rows[0];
   return {job:{orgId,stepId,inputHash:step.input_hash},workflowId,runId,runBudgetId,input};
  });
 }
 async function rows(sql:string,params:unknown[]=[]){return tx(tenant,async c=>(await c.query(sql,params)).rows);}
 return {pool,tx,tenant,orgId,accountId,providerId,priceId,workspaceBudgetId,enqueue,rows,async close(){await workerPool.end();await pool.end();await admin.query(`DROP DATABASE ${database}`);await admin.end();}};
}
export type Fixture=Awaited<ReturnType<typeof fixture>>;
export async function seedAttempt(c:PoolClient,orgId:string,stepId:string,providerId:string,priceId:string,ordinal=1) {
 const id=randomUUID();await c.query("INSERT INTO evals.execution_attempt(id,org_id,step_id,fence,ordinal,provider_revision_id,price_revision_id,status,token_bound) VALUES($1,$2,$3,1,$4,$5,$6,'reserved',2048)",[id,orgId,stepId,ordinal,providerId,priceId]);return id;
}
