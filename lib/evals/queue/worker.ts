import { projectExecutionRun } from "./run-status";
import { lockRunQueue, startQueuedRun, deferRunStep } from "../repositories/run-capacity";
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { reserve, settle, BudgetExceeded } from '../budget/ledger';
import { decimal, priceUsage, units, worstCase } from '../budget/money';
import { connectionInvocationSecret, invocationSecret, webSearchSecrets } from '../security/secrets';
import type { Keyring } from '../security/envelope';
import { acquireCapacity, loadProvider, WEB_RESULTS_MAX_BYTES } from '../providers/registry';
import { runWebSearch, webResultsMessage } from '../providers/web-search';
import { invocationSchema, ProviderFailure, type Invocation, type ProviderOutput, type ProviderRevision, type WebResult } from '../providers/contracts';
import { invokeOpenAI } from '../providers/openai-compatible';
import { digest, event, projectWorkflow, type Tenant, type TenantTransaction } from './store';
import { jobSchema, type JobData } from './boss';
import { observationSchema } from '../contracts/results';
import { withContentHash } from '../contracts/hashing';

interface Step {id:string;workflow_id:string;input:unknown;input_hash:string;version:number;status:string;fence:string;lease_until:Date|null;step_kind:string}
async function lockStep(c:PoolClient,orgId:string,stepId:string) {
 const found=(await c.query('SELECT workflow_id FROM evals.workflow_step WHERE org_id=$1 AND id=$2',[orgId,stepId])).rows[0];
 if(!found)throw new Error('step_missing');
 const workflow=(await c.query('SELECT * FROM evals.execution_workflow WHERE org_id=$1 AND id=$2 FOR UPDATE',[orgId,found.workflow_id])).rows[0];
 const step=(await c.query('SELECT * FROM evals.workflow_step WHERE org_id=$1 AND id=$2 FOR UPDATE',[orgId,stepId])).rows[0] as Step;
 return {workflow,step};
}

export interface WorkerOptions {tx:TenantTransaction;keys:Keyring;actorId:string;workerId:string;dgxEndpoint?:string;invoke?:typeof invokeOpenAI;search?:typeof runWebSearch;leaseSeconds?:number}
/** Engine roles whose calls are safe to repeat: a retry costs tokens, never a duplicate action on a customer's system. */
const INTERNAL_ROLES=new Set(['generator','context_analyzer','judge','report_writer']);
const TRANSIENT=new Set(['overloaded','service_unavailable','network_unavailable','malformed_output']);
const internal=(input:unknown)=>{const parsed=invocationSchema.safeParse(input);return parsed.success&&INTERNAL_ROLES.has(parsed.data.role)&&!parsed.data.probe;};
/** Keep the results that fit the room left in the model's context, never more than WEB_RESULTS_MAX_BYTES. */
function fitWebResults(provider:ProviderRevision,input:Invocation,results:WebResult[]):WebResult[] {
 const prompt=Buffer.byteLength(JSON.stringify(input.messages),'utf8')+1024;
 const room=Math.min(WEB_RESULTS_MAX_BYTES,provider.context_limit-prompt-input.maxOutputTokens)-600;
 const kept:WebResult[]=[];let used=0;
 for(const item of results){const size=Buffer.byteLength(JSON.stringify(item),'utf8');if(used+size>room)break;kept.push(item);used+=size;}
 return kept;
}
export class InvocationWorker {
 private readonly lease:number;
 constructor(private readonly options:WorkerOptions) {this.lease=options.leaseSeconds??150;if(this.lease<5)throw new Error('lease_too_short');}
 async handle(raw:JobData):Promise<void> {
  const job=jobSchema.parse(raw), tenant={orgId:job.orgId,actorId:this.options.actorId};
  let claimed:Awaited<ReturnType<InvocationWorker['claim']>>;
  try{claimed=await this.claim(tenant,job);}catch(error){
   const reason=error instanceof BudgetExceeded?'budget_exceeded':error instanceof Error&&['provider_capacity_unavailable','provider_circuit_open'].includes(error.message)?error.message:'invocation_configuration_invalid';
   await this.options.tx(tenant,async c=>{const {step}=await lockStep(c,tenant.orgId,job.stepId);
    if(step.status!=='queued')return;
    if(reason==='provider_capacity_unavailable'||reason==='provider_circuit_open') {
      await c.query("INSERT INTO evals.outbox_event(org_id,step_id,queue,available_at) VALUES($1,$2,$3,now()+interval '30 seconds')",[tenant.orgId,step.id,step.step_kind]);
    }else {
     await c.query("UPDATE evals.workflow_step SET status='paused',reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id,reason]);
     const parsed=invocationSchema.safeParse(step.input);
     if(parsed.success&&parsed.data.generationJobId&&parsed.data.generationStep){
      await c.query("UPDATE evals.generation_batch SET status='paused',reason_code=$4,updated_at=now() WHERE org_id=$1 AND generation_job_id=$2 AND step_kind=$3 AND version=$5",[tenant.orgId,parsed.data.generationJobId,parsed.data.generationStep,reason,step.version]);
      await c.query("UPDATE evals.generation_job SET status='paused',reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,parsed.data.generationJobId,reason]);
     }
    }
    await event(c,tenant.orgId,step.workflow_id,'dispatch_deferred',reason);await projectWorkflow(c,tenant.orgId,step.workflow_id);
    const target=invocationSchema.safeParse(step.input);
    if(reason!=='provider_capacity_unavailable'&&reason!=='provider_circuit_open'&&target.success&&target.data.role==='target'&&target.data.caseUnitId){
     const workflow=(await c.query('SELECT run_id FROM evals.execution_workflow WHERE org_id=$1 AND id=$2',[tenant.orgId,step.workflow_id])).rows[0];
     await projectExecutionRun(c,tenant.orgId,workflow.run_id);
    }
   });return;
  }
  if(!claimed)return;
  const {step,attemptId,provider,input,price,amount}=claimed;
  const controller=new AbortController();let secret:Buffer|undefined;
  const timer=setInterval(()=>{
   void this.options.tx(tenant,async c=>{
    const renewed=await c.query("UPDATE evals.workflow_step SET lease_until=now()+$4::int*interval '1 second' WHERE org_id=$1 AND id=$2 AND fence=$3 AND status='running' AND lease_until>now() RETURNING id",[tenant.orgId,step.id,step.fence,this.lease]);
    if(!renewed.rowCount)controller.abort();
   }).catch(()=>controller.abort());
  },Math.max(1000,Math.floor(this.lease*1000/3)));
  timer.unref();
  try {
   // Only decrypt after a reservation exists. Never hold this transaction over I/O.
   if(input.secretVersionId)secret=await this.options.tx(tenant,c=>invocationSecret(c,tenant.orgId,attemptId,input.secretVersionId!,step.fence,this.options.keys));
   else if(provider.adapter!=='dgx')secret=await this.options.tx(tenant,c=>connectionInvocationSecret(c,tenant.orgId,attemptId,step.fence,this.options.keys));
   const dispatched=await this.options.tx(tenant,async c=>{
    const current=await lockStep(c,tenant.orgId,step.id);this.checkFence(current.step,step.fence);
    if(!['running','queued'].includes(current.workflow.status)) {
      await settle(c,tenant.orgId,attemptId,'0','confirmed_not_dispatched');
      await c.query("UPDATE evals.execution_attempt SET status='canceled',finished_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,attemptId]);
      await c.query('UPDATE evals.provider_slot SET released_at=now() WHERE attempt_id=$1',[attemptId]);
      await c.query("UPDATE evals.workflow_step SET status=$3,lease_until=NULL WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id,current.workflow.status==='cancel_requested'?'canceled':'paused']);
      await projectWorkflow(c,tenant.orgId,step.workflow_id);return false;
    }
    await c.query("UPDATE evals.execution_attempt SET status='dispatching',dispatched_at=now() WHERE org_id=$1 AND id=$2 AND status='reserved'",[tenant.orgId,attemptId]);
    await event(c,tenant.orgId,step.workflow_id,'attempt_dispatching');return true;
   });
   if(!dispatched)return;
   // Web research: run the call's queries on the connected search engine and
   // hand the results to the model, whatever the provider. Only without any
   // engine can an OpenRouter call use its own (paid) web plugin.
   let call=input,webSearch:ProviderOutput['webSearch'];
   if(input.webSearch?.queries?.length&&INTERNAL_ROLES.has(input.role)&&!input.probe) {
    const engines=await this.options.tx(tenant,c=>webSearchSecrets(c,this.options.keys));
    try {
     const found=await (this.options.search??runWebSearch)(engines.map(item=>({engine:item.engine,key:item.key.toString('utf8')})),input.webSearch.queries,input.webSearch.maxResults,controller.signal);
     const results=fitWebResults(provider,input,found.results);
     webSearch={engine:found.engine,queries:input.webSearch.queries.map(item=>item.site?`${item.query} (site:${item.site})`:item.query),results:results.map(({url,title,published})=>({url,title,...(published?{published}:{})})),...(found.failed?{failed:found.failed}:{})};
     // With an engine connected, the provider's own (paid) web search is never used, even when nothing was found.
     if(engines.length)call={...input,webSearch:undefined,messages:results.length?[...input.messages,{role:'user',content:webResultsMessage(input.webSearch.queries,results)}]:input.messages};
    } finally {engines.forEach(item=>item.key.fill(0));}
   }
   const answered=await (this.options.invoke??invokeOpenAI)(provider,call,secret,controller.signal,this.options.dgxEndpoint);
   const output:ProviderOutput=webSearch?{...answered,webSearch,citations:[...new Map([...(answered.citations??[]),...webSearch.results.map(({url,title})=>({url,title}))].map(item=>[item.url,item])).values()].slice(0,20)}:answered;
   const actual=output.usage?priceUsage(price,output.usage.input,output.usage.output,output.usage.cached):amount;
   const internalEstimate=decimal((units(input.internalCostPerSecond)*BigInt(Math.ceil(output.latencyMs)) + BigInt(999))/BigInt(1000));
   await this.options.tx(tenant,async c=>{
    const current=await lockStep(c,tenant.orgId,step.id);this.checkFence(current.step,step.fence);
    await c.query('INSERT INTO evals.execution_result(org_id,step_id,attempt_id,output,output_hash) VALUES($1,$2,$3,$4,$5)',[tenant.orgId,step.id,attemptId,output,digest(output)]);
    if(input.generationJobId&&input.generationStep){
     const next=output.complete?(input.generationStep==='profile'?'profile_ready':'draft_ready'):'paused';
     const reason=output.complete?null:output.finishReason==='length'?'generation_output_exhausted':'incomplete_response';
     await c.query("UPDATE evals.generation_batch SET status=$3,output=$4,reason_code=$5,updated_at=now() WHERE org_id=$1 AND generation_job_id=$2 AND step_kind=$6 AND version=$7",[tenant.orgId,input.generationJobId,output.complete?'completed':'paused',output,reason,input.generationStep,step.version]);
     await c.query("UPDATE evals.generation_job SET status=$3,reason_code=$4,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,input.generationJobId,next,reason]);
    }
    if(input.caseUnitId&&input.caseRevisionId&&input.targetRevisionId) {
     const started=new Date(Date.now()-output.latencyMs).toISOString(),finished=new Date().toISOString(),observationId=randomUUID();
     const unknown={value:null,provenance:'unavailable' as const};
     const observation=observationSchema.parse(withContentHash({schema_version:'1.0' as const,observation_id:observationId,run_id:current.workflow.run_id,case_revision_id:input.caseRevisionId,repetition:input.repetition??0,attempt_id:attemptId,target_revision_id:input.targetRevisionId,started_at:started,finished_at:finished,messages:[...input.messages,{role:'assistant' as const,content:output.text}],tool_events:[],artifacts:[],provider_request_id:output.requestId??null,status:output.complete?'succeeded' as const:'capture_incomplete' as const,error:output.complete?null:{category:'capture_incomplete' as const,code:'incomplete_response',retryable:false},metadata:{latency_ms:{value:output.latencyMs,provenance:'measured' as const},input_tokens:output.usage?{value:output.usage.input,provenance:'provider_reported' as const}:unknown,output_tokens:output.usage?{value:output.usage.output,provenance:'provider_reported' as const}:unknown,cost:{value:{amount:actual,currency:price.currency},provenance:output.usage?'provider_reported' as const:'estimated' as const},model_identity:{value:provider.model_id,provenance:'provider_reported' as const}},extensions:{}}));
     await c.query('INSERT INTO evals.observation(id,org_id,run_id,case_unit_id,attempt_id,content_hash,document,execution_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[observationId,tenant.orgId,current.workflow.run_id,input.caseUnitId,attemptId,observation.content_hash,observation,observation.status]);
     await c.query('UPDATE evals.case_unit SET status=$3,attempt_id=$4,reason_code=$5,updated_at=now() WHERE org_id=$1 AND id=$2',[tenant.orgId,input.caseUnitId,observation.status,attemptId,output.complete?null:'incomplete_response']);
    }
    await settle(c,tenant.orgId,attemptId,actual,output.usage?'reported_usage':'bounded_estimate',internalEstimate);
    await c.query("UPDATE evals.execution_attempt SET status='completed',finished_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,attemptId]);
    await c.query("UPDATE evals.workflow_step SET status=$3,reason_code=$4,lease_until=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id,output.complete?'completed':'failed',output.complete?null:'incomplete_response']);
    await c.query('UPDATE evals.provider_slot SET released_at=now() WHERE attempt_id=$1',[attemptId]);
    await this.health(c,provider.id,'healthy');await event(c,tenant.orgId,step.workflow_id,'step_completed');await projectWorkflow(c,tenant.orgId,step.workflow_id);
    if(input.caseUnitId)await projectExecutionRun(c,tenant.orgId,current.workflow.run_id);
   });
  }catch(error){await this.finishFailure(tenant,step,attemptId,provider.id,amount,error);}
  finally{clearInterval(timer);secret?.fill(0);}
 }
 private checkFence(step:Step,fence:string) {
  if(step.status!=='running'||step.fence!==fence||!step.lease_until||step.lease_until.getTime()<=Date.now())throw new Error('stale_fence');
 }
 private async claim(tenant:Tenant,job:JobData) {
  return this.options.tx(tenant,async c=>{
   await lockRunQueue(c,tenant.orgId);
   const {workflow,step}=await lockStep(c,tenant.orgId,job.stepId);
   if(step.input_hash!==job.inputHash || digest(step.input)!==step.input_hash)throw new Error('input_hash_mismatch');
   if(step.status!=='queued')return;
   if(!['running','queued'].includes(workflow.status)) {
    await c.query("UPDATE evals.workflow_step SET status=$3 WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id,workflow.status==='cancel_requested'||workflow.status==='canceled'?'canceled':'paused']);return;
   }
   const eligible=(await c.query('SELECT not_before<=now() AS ready FROM evals.workflow_step WHERE org_id=$1 AND id=$2',[tenant.orgId,step.id])).rows[0].ready;
   if(!eligible)return;
   const previous=(await c.query('SELECT status,ordinal FROM evals.execution_attempt WHERE org_id=$1 AND step_id=$2 ORDER BY ordinal DESC LIMIT 1',[tenant.orgId,step.id])).rows[0];
   // An unknown outcome needs review before a target is called again; an engine call may simply be repeated.
   if(previous && (previous.ordinal>=3 || previous.status==='dispatching' || previous.status==='unknown'&&!internal(step.input)))throw new Error('attempt_review_required');
   const input=invocationSchema.parse(step.input);
   if(input.role==='target'&&input.caseUnitId&&!await startQueuedRun(c,tenant.orgId,workflow.run_id)){await deferRunStep(c,tenant.orgId,step.id,step.step_kind);return;}
   const {provider,price,inputBound}=await loadProvider(c,input);
   if(input.generationJobId&&input.generationStep)await c.query("UPDATE evals.generation_batch SET status='running',attempt_count=LEAST(attempt_count+1,3),updated_at=now() WHERE org_id=$1 AND generation_job_id=$2 AND step_kind=$3 AND version=$4",[tenant.orgId,input.generationJobId,input.generationStep,step.version]);
   const amount=worstCase(price,inputBound,input.maxOutputTokens),attemptId=randomUUID();
   const updated=(await c.query("UPDATE evals.workflow_step SET status='running',fence=fence+1,lease_owner=$3,lease_until=now()+$4::int*interval '1 second',updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING *",[tenant.orgId,step.id,this.options.workerId,this.lease])).rows[0] as Step;
   await c.query(`INSERT INTO evals.execution_attempt(id,org_id,step_id,fence,ordinal,provider_revision_id,price_revision_id,status,token_bound)
    VALUES($1,$2,$3,$4,$5,$6,$7,'reserved',$8)`,[attemptId,tenant.orgId,step.id,updated.fence,(previous?.ordinal??0)+1,provider.id,price.id,inputBound+input.maxOutputTokens]);
   await acquireCapacity(c,provider,attemptId,inputBound+input.maxOutputTokens);
   await reserve(c,{orgId:tenant.orgId,attemptId,accountId:provider.account_id,workspaceBudgetId:input.workspaceBudgetId,runBudgetId:input.runBudgetId,runId:workflow.run_id,amount,currency:price.currency});
   await c.query("UPDATE evals.execution_workflow SET status='running',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,step.workflow_id]);
   await event(c,tenant.orgId,step.workflow_id,'attempt_reserved');return {step:updated,attemptId,provider,input,price,amount};
  });
 }
 private async health(c:PoolClient,providerId:string,state:string) {
  await c.query(`INSERT INTO evals.provider_health(provider_revision_id,state,last_probe_at,circuit_until) VALUES($1,$2,now(),CASE WHEN $2='healthy' THEN NULL ELSE now()+interval '60 seconds' END)
   ON CONFLICT(provider_revision_id) DO UPDATE SET state=excluded.state,last_probe_at=excluded.last_probe_at,circuit_until=excluded.circuit_until`,[providerId,state]);
 }
 private async finishFailure(tenant:Tenant,step:Step,attemptId:string,providerId:string,amount:string,error:unknown) {
  await this.options.tx(tenant,async c=>{
   const current=await lockStep(c,tenant.orgId,step.id);
   // A replacement/reconciler owns expired leases. Never permit a stale completion.
   if(current.step.fence!==step.fence||current.step.status!=='running'||!current.step.lease_until||current.step.lease_until.getTime()<=Date.now())return;
   const attempt=(await c.query('SELECT status,ordinal FROM evals.execution_attempt WHERE org_id=$1 AND id=$2',[tenant.orgId,attemptId])).rows[0];
   const dispatched=attempt.status==='dispatching', failure=error instanceof ProviderFailure?error:undefined;
   const unknown=dispatched&&failure?.outcome!=='rejected';
   const reason=failure?.code??'invocation_failed';
   const engine=internal(step.input);
   if(failure)console.warn(JSON.stringify({event:'provider_call_failed',reason,detail:failure.detail??null,attempt:attempt.ordinal,stepId:step.id}));
   if(unknown)await c.query("UPDATE evals.budget_reservation SET state='unresolved',provenance='unknown_external_outcome' WHERE org_id=$1 AND attempt_id=$2",[tenant.orgId,attemptId]);
   else await settle(c,tenant.orgId,attemptId,dispatched?amount:'0',dispatched?'bounded_estimate':'confirmed_not_dispatched');
   await c.query('UPDATE evals.execution_attempt SET status=$3,reason_code=$4,finished_at=now() WHERE org_id=$1 AND id=$2',[tenant.orgId,attemptId,unknown?'unknown':'failed',reason]);
   // An engine call that hit a busy, failing or unreachable provider is tried
   // again (three attempts in all, backing off) instead of stopping the job;
   // its possible charge stays recorded as unresolved. Unknown work on a
   // customer's system retains its capacity slot until explicit reconciliation.
   const retry=current.workflow.status==='running'&&attempt.ordinal<3&&(engine?TRANSIENT.has(failure?.code??''):!unknown&&failure?.code==='overloaded');
   if(!unknown||retry)await c.query('UPDATE evals.provider_slot SET released_at=now() WHERE attempt_id=$1',[attemptId]);
   const state=retry?'queued':unknown?'unknown':current.workflow.status==='cancel_requested'?'canceled':'paused';
   const delay=Math.max(failure?.retryAfterMs??0,engine&&failure?.code!=='overloaded'?15000*4**(attempt.ordinal-1):1000*2**attempt.ordinal+Math.floor(Math.random()*1000));
   await c.query("UPDATE evals.workflow_step SET status=$3,reason_code=$4,lease_until=NULL,not_before=now()+$5::int*interval '1 millisecond',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id,state,reason,delay]);
   const parsedInput=invocationSchema.parse(step.input);
   if(parsedInput.generationJobId&&parsedInput.generationStep&&!retry){
    await c.query("UPDATE evals.generation_batch SET status='paused',reason_code=$3,updated_at=now() WHERE org_id=$1 AND generation_job_id=$2 AND step_kind=$4 AND version=$5",[tenant.orgId,parsedInput.generationJobId,reason,parsedInput.generationStep,step.version]);
    await c.query("UPDATE evals.generation_job SET status='paused',reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,parsedInput.generationJobId,reason]);
   }
   if(parsedInput.caseUnitId&&!retry){await c.query('UPDATE evals.case_unit SET status=$3,attempt_id=$4,reason_code=$5,updated_at=now() WHERE org_id=$1 AND id=$2',[tenant.orgId,parsedInput.caseUnitId,unknown?'unknown_external_outcome':failure?.code==='network_unavailable'?'transport_error':failure?.code==='service_unavailable'?'target_error':current.workflow.status==='cancel_requested'?'canceled':'target_error',attemptId,reason]);await projectExecutionRun(c,tenant.orgId,current.workflow.run_id);}
   if(retry)await c.query("INSERT INTO evals.outbox_event(org_id,step_id,queue,available_at) VALUES($1,$2,$3,now()+$4::int*interval '1 millisecond')",[tenant.orgId,step.id,step.step_kind,delay]);
   // Out of credit is not a bad key: open the short circuit instead of blocking the provider until its key is replaced.
   if(failure)await this.health(c,providerId,failure.code==='quota_exceeded'?'overloaded':failure.code);
   await event(c,tenant.orgId,step.workflow_id,unknown?'attempt_unknown':'attempt_failed',reason);await projectWorkflow(c,tenant.orgId,step.workflow_id);
  });
 }
 async recover(tenant:Tenant):Promise<number> {
  // An unknown call to a commercial API keeps its unresolved liability until
  // reconciliation, but it cannot still occupy the provider 15 minutes after
  // our connection ended. Holding its slot for ever deadlocks the route once
  // concurrency_limit calls have timed out. DGX residency stays with the
  // runbook reconciliation.
  await this.options.tx(tenant,c=>c.query(`UPDATE evals.provider_slot slot SET released_at=now() FROM evals.execution_attempt a JOIN evals.provider_revision p ON p.id=a.provider_revision_id
   WHERE slot.attempt_id=a.id AND slot.released_at IS NULL AND a.org_id=$1 AND a.status='unknown' AND a.finished_at<now()-interval '15 minutes' AND p.adapter<>'dgx'`,[tenant.orgId]));
  const stale=await this.options.tx(tenant,async c=>(await c.query("SELECT id FROM evals.workflow_step WHERE org_id=$1 AND status='running' AND lease_until<=now() ORDER BY lease_until LIMIT 100",[tenant.orgId])).rows);
  for(const row of stale)await this.options.tx(tenant,async c=>{
   const {workflow,step}=await lockStep(c,tenant.orgId,row.id);
   if(step.status!=='running'||!step.lease_until||step.lease_until.getTime()>Date.now())return;
   const attempts=(await c.query("SELECT * FROM evals.execution_attempt WHERE org_id=$1 AND step_id=$2 AND status IN ('reserved','dispatching') ORDER BY ordinal DESC",[tenant.orgId,step.id])).rows;
   // An engine call interrupted by a worker restart (a deploy) is simply asked
   // again: its possible charge stays unresolved, and the connection that held
   // the provider slot is gone with the old process.
   const engine=internal(step.input);
   let unknown=false;
   for(const attempt of attempts) {
    if(attempt.status==='dispatching') {
     unknown=true;await c.query("UPDATE evals.budget_reservation SET state='unresolved',provenance='worker_lease_expired' WHERE org_id=$1 AND attempt_id=$2",[tenant.orgId,attempt.id]);
     if(engine)await c.query('UPDATE evals.provider_slot SET released_at=now() WHERE attempt_id=$1 AND released_at IS NULL',[attempt.id]);
    } else {
     await settle(c,tenant.orgId,attempt.id,'0','confirmed_not_dispatched');await c.query('UPDATE evals.provider_slot SET released_at=now() WHERE attempt_id=$1',[attempt.id]);
    }
    await c.query("UPDATE evals.execution_attempt SET status=$3,reason_code='worker_lease_expired',finished_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,attempt.id,attempt.status==='dispatching'?'unknown':'canceled']);
   }
   const state=unknown&&!engine?'unknown':workflow.status==='cancel_requested'?'canceled':attempts.some(a=>a.ordinal>=3)?'paused':'queued';
   const recoveredInput=invocationSchema.safeParse(step.input);
   if(recoveredInput.success&&recoveredInput.data.generationJobId&&recoveredInput.data.generationStep&&state!=='queued'){
    await c.query("UPDATE evals.generation_batch SET status='paused',reason_code='worker_lease_expired',updated_at=now() WHERE org_id=$1 AND generation_job_id=$2 AND step_kind=$3 AND version=$4",[tenant.orgId,recoveredInput.data.generationJobId,recoveredInput.data.generationStep,step.version]);
    await c.query("UPDATE evals.generation_job SET status='paused',reason_code='worker_lease_expired',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,recoveredInput.data.generationJobId]);
   }
   await c.query("UPDATE evals.workflow_step SET status=$3,fence=fence+1,lease_until=NULL,reason_code='worker_lease_expired',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id,state]);
   if(state==='queued')await c.query('INSERT INTO evals.outbox_event(org_id,step_id,queue) VALUES($1,$2,$3)',[tenant.orgId,step.id,step.step_kind]);
   if(unknown&&!engine){const input=invocationSchema.parse(step.input);if(input.caseUnitId){await c.query("UPDATE evals.case_unit SET status='unknown_external_outcome',attempt_id=$3,reason_code='worker_lease_expired',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,input.caseUnitId,attempts[0]?.id??null]);await projectExecutionRun(c,tenant.orgId,workflow.run_id);}}
   await event(c,tenant.orgId,step.workflow_id,'lease_recovered',unknown?(engine?'engine_call_repeated':'unknown_external_outcome'):'not_dispatched');await projectWorkflow(c,tenant.orgId,step.workflow_id);
  });
  return stale.length;
 }
}
export type { ProviderOutput };
