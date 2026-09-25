import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { units } from '../budget/money';
import { settle } from '../budget/ledger';
import { addSecretVersion } from '../security/secrets';
import type { Keyring } from '../security/envelope';
import { digest,enqueueInvocation,event,type Tenant } from '../queue/store';
import { invocationSchema } from './contracts';
const money=z.string().refine(v=>{try{units(v);return true;}catch{return false;}},'invalid decimal');
export const providerConfigSchema=z.object({
 accountId:z.string().uuid(),adapter:z.enum(['dgx','openai_compatible']),endpoint:z.string().url(),modelId:z.string().min(1).max(200),
 roles:z.array(z.enum(['target','generator','context_analyzer','judge','adjudicator','report_writer','embedding'])).min(1),
 capabilities:z.object({text:z.boolean().default(false),boundedTokens:z.boolean().default(false),jsonObject:z.boolean().default(false),probeApproved:z.boolean().default(false)}).strict(),
 contextLimit:z.number().int().min(2048).max(2000000),outputLimit:z.number().int().min(1).max(32768),
 dataClasses:z.array(z.string()).min(1),regions:z.array(z.string()).min(1),licenseRestrictions:z.string().max(2000).optional(),
 concurrencyLimit:z.number().int().min(1).max(16).default(1),rpm:z.number().int().positive(),tpm:z.number().int().positive(),
 retiredAt:z.iso.datetime().optional(),
}).strict();
export const priceConfigSchema=z.object({providerRevisionId:z.string().uuid(),currency:z.string().regex(/^[A-Z]{3}$/),effectiveAt:z.iso.datetime(),inputPrice:money,outputPrice:money,cachePrice:money,toolPrice:money,uncertaintyBps:z.number().int().min(0).max(10000),source:z.string().min(1).max(1000),fxSource:z.string().optional(),fxDate:z.iso.date().optional()}).strict();
async function admin(c:PoolClient,tenant:Tenant) {
 const r=(await c.query('SELECT evals.is_admin() AS allowed,evals.actor_id() AS actor,evals.org_id() AS org')).rows[0];
 if(!r.allowed||r.actor!==tenant.actorId||r.org!==tenant.orgId)throw new Error('platform_admin_required');
}
async function audit(c:PoolClient,tenant:Tenant,action:string,id:string) {
 await c.query('INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,$3,$4)',[tenant.orgId,tenant.actorId,action,id]);
}
/** All methods require a scoped transaction, recent-auth platform-admin API guard,
 * and a separately privileged configuration DB role. None returns endpoints or secrets. */
export async function registerAccount(c:PoolClient,tenant:Tenant,raw:unknown) {
 await admin(c,tenant);const v=z.object({name:z.string().min(1).max(120),currency:z.string().regex(/^[A-Z]{3}$/),ceiling:money,enabled:z.boolean().default(false)}).strict().parse(raw);
 const id=(await c.query('INSERT INTO evals.provider_account(name,currency,ceiling,enabled) VALUES($1,$2,$3,$4) RETURNING id',[v.name,v.currency,v.ceiling,v.enabled])).rows[0].id;await audit(c,tenant,'provider.account.created',id);return {id};
}
export async function registerProvider(c:PoolClient,tenant:Tenant,raw:unknown,approvedDgxEndpoint?:string) {
 await admin(c,tenant);const v=providerConfigSchema.parse(raw),url=new URL(v.endpoint);
 if(url.username||url.password||url.search||url.hash)throw new Error('invalid_endpoint');
 if(v.adapter==='dgx' ? !approvedDgxEndpoint||url.href!==new URL(approvedDgxEndpoint).href||v.concurrencyLimit!==1 : url.protocol!=='https:')throw new Error('endpoint_not_approved');
 const id=(await c.query(`INSERT INTO evals.provider_revision(account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,license_restrictions,concurrency_limit,rpm,tpm,retired_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,[v.accountId,v.adapter,url.href,v.modelId,tenant.actorId,v.roles,v.capabilities,v.contextLimit,v.outputLimit,v.dataClasses,v.regions,v.licenseRestrictions??null,v.concurrencyLimit,v.rpm,v.tpm,v.retiredAt??null])).rows[0].id;
 await audit(c,tenant,'provider.revision.created',id);return {id};
}
export async function registerPrice(c:PoolClient,tenant:Tenant,raw:unknown) {
 await admin(c,tenant);const v=priceConfigSchema.parse(raw);
 const account=(await c.query('SELECT a.currency FROM evals.provider_account a JOIN evals.provider_revision p ON p.account_id=a.id WHERE p.id=$1',[v.providerRevisionId])).rows[0];
 if(!account||account.currency!==v.currency)throw new Error('currency_mismatch');
 const id=(await c.query(`INSERT INTO evals.price_revision(provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source,fx_source,fx_date)
 VALUES($1,$2,$3,'token',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[v.providerRevisionId,v.currency,v.effectiveAt,v.inputPrice,v.outputPrice,v.cachePrice,v.toolPrice,v.uncertaintyBps,v.source,v.fxSource??null,v.fxDate??null])).rows[0].id;
 await audit(c,tenant,'provider.price.created',id);return {id};
}
export async function writeSecret(c:PoolClient,tenant:Tenant,args:{recordId?:string;purpose:'provider'|'target';scopeId:string},value:Buffer,keyVersion:string,keys:Keyring) {
 await admin(c,tenant);const recordId=args.recordId??randomUUID();
 if(!args.recordId)await c.query('INSERT INTO evals.secret_record(id,org_id,purpose,scope_id,created_by) VALUES($1,$2,$3,$4,$5)',[recordId,tenant.orgId,args.purpose,args.scopeId,tenant.actorId]);
 const versionId=await addSecretVersion(c,{orgId:tenant.orgId,recordId,purpose:args.purpose,scopeId:args.scopeId},tenant.actorId,value,keyVersion,keys);
 if(args.purpose==='provider')await c.query("UPDATE evals.provider_health SET state='unprobed',circuit_until=NULL WHERE provider_revision_id=$1",[args.scopeId]);
 await audit(c,tenant,args.recordId?'secret.rotated':'secret.created',recordId);return {recordId,versionId};
}
export async function revokeSecret(c:PoolClient,tenant:Tenant,recordId:string) {
 await admin(c,tenant);const r=await c.query('UPDATE evals.secret_record SET revoked_at=coalesce(revoked_at,now()) WHERE org_id=$1 AND id=$2 RETURNING id',[tenant.orgId,recordId]);if(!r.rowCount)throw new Error('secret_missing');
 if((await c.query("SELECT to_regclass('evals.recovery_control_event') AS present")).rows[0].present)await c.query("INSERT INTO evals.recovery_control_event(org_id,action,subject_type,subject_id,actor_id,payload_hash) VALUES($1,'credential_revoked','secret',$2,$3,$4)",[tenant.orgId,recordId,tenant.actorId,digest({action:'credential_revoked',id:recordId})]);
 await audit(c,tenant,'secret.revoked',recordId);return {id:recordId};
}
export async function setBudget(c:PoolClient,tenant:Tenant,raw:unknown) {
 await admin(c,tenant);const v=z.object({kind:z.enum(['provider','workspace','run']),scopeId:z.string().uuid(),currency:z.string().regex(/^[A-Z]{3}$/),ceiling:money,enabled:z.boolean().optional()}).strict().parse(raw);
 if(v.kind==='provider') {
  const r=await c.query('UPDATE evals.provider_account SET ceiling=$2,enabled=coalesce($4,enabled) WHERE id=$1 AND currency=$3 AND settled+reserved<=$2::numeric RETURNING id',[v.scopeId,v.ceiling,v.currency,v.enabled??null]);if(!r.rowCount)throw new Error('budget_below_liability_or_currency_mismatch');await audit(c,tenant,'budget.provider.updated',v.scopeId);return {id:v.scopeId};
 }
 if(v.kind==='workspace'&&v.scopeId!==tenant.orgId)throw new Error('budget_scope_mismatch');
 const r=await c.query(`INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(org_id,kind,scope_id) DO UPDATE SET ceiling=excluded.ceiling WHERE execution_budget.currency=excluded.currency AND execution_budget.settled+execution_budget.reserved<=excluded.ceiling RETURNING id`,[tenant.orgId,v.kind,v.scopeId,v.currency,v.ceiling]);
 if(!r.rowCount)throw new Error('budget_below_liability_or_currency_mismatch');const id=r.rows[0].id;await audit(c,tenant,'budget.updated',id);return {id};
}
export async function enqueueProbe(c:PoolClient,tenant:Tenant,raw:unknown) {
 await admin(c,tenant);const input=invocationSchema.parse({...raw as object,probe:true});
 if(input.maxOutputTokens>128||Buffer.byteLength(JSON.stringify(input.messages))>256)throw new Error('probe_bound_exceeded');
 const run=(await c.query("SELECT scope_id FROM evals.execution_budget WHERE org_id=$1 AND id=$2 AND kind='run'",[tenant.orgId,input.runBudgetId])).rows[0];if(!run)throw new Error('run_budget_missing');
 const workflowId=randomUUID();const stepId=await enqueueInvocation(c,tenant,{workflowId,runId:run.scope_id,planHash:digest(input),kind:'execute_api',version:1,input});
 await audit(c,tenant,'provider.probe.queued',stepId);return {workflowId,stepId};
}
export async function reconcileUnknown(c:PoolClient,tenant:Tenant,raw:unknown) {
 await admin(c,tenant);const v=z.object({attemptId:z.string().uuid(),actual:money,evidenceId:z.string().uuid()}).strict().parse(raw);
 const evidence=await c.query("SELECT id FROM evals.artifact WHERE org_id=$1 AND id=$2 AND state='ready'",[tenant.orgId,v.evidenceId]);if(!evidence.rowCount)throw new Error('reconciliation_evidence_missing');
 const row=(await c.query(`SELECT a.*,s.workflow_id FROM evals.execution_attempt a JOIN evals.workflow_step s ON (s.org_id,s.id)=(a.org_id,a.step_id) WHERE a.org_id=$1 AND a.id=$2`,[tenant.orgId,v.attemptId])).rows[0];if(!row||row.status!=='unknown')throw new Error('unknown_attempt_missing');
 await c.query('SELECT id FROM evals.execution_workflow WHERE org_id=$1 AND id=$2 FOR UPDATE',[tenant.orgId,row.workflow_id]);
 await c.query('SELECT id FROM evals.workflow_step WHERE org_id=$1 AND id=$2 FOR UPDATE',[tenant.orgId,row.step_id]);
 await settle(c,tenant.orgId,v.attemptId,v.actual,'reported_usage');await c.query('UPDATE evals.provider_slot SET released_at=now() WHERE attempt_id=$1',[v.attemptId]);
 await event(c,tenant.orgId,row.workflow_id,'liability_reconciled',v.evidenceId);await audit(c,tenant,'attempt.reconciled',v.attemptId);return {id:v.attemptId};
}


export async function setGenerationProviderRoute(c:PoolClient,tenant:Tenant,raw:unknown) {
 await admin(c,tenant);
 const value=z.object({role:z.enum(['context_analyzer','generator','judge','report_writer']),providerRevisionId:z.string().uuid(),priceRevisionId:z.string().uuid(),dataClass:z.string().min(1).max(100),region:z.string().min(1).max(100),internalCostPerSecond:money}).strict().parse(raw);
 const provider=(await c.query('SELECT adapter,roles,capabilities,data_classes,regions,retired_at FROM evals.provider_revision WHERE id=$1',[value.providerRevisionId])).rows[0];
 if(!provider||provider.adapter!=='dgx'||provider.retired_at||!provider.roles.includes(value.role)||!provider.capabilities.text||!provider.capabilities.boundedTokens||!provider.capabilities.jsonObject||!provider.data_classes.includes(value.dataClass)||!provider.regions.includes(value.region))throw new Error('generation_provider_not_approved');
 const price=(await c.query('SELECT id FROM evals.price_revision WHERE id=$1 AND provider_revision_id=$2 AND effective_at<=now()',[value.priceRevisionId,value.providerRevisionId])).rows[0];
 if(!price)throw new Error('generation_price_revision_unavailable');
 await c.query(`INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(org_id,role) DO UPDATE SET provider_revision_id=excluded.provider_revision_id,price_revision_id=excluded.price_revision_id,data_class=excluded.data_class,region=excluded.region,internal_cost_per_second=excluded.internal_cost_per_second,updated_by=excluded.updated_by,updated_at=now()`,[tenant.orgId,value.role,value.providerRevisionId,value.priceRevisionId,value.dataClass,value.region,value.internalCostPerSecond,tenant.actorId]);
 await audit(c,tenant,'generation.provider_route.updated',value.providerRevisionId);
 return {role:value.role,providerRevisionId:value.providerRevisionId};
}
