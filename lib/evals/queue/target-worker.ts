import { projectExecutionRun } from "./run-status";
import { lockRunQueue, startQueuedRun, deferRunStep } from "../repositories/run-capacity";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CandidateInput } from "../contracts/projections";
import type { InvocationContext,TargetConfig } from "../contracts/connectors";
import type { Observation } from "../contracts/results";
import type { Keyring } from "../security/envelope";
import { targetInvocationSecret } from "../security/secrets";
import { targetConfigSchema } from "../contracts/connectors";
import { HttpTargetAdapter } from "../connectors/http-target";
import { runScenario,ScenarioFailure } from "../execution/scenario-runner";
import { jobSchema,type JobData } from "./boss";
import { digest,event,projectWorkflow,targetExecutionSchema,type Tenant,type TenantTransaction } from "./store";
import { dispatchTargetCall,markTargetCallUnknown,recordFailedBrowserCalls,recordTargetCall,recoverDispatchedTargetCalls,
  markTargetDispatched,markTargetFailure,recordTargetObservation,
  releaseTargetClaim,reserveTargetInvocation,targetCapacity } from "./target-ledger";

type Step={id:string;workflow_id:string;step_kind:string;input:unknown;input_hash:string;status:string;fence:string;lease_until:Date|null;not_before:Date};
type Execute=(config:TargetConfig,input:CandidateInput,context:InvocationContext,credential:(versionId:string,attemptId:string)=>Promise<Buffer>)=>Promise<Observation>;
type Options={tx:TenantTransaction;keys:Keyring;actorId:string;workerId:string;leaseSeconds?:number;execute?:Execute;onAttemptFinished?:(attemptId:string)=>Promise<void>};

async function locked(c:PoolClient,orgId:string,stepId:string){
 const step=(await c.query("SELECT * FROM evals.workflow_step WHERE org_id=$1 AND id=$2 FOR UPDATE",[orgId,stepId])).rows[0] as Step|undefined;
 if(!step)throw new Error("step_missing");
 const workflow=(await c.query("SELECT * FROM evals.execution_workflow WHERE org_id=$1 AND id=$2 FOR UPDATE",[orgId,step.workflow_id])).rows[0];
 return {step,workflow};
}

/**
 * Real websites are slow, flaky and change under load. A failed browser
 * attempt is repeated in a fresh browser (three attempts in all, backing off)
 * before the test is marked as not captured; nothing is charged for it.
 */
const WEBSITE_RETRYABLE=new Set(["capture_incomplete","website_selector_failed","target_transport_failed","browser_session_unavailable","target_execution_aborted"]);
const WEBSITE_RETRY_DELAYS_MS=[5_000,20_000];

/**
 * One test that still fails after its retries is recorded and the run goes on.
 * The run pauses for repair only when the connection itself looks broken: the
 * saved login expired, the last three finished tests all failed, or nothing at
 * all has been captured after two tests.
 */
async function websiteFailureSystematic(c:PoolClient,orgId:string,runId:string,code:string){
 if(code==="browser_session_unavailable")return true;
 const recent=(await c.query("SELECT status FROM evals.case_unit WHERE org_id=$1 AND run_id=$2 AND status NOT IN ('pending','queued','running','unsupported','canceled') ORDER BY updated_at DESC,id LIMIT 3",[orgId,runId])).rows.map(row=>row.status as string);
 const totals=(await c.query("SELECT count(*) FILTER (WHERE status='succeeded')::int AS ok,count(*) FILTER (WHERE status IN ('capture_incomplete','transport_error','target_error','timeout'))::int AS bad FROM evals.case_unit WHERE org_id=$1 AND run_id=$2",[orgId,runId])).rows[0];
 return (recent.length>=3&&recent.every(status=>status!=="succeeded"))||(totals.ok===0&&totals.bad>=2);
}

function failureReason(error:unknown){
 const value=error instanceof Error?error.message:"target_execution_failed";
 if(value==="target_execution_aborted")return {unit:"capture_incomplete",code:value};
 if(value==="browser_session_unavailable"||value==="login_required")return {unit:"unsupported",code:"browser_session_unavailable"};
 if(value==="website_selector_failed")return {unit:"capture_incomplete",code:value};
 if(value==="invalid_credentials")return {unit:"target_error",code:value};
 if(value==="response_shape_invalid"||value.startsWith("target_http_"))return {unit:"target_error",code:value};
 if(value==="destination_denied"||value==="destination_invalid")return {unit:"transport_error",code:value};
 if(value==="connection_unsupported"||value==="provider_native_unavailable")return {unit:"unsupported",code:value};
 if(value==="capture_incomplete"||error instanceof ScenarioFailure)return {unit:"capture_incomplete",code:value};
 return {unit:"transport_error",code:"target_transport_failed"};
}

export class TargetExecutionWorker{
 private readonly lease:number;
 constructor(private readonly options:Options){this.lease=options.leaseSeconds??150;if(this.lease<5)throw new Error("lease_too_short");}
 async canHandle(raw:JobData){
  const job=jobSchema.parse(raw),tenant={orgId:job.orgId,actorId:this.options.actorId};
  return this.options.tx(tenant,async c=>{const row=(await c.query("SELECT input FROM evals.workflow_step WHERE org_id=$1 AND id=$2",[tenant.orgId,job.stepId])).rows[0];return !!row&&targetExecutionSchema.safeParse(row.input).success;});
 }
 async handle(raw:JobData){
  const job=jobSchema.parse(raw),tenant={orgId:job.orgId,actorId:this.options.actorId};
  const claimed=await this.options.tx(tenant,async c=>{
   await lockRunQueue(c,tenant.orgId);
   const {step,workflow}=await locked(c,tenant.orgId,job.stepId);
   if(step.input_hash!==job.inputHash||digest(step.input)!==step.input_hash)throw new Error("input_hash_mismatch");
   if(step.status!=="queued")return;
   if(!(await c.query("SELECT not_before<=now() AS ready FROM evals.workflow_step WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id])).rows[0].ready)return;
   if(!["queued","running"].includes(workflow.status)){await c.query("UPDATE evals.workflow_step SET status=$3 WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id,workflow.status.startsWith("cancel")?"canceled":"paused"]);return;}
   const input=targetExecutionSchema.parse(step.input);
   if(!await startQueuedRun(c,tenant.orgId,input.runId)){await deferRunStep(c,tenant.orgId,step.id,step.step_kind);return;}
   const previous=(await c.query("SELECT ordinal FROM evals.target_attempt WHERE org_id=$1 AND step_id=$2 ORDER BY ordinal DESC LIMIT 1",[tenant.orgId,step.id])).rows[0];
   if(previous?.ordinal>=3)throw new Error("attempt_review_required");
   const target=(await c.query("SELECT document FROM evals.target_revision WHERE org_id=$1 AND id=$2",[tenant.orgId,input.targetRevisionId])).rows[0];
   if(!target)throw new Error("target_revision_missing");
   const config=targetConfigSchema.parse(target.document);
   const capacity=await targetCapacity(c,tenant.orgId,input.targetRevisionId,config);
   if(capacity.kind==="wait"){
    await c.query("UPDATE evals.workflow_step SET not_before=$3,reason_code='target_capacity_wait',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id,capacity.until]);
    await c.query("INSERT INTO evals.outbox_event(org_id,step_id,queue,available_at) VALUES($1,$2,$3,$4)",[tenant.orgId,step.id,step.step_kind,capacity.until]);
    await event(c,tenant.orgId,step.workflow_id,"target_capacity_wait");
    return;
   }
   if(capacity.kind==="review"){
    await c.query("UPDATE evals.workflow_step SET status='paused',reason_code='target_unknown_attempt_review',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,step.id]);
    await c.query("UPDATE evals.case_unit SET status='pending',reason_code='target_unknown_attempt_review',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,input.caseUnitId]);
    await c.query("UPDATE evals.execution_workflow SET status='paused',reason_code='target_unknown_attempt_review',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,step.workflow_id]);
    await event(c,tenant.orgId,step.workflow_id,"target_capacity_review","unknown_external_outcome");
    await projectExecutionRun(c,tenant.orgId,input.runId);
    return;
   }
   const updated=(await c.query("UPDATE evals.workflow_step SET status='running',fence=fence+1,lease_owner=$3,lease_until=now()+$4::int*interval '1 second',updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING *",[tenant.orgId,step.id,this.options.workerId,this.lease])).rows[0] as Step;
   const attemptId=randomUUID();
   await c.query("INSERT INTO evals.target_attempt(id,org_id,step_id,case_unit_id,fence,ordinal,target_revision_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,'claimed')",[attemptId,tenant.orgId,step.id,input.caseUnitId,updated.fence,(previous?.ordinal??0)+1,input.targetRevisionId]);
   await reserveTargetInvocation(c,{orgId:tenant.orgId,runId:input.runId,attemptId,targetRevisionId:input.targetRevisionId},config,input.candidateInput);
   await c.query("UPDATE evals.case_unit SET status='running',attempt_id=$3,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,input.caseUnitId,attemptId]);
   await c.query("UPDATE evals.execution_workflow SET status='running',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,workflow.id]);
   await event(c,tenant.orgId,workflow.id,"target_claimed");
   return {step:updated,workflow,input,attemptId,config,ordinal:(previous?.ordinal??0)+1 as number};
  });
  if(!claimed)return;
  const controller=new AbortController(),timer=setInterval(()=>{void this.options.tx(tenant,async c=>{const renewed=await c.query("UPDATE evals.workflow_step SET lease_until=now()+$4::int*interval '1 second' WHERE org_id=$1 AND id=$2 AND fence=$3 AND status='running' AND lease_until>now() RETURNING id",[tenant.orgId,claimed.step.id,claimed.step.fence,this.lease]);if(!renewed.rowCount)controller.abort();}).catch(()=>controller.abort());},Math.max(1000,Math.floor(this.lease*1000/3)));
  timer.unref();
  try{
   const dispatch=await this.options.tx(tenant,async c=>{
    const current=await locked(c,tenant.orgId,claimed.step.id);
    const usage={orgId:tenant.orgId,runId:claimed.input.runId,attemptId:claimed.attemptId,targetRevisionId:claimed.input.targetRevisionId};
    if(!["queued","running"].includes(current.workflow.status)){
     await releaseTargetClaim(c,usage,"workflow_not_dispatchable");
     await c.query("UPDATE evals.target_attempt SET status='canceled',reason_code='workflow_not_dispatchable',finished_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.attemptId]);
     await c.query("UPDATE evals.workflow_step SET status=$3,lease_until=NULL WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.step.id,current.workflow.status.startsWith("cancel")?"canceled":"paused"]);
     await c.query("UPDATE evals.case_unit SET status=$3,reason_code='workflow_not_dispatchable',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.input.caseUnitId,current.workflow.status.startsWith("cancel")?"canceled":"pending"]);
     await projectWorkflow(c,tenant.orgId,claimed.step.workflow_id);
     await projectExecutionRun(c,tenant.orgId,claimed.input.runId);
     return false;
    }
    await markTargetDispatched(c,usage);
    const updated=await c.query("UPDATE evals.target_attempt SET status='dispatching',dispatched_at=now() WHERE org_id=$1 AND id=$2 AND status='claimed'",[tenant.orgId,claimed.attemptId]);
    if(updated.rowCount!==1)throw new Error("target_attempt_not_claimed");
    await event(c,tenant.orgId,claimed.step.workflow_id,"target_dispatching");
    return true;
   });
   if(!dispatch)return;
   const credential=(versionId:string,attemptId:string)=>this.options.tx(tenant,c=>targetInvocationSecret(c,tenant.orgId,attemptId,versionId,claimed.step.fence,this.options.keys));
   const context:InvocationContext={run_id:claimed.input.runId,target_revision_id:claimed.input.targetRevisionId,execution_plan_id:claimed.workflow.id,tenant_scope_handle:tenant.orgId,deadline:new Date(Date.now()+claimed.input.timeoutMs).toISOString(),attempt_id:claimed.attemptId,scoped_credential_handle:"credential" in claimed.config&&claimed.config.credential.kind!=="none"?claimed.config.credential.secret_version_id:null,destination_policy_id:claimed.input.destinationPolicyId,reserved_cost:{amount:"0",currency:"EUR"},signal:controller.signal};
   const execute=this.options.execute??(async(config,input,ctx,resolve)=>new HttpTargetAdapter(config,{credential:resolve}).invoke(input,ctx));
   const callScope={orgId:tenant.orgId,runId:claimed.input.runId,attemptId:claimed.attemptId,targetRevisionId:claimed.input.targetRevisionId};
   let callOrdinal=0;
   const executeMetered=async(input:CandidateInput)=>{
    const ordinal=++callOrdinal;
    await this.options.tx(tenant,c=>dispatchTargetCall(c,callScope,ordinal,input,claimed.config.limits.max_output_tokens,claimed.config.requests_per_minute));
    try{
     const result=await execute(claimed.config,input,context,credential);
     await this.options.tx(tenant,c=>recordTargetCall(c,callScope,ordinal,result));
     return result;
    }catch(error){
     await this.options.tx(tenant,c=>claimed.config.kind==="website"
      ?recordFailedBrowserCalls(c,callScope,failureReason(error).code,ordinal)
      :markTargetCallUnknown(c,callScope,ordinal,"target_transport_uncertain"));
     throw error;
    }
   };
   const scenario=claimed.input.scenario;
   const observation=scenario&&(scenario.mode==="conversation"||scenario.mode==="tool_workflow")
    ?await runScenario({scenario,candidateInput:claimed.input.candidateInput,fixture:claimed.input.toolFixture,invoke:executeMetered,limits:{maxTurns:Math.min(scenario.termination.kind==="turn_limit"?scenario.termination.max_turns:claimed.config.limits.max_turns,claimed.config.limits.max_turns),maxToolCalls:claimed.config.limits.max_tool_calls,maxOutputTokens:claimed.config.limits.max_output_tokens,deadlineMs:new Date(context.deadline).getTime()},repetition:claimed.input.repetition})
    :await executeMetered(claimed.input.candidateInput);
   await this.options.tx(tenant,async c=>{const current=await locked(c,tenant.orgId,claimed.step.id);if(current.step.status!=="running"||current.step.fence!==claimed.step.fence||!current.step.lease_until||current.step.lease_until.getTime()<=Date.now())return;await c.query("INSERT INTO evals.observation(id,org_id,run_id,case_unit_id,attempt_id,content_hash,document,execution_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[observation.observation_id,tenant.orgId,claimed.input.runId,claimed.input.caseUnitId,claimed.attemptId,observation.content_hash,observation,observation.status]);await recordTargetObservation(c,{orgId:tenant.orgId,runId:claimed.input.runId,attemptId:claimed.attemptId,targetRevisionId:claimed.input.targetRevisionId},observation);await c.query("UPDATE evals.target_attempt SET status='completed',finished_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.attemptId]);await c.query("UPDATE evals.case_unit SET status=$3,reason_code=$4,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.input.caseUnitId,observation.status,observation.error?.code??null]);await c.query("UPDATE evals.workflow_step SET status='completed',lease_until=NULL,reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.step.id,observation.error?.code??null]);await event(c,tenant.orgId,claimed.step.workflow_id,observation.status==="succeeded"?"target_completed":"target_observation_incomplete",observation.error?.code);await projectExecutionRun(c,tenant.orgId,claimed.input.runId);await projectWorkflow(c,tenant.orgId,claimed.step.workflow_id);});
  }catch(error){
   const failure=failureReason(error);
   const website=claimed.config.kind==="website";
   await this.options.tx(tenant,async c=>{
    const current=await locked(c,tenant.orgId,claimed.step.id);
    if(current.step.status!=="running"||current.step.fence!==claimed.step.fence)return;
    const scope={orgId:tenant.orgId,runId:claimed.input.runId,attemptId:claimed.attemptId,targetRevisionId:claimed.input.targetRevisionId};
    if(website)await recordFailedBrowserCalls(c,scope,failure.code);
    else await recoverDispatchedTargetCalls(c,scope,failure.code);
    await markTargetFailure(c,scope,failure.code);
    await c.query("UPDATE evals.target_attempt SET status='failed',reason_code=$3,finished_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.attemptId,failure.code]);
    if(website&&claimed.ordinal<3&&WEBSITE_RETRYABLE.has(failure.code)){
     if(["queued","running"].includes(current.workflow.status)){
      const delay=WEBSITE_RETRY_DELAYS_MS[claimed.ordinal-1]??20_000;
      await c.query("UPDATE evals.case_unit SET status='queued',reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.input.caseUnitId,failure.code]);
      await c.query("UPDATE evals.workflow_step SET status='queued',lease_until=NULL,reason_code=$3,not_before=now()+$4::int*interval '1 millisecond',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.step.id,failure.code,delay]);
      await c.query("INSERT INTO evals.outbox_event(org_id,step_id,queue,available_at) VALUES($1,$2,$3,now()+$4::int*interval '1 millisecond')",[tenant.orgId,claimed.step.id,claimed.step.step_kind,delay]);
      await event(c,tenant.orgId,claimed.step.workflow_id,"target_retry_scheduled",failure.code);
     }else{
      // Paused or canceled meanwhile: the test waits for a resume instead of failing.
      const canceled=current.workflow.status.startsWith("cancel");
      await c.query("UPDATE evals.case_unit SET status=$3,reason_code=$4,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.input.caseUnitId,canceled?"canceled":"pending",canceled?"run_canceled":failure.code]);
      await c.query("UPDATE evals.workflow_step SET status=$3,lease_until=NULL,reason_code=$4,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.step.id,canceled?"canceled":"paused",failure.code]);
     }
     await projectExecutionRun(c,tenant.orgId,claimed.input.runId);await projectWorkflow(c,tenant.orgId,claimed.step.workflow_id);
     return;
    }
    await c.query("UPDATE evals.case_unit SET status=$3,reason_code=$4,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.input.caseUnitId,failure.unit,failure.code]);
    await c.query("UPDATE evals.workflow_step SET status='failed',lease_until=NULL,reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.step.id,failure.code]);
    await event(c,tenant.orgId,claimed.step.workflow_id,"target_failed",failure.code);
    if(website&&["queued","running"].includes(current.workflow.status)&&await websiteFailureSystematic(c,tenant.orgId,claimed.input.runId,failure.code)){
     const repair=failure.code==="browser_session_unavailable"?failure.code:failure.code==="website_selector_failed"?failure.code:"capture_incomplete";
     await c.query("INSERT INTO evals.connection_check(org_id,target_revision_id,status,error_code,probe_evidence,completed_at) VALUES($1,$2,'needs_operator',$3,'{\"kind\":\"browser_execution_repair\"}',now())",[tenant.orgId,claimed.input.targetRevisionId,repair]);
     await c.query("UPDATE evals.workflow_step SET status='paused',reason_code=$3,updated_at=now() WHERE org_id=$1 AND workflow_id=$2 AND status='queued'",[tenant.orgId,claimed.step.workflow_id,repair]);
     await c.query("UPDATE evals.execution_workflow SET status='paused',reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,claimed.step.workflow_id,repair]);
     await event(c,tenant.orgId,claimed.step.workflow_id,"website_repair_required",repair);
     await projectExecutionRun(c,tenant.orgId,claimed.input.runId);
     await c.query("UPDATE evals.run SET reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND status IN ('paused','pause_requested')",[tenant.orgId,claimed.input.runId,repair]);
    }else await projectExecutionRun(c,tenant.orgId,claimed.input.runId);
    await projectWorkflow(c,tenant.orgId,claimed.step.workflow_id);
   });
  }finally{clearInterval(timer);await this.options.onAttemptFinished?.(claimed.attemptId);}
 }
 async recover(tenant:Tenant){
  return this.options.tx(tenant,async c=>{const rows=(await c.query(`SELECT s.id,s.workflow_id,s.step_kind,s.input,a.id AS attempt_id,a.status AS attempt_status,a.ordinal,tr.document->>'kind' AS target_kind,w.status AS workflow_status FROM evals.workflow_step s JOIN evals.target_attempt a ON (a.org_id,a.step_id)=(s.org_id,s.id) JOIN evals.target_revision tr ON (tr.org_id,tr.id)=(a.org_id,a.target_revision_id) JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id) WHERE s.org_id=$1 AND s.status='running' AND s.lease_until<=now() AND a.status IN ('claimed','dispatching') ORDER BY s.lease_until LIMIT 100 FOR UPDATE OF s,a SKIP LOCKED`,[tenant.orgId])).rows;for(const row of rows){const input=targetExecutionSchema.parse(row.input);const scope={orgId:tenant.orgId,runId:input.runId,attemptId:row.attempt_id,targetRevisionId:input.targetRevisionId};if(row.attempt_status==="claimed"){await releaseTargetClaim(c,scope,"worker_lease_expired_before_dispatch");await c.query("UPDATE evals.target_attempt SET status='canceled',reason_code='worker_lease_expired_before_dispatch',finished_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,row.attempt_id]);await c.query("UPDATE evals.workflow_step SET status='queued',fence=fence+1,lease_until=NULL,reason_code='worker_lease_expired_before_dispatch',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,row.id]);await c.query("UPDATE evals.case_unit SET status='queued',attempt_id=NULL,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,input.caseUnitId]);await c.query("INSERT INTO evals.outbox_event(org_id,step_id,queue) VALUES($1,$2,$3)",[tenant.orgId,row.id,row.step_kind]);await event(c,tenant.orgId,row.workflow_id,"target_lease_recovered","not_dispatched");}else if(row.target_kind==="website"){
    // The browser service restarted (a deploy) mid-test: the browser context
    // is gone and nothing was charged, so the test simply runs again.
    await recordFailedBrowserCalls(c,scope,"worker_lease_expired");await markTargetFailure(c,scope,"worker_lease_expired");
    await c.query("UPDATE evals.target_attempt SET status='failed',reason_code='worker_lease_expired',finished_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,row.attempt_id]);
    const again=Number(row.ordinal)<3&&["queued","running"].includes(row.workflow_status);
    await c.query("UPDATE evals.workflow_step SET status=$3,fence=fence+1,lease_until=NULL,reason_code='worker_lease_expired',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,row.id,again?"queued":["paused","pause_requested"].includes(row.workflow_status)&&Number(row.ordinal)<3?"paused":"failed"]);
    await c.query("UPDATE evals.case_unit SET status=$3,reason_code='worker_lease_expired',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,input.caseUnitId,again?"queued":["paused","pause_requested"].includes(row.workflow_status)&&Number(row.ordinal)<3?"pending":"capture_incomplete"]);
    if(again)await c.query("INSERT INTO evals.outbox_event(org_id,step_id,queue) VALUES($1,$2,$3)",[tenant.orgId,row.id,row.step_kind]);
    await event(c,tenant.orgId,row.workflow_id,"target_lease_recovered",again?"website_retry":"website_attempts_exhausted");
   }else{await recoverDispatchedTargetCalls(c,scope,"worker_lease_expired");await markTargetFailure(c,scope,"worker_lease_expired",true);await c.query("UPDATE evals.target_attempt SET status='unknown',reason_code='worker_lease_expired',finished_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,row.attempt_id]);await c.query("UPDATE evals.workflow_step SET status='unknown',fence=fence+1,lease_until=NULL,reason_code='unknown_external_outcome',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,row.id]);await c.query("UPDATE evals.case_unit SET status='unknown_external_outcome',reason_code='worker_lease_expired',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,input.caseUnitId]);await event(c,tenant.orgId,row.workflow_id,"target_attempt_unknown","worker_lease_expired");}await projectExecutionRun(c,tenant.orgId,input.runId);await projectWorkflow(c,tenant.orgId,row.workflow_id);}return rows.length;});
 }
}
