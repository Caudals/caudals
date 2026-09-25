import { randomUUID } from "node:crypto";
import { afterAll,describe,expect,it } from "vitest";
import { Pool } from "pg";
import { withTenant } from "../../lib/evals/repositories/db";
import { enqueueTargetExecution } from "../../lib/evals/queue/store";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import { TargetExecutionWorker } from "../../lib/evals/queue/target-worker";
import { targetCapacity } from "../../lib/evals/queue/target-ledger";
import { controlRun } from "../../lib/evals/repositories/stage-c";
import { targetConfigSchema } from "../../lib/evals/contracts/connectors";
import { observationSchema } from "../../lib/evals/contracts/results";
import { withContentHash } from "../../lib/evals/contracts/hashing";

const ownerUrl=process.env.EVALS_TEST_DATABASE_URL,runtimeUrl=process.env.EVALS_DATABASE_URL;
const owner=ownerUrl?new Pool({connectionString:ownerUrl,max:2}):undefined,runtime=runtimeUrl?new Pool({connectionString:runtimeUrl,max:4}):undefined;
afterAll(async()=>{await runtime?.end();await owner?.end();});

describe.skipIf(!ownerUrl||!runtimeUrl)("Stage B target execution on PostgreSQL",()=>{
 it("executes one frozen API case, persists provenance and makes duplicate delivery harmless",async()=>{
  const actor=`au_${randomUUID().replaceAll("-","").slice(0,26).toUpperCase()}`,orgId=randomUUID(),projectId=randomUUID(),targetId=randomUUID(),targetRevisionId=randomUUID(),evaluationId=randomUUID(),suiteId=randomUUID(),suiteVersionId=randomUUID(),rubricId=randomUUID(),caseId=randomUUID(),caseRevisionId=randomUUID(),runId=randomUUID(),unitId=randomUUID(),workflowId=randomUUID();
  const setup=await owner!.connect();await setup.query("SELECT set_config('evals.actor_id',$1,false),set_config('evals.org_id',$2,false)",[actor,orgId]);
  await setup.query("INSERT INTO auth_user(id,name,email,\"emailVerified\",\"createdAt\",\"updatedAt\") VALUES($1,'Stage B fixture',$2,true,now(),now())",[actor,`${randomUUID()}@example.test`]);
  await setup.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Stage B fixture',$2)",[orgId,actor]);
  await setup.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')",[orgId,actor]);
  await setup.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Fixture')",[projectId,orgId]);
  await setup.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Fixture API')",[targetId,orgId,projectId]);
  const config={schema_version:"1.0",target_revision_id:targetRevisionId,limits:{max_turns:1,max_output_tokens:100,max_tool_calls:0,timeout_ms:1000,repetitions:1},requests_per_minute:1,concurrent_sessions:1,reset:"fresh_session",kind:"openai_compatible",endpoint:"https://example.test/v1/chat/completions",model:"fixture",credential:{kind:"none"}};
  await setup.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",[targetRevisionId,orgId,targetId,"a".repeat(64),config]);
  await setup.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Fixture','source_grounded',1,'EUR')",[evaluationId,orgId,projectId]);
  await setup.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,'{}')",[rubricId,orgId,projectId,"b".repeat(64)]);
  await setup.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)',[caseId,orgId,projectId]);
  await setup.query("INSERT INTO evals.case_revision(id,org_id,case_id,rubric_revision_id,family_id,split,content_hash,document) VALUES($1,$2,$3,$4,'family','validation',$5,'{}')",[caseRevisionId,orgId,caseId,rubricId,"c".repeat(64)]);
  await setup.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Suite')",[suiteId,orgId,projectId]);
  const manifest={suite_id:suiteId,suite_version_id:suiteVersionId,content_hash:"d".repeat(64),case_revisions:[{case_id:caseId,revision_id:caseRevisionId,content_hash:"c".repeat(64),family_id:"family",split:"validation"}],source_revisions:[],rubric_revisions:[{revision_id:rubricId,content_hash:"b".repeat(64)}],fixture_revisions:[],output_schema_revisions:[],files:[]};
  await setup.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)",[suiteVersionId,orgId,suiteId,manifest.content_hash,manifest]);
  await setup.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,0)",[orgId,suiteVersionId,caseRevisionId]);
  await setup.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode) VALUES($1,$2,$3,$4,$5,'deployed_system')",[runId,orgId,evaluationId,targetRevisionId,suiteVersionId]);
  await setup.query("INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status) VALUES($1,$2,$3,$4,0,'queued')",[unitId,orgId,runId,caseRevisionId]);setup.release();
  const tenant:{orgId:string;actorId:string}={orgId,actorId:actor},tx:TenantTransaction=(scope,fn)=>withTenant(scope,fn,runtime!);
  const candidateInput={schema_version:"1.0" as const,case_id:caseId,case_revision_id:caseRevisionId,messages:[{role:"user" as const,content:"Fixture question"}],attachments:[],tools:[]};
  const stepId=await tx(tenant,c=>enqueueTargetExecution(c,tenant,{workflowId,runId,planHash:"e".repeat(64),version:1,input:{kind:"target_execution",runId,caseUnitId:unitId,caseRevisionId,targetRevisionId,repetition:0,candidateInput,timeoutMs:1000,destinationPolicyId:"public-https-v1"}}));
  const inputHash=(await tx(tenant,async c=>(await c.query("SELECT input_hash FROM evals.workflow_step WHERE org_id=$1 AND id=$2",[orgId,stepId])).rows[0].input_hash));
  let calls=0;const worker=new TargetExecutionWorker({tx,keys:new Map(),actorId:actor,workerId:randomUUID(),execute:async(_config,input,context)=>{calls++;const now=new Date().toISOString();return observationSchema.parse(withContentHash({schema_version:"1.0",observation_id:randomUUID(),run_id:context.run_id,case_revision_id:caseRevisionId,repetition:0,attempt_id:context.attempt_id,target_revision_id:context.target_revision_id,started_at:now,finished_at:now,messages:[...input.messages,{role:"assistant",content:"Fixture answer"}],tool_events:[],artifacts:[],provider_request_id:"fixture-request",status:"succeeded",error:null,metadata:{latency_ms:{value:1,provenance:"measured"},input_tokens:{value:null,provenance:"unavailable"},output_tokens:{value:null,provenance:"unavailable"},cost:{value:null,provenance:"unavailable"},model_identity:{value:"fixture",provenance:"measured"}},extensions:{}}));}});
  const job={orgId,stepId,inputHash};expect(await worker.canHandle(job)).toBe(true);await worker.handle(job);await worker.handle(job);expect(calls).toBe(1);
  const result=await tx(tenant,async c=>({run:(await c.query("SELECT status,phase FROM evals.run WHERE id=$1",[runId])).rows[0],unit:(await c.query("SELECT status,attempt_id FROM evals.case_unit WHERE id=$1",[unitId])).rows[0],attempt:(await c.query("SELECT status FROM evals.target_attempt WHERE step_id=$1",[stepId])).rows[0],observations:Number((await c.query("SELECT count(*) FROM evals.observation WHERE case_unit_id=$1",[unitId])).rows[0].count),ledger:(await c.query("SELECT state,provenance,billing_scope,input_byte_bound,output_token_bound,dispatched_at FROM evals.target_invocation_ledger WHERE org_id=$1 AND run_id=$2",[orgId,runId])).rows,calls:(await c.query("SELECT turn_ordinal,state,input_byte_bound FROM evals.target_invocation_call WHERE org_id=$1 AND attempt_id=$2 ORDER BY turn_ordinal",[orgId,(await c.query("SELECT attempt_id FROM evals.case_unit WHERE id=$1",[unitId])).rows[0].attempt_id])).rows}));
  expect(result.run).toEqual({status:"completed",phase:"grading"});expect(result.unit.status).toBe("succeeded");expect(result.unit.attempt_id).toBeTruthy();expect(result.attempt.status).toBe("completed");expect(result.observations).toBe(1);
  expect(result.ledger).toHaveLength(1);
  expect(result.ledger[0]).toMatchObject({state:"recorded",provenance:"current",billing_scope:"customer_external_unknown",output_token_bound:100});
  expect(result.ledger[0].input_byte_bound).toBeGreaterThan(0);
  expect(result.ledger[0].dispatched_at).toBeTruthy();
  expect(result.calls).toMatchObject([{turn_ordinal:1,state:"recorded"}]);
  expect(result.calls[0].input_byte_bound).toBeGreaterThan(0);
  expect(await tx({orgId:randomUUID(),actorId:actor},async c=>(await c.query("SELECT id FROM evals.target_invocation_ledger WHERE attempt_id=$1",[result.unit.attempt_id])).rowCount)).toBe(0);
  expect(await tx({orgId:randomUUID(),actorId:actor},async c=>(await c.query("SELECT id FROM evals.target_invocation_call WHERE attempt_id=$1",[result.unit.attempt_id])).rowCount)).toBe(0);
  await expect(tx(tenant,async c=>{
   const unreservedId=randomUUID();
   await c.query("INSERT INTO evals.target_attempt(id,org_id,step_id,case_unit_id,fence,ordinal,target_revision_id,status) VALUES($1,$2,$3,$4,2,2,$5,'claimed')",[unreservedId,orgId,stepId,unitId,targetRevisionId]);
   await c.query("UPDATE evals.target_attempt SET status='dispatching',dispatched_at=now() WHERE id=$1",[unreservedId]);
  })).rejects.toThrow(/target dispatch requires current usage reservation/);
  const rate=await tx(tenant,c=>targetCapacity(c,orgId,targetRevisionId,targetConfigSchema.parse({...config,requests_per_minute:1})));
  expect(rate.kind).toBe("wait");
  const deferredRunId=randomUUID(),deferredUnitId=randomUUID(),deferredWorkflowId=randomUUID();
  await owner!.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode) VALUES($1,$2,$3,$4,$5,'deployed_system')",[deferredRunId,orgId,evaluationId,targetRevisionId,suiteVersionId]);
  await owner!.query("INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status) VALUES($1,$2,$3,$4,0,'queued')",[deferredUnitId,orgId,deferredRunId,caseRevisionId]);
  const deferredStepId=await tx(tenant,c=>enqueueTargetExecution(c,tenant,{workflowId:deferredWorkflowId,runId:deferredRunId,planHash:"e".repeat(64),version:1,input:{kind:"target_execution",runId:deferredRunId,caseUnitId:deferredUnitId,caseRevisionId,targetRevisionId,repetition:0,candidateInput,timeoutMs:1000,destinationPolicyId:"public-https-v1"}}));
  const deferredHash=await tx(tenant,async c=>(await c.query("SELECT input_hash FROM evals.workflow_step WHERE id=$1",[deferredStepId])).rows[0].input_hash);
  await worker.handle({orgId,stepId:deferredStepId,inputHash:deferredHash});
  const deferred=await tx(tenant,async c=>({step:(await c.query("SELECT status,not_before FROM evals.workflow_step WHERE id=$1",[deferredStepId])).rows[0],attempts:Number((await c.query("SELECT count(*) FROM evals.target_attempt WHERE step_id=$1",[deferredStepId])).rows[0].count),futureOutbox:Number((await c.query("SELECT count(*) FROM evals.outbox_event WHERE step_id=$1 AND available_at>now()",[deferredStepId])).rows[0].count)}));
  expect(deferred.step.status).toBe("queued");expect(deferred.step.not_before.getTime()).toBeGreaterThan(Date.now());
  expect(deferred.attempts).toBe(0);expect(deferred.futureOutbox).toBeGreaterThan(0);expect(calls).toBe(1);
  await controlRun(tenant,deferredRunId,"cancel");
  const canceled=await tx(tenant,async c=>({
   run:(await c.query("SELECT status,reason_code FROM evals.run WHERE id=$1",[deferredRunId])).rows[0],
   unit:(await c.query("SELECT status,reason_code FROM evals.case_unit WHERE id=$1",[deferredUnitId])).rows[0],
   workflow:(await c.query("SELECT status FROM evals.execution_workflow WHERE id=$1",[deferredWorkflowId])).rows[0],
   step:(await c.query("SELECT status FROM evals.workflow_step WHERE id=$1",[deferredStepId])).rows[0],
  }));
  expect(canceled).toMatchObject({run:{status:"canceled",reason_code:"run_canceled"},unit:{status:"canceled",reason_code:"run_canceled"},workflow:{status:"canceled"},step:{status:"canceled"}});
  await controlRun(tenant,deferredRunId,"cancel");
  expect((await tx(tenant,async c=>(await c.query("SELECT status FROM evals.run WHERE id=$1",[deferredRunId])).rows[0].status))).toBe("canceled");

  const multiTargetRevisionId=randomUUID(),multiRunId=randomUUID(),multiUnitId=randomUUID(),multiWorkflowId=randomUUID();
  await owner!.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",[multiTargetRevisionId,orgId,targetId,"f".repeat(64),{...config,target_revision_id:multiTargetRevisionId,limits:{...config.limits,max_turns:2,max_tool_calls:1},requests_per_minute:3}]);
  await owner!.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode) VALUES($1,$2,$3,$4,$5,'deployed_system')",[multiRunId,orgId,evaluationId,multiTargetRevisionId,suiteVersionId]);
  await owner!.query("INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status) VALUES($1,$2,$3,$4,0,'queued')",[multiUnitId,orgId,multiRunId,caseRevisionId]);
  const scenario={mode:"conversation" as const,required_capabilities:["multi_turn" as const],messages:candidateInput.messages,attachments:[],termination:{kind:"final_answer" as const},tool_fixture_set_id:null,turn_plan:{entry_node_id:"correction",nodes:[{id:"correction",message:{role:"user" as const,content:"Please correct the answer."},max_visits:1,branches:[{condition:{kind:"always" as const},next_node_id:null}]}]}};
  const multiStepId=await tx(tenant,c=>enqueueTargetExecution(c,tenant,{workflowId:multiWorkflowId,runId:multiRunId,planHash:"e".repeat(64),version:1,input:{kind:"target_execution",runId:multiRunId,caseUnitId:multiUnitId,caseRevisionId,targetRevisionId:multiTargetRevisionId,repetition:0,candidateInput,scenario,toolFixture:null,timeoutMs:1000,destinationPolicyId:"public-https-v1"}}));
  const multiHash=await tx(tenant,async c=>(await c.query("SELECT input_hash FROM evals.workflow_step WHERE id=$1",[multiStepId])).rows[0].input_hash);
  await worker.handle({orgId,stepId:multiStepId,inputHash:multiHash});
  const multi=await tx(tenant,async c=>({unit:(await c.query("SELECT status FROM evals.case_unit WHERE id=$1",[multiUnitId])).rows[0],calls:(await c.query(`SELECT call.turn_ordinal,call.state FROM evals.target_invocation_call call JOIN evals.target_invocation_ledger l ON (l.org_id,l.attempt_id)=(call.org_id,call.attempt_id) WHERE l.org_id=$1 AND l.run_id=$2 ORDER BY call.turn_ordinal`,[orgId,multiRunId])).rows,ledger:(await c.query("SELECT reported_input_tokens,reported_output_tokens,state FROM evals.target_invocation_ledger WHERE run_id=$1",[multiRunId])).rows[0]}));
  expect(multi.unit.status).toBe("succeeded");
  expect(multi.calls).toEqual([{turn_ordinal:1,state:"recorded"},{turn_ordinal:2,state:"recorded"}]);
  expect(multi.ledger).toEqual({reported_input_tokens:null,reported_output_tokens:null,state:"recorded"});
  expect(calls).toBe(3);

  const toolRunId=randomUUID(),toolUnitId=randomUUID(),toolWorkflowId=randomUUID();
  await owner!.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode) VALUES($1,$2,$3,$4,$5,'deployed_system')",[toolRunId,orgId,evaluationId,multiTargetRevisionId,suiteVersionId]);
  await owner!.query("INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status) VALUES($1,$2,$3,$4,0,'queued')",[toolUnitId,orgId,toolRunId,caseRevisionId]);
  const fixture={schema_version:"1.0" as const,fixture_set_id:"synthetic-tools",revision_id:"synthetic-tools-v1",content_hash:"0".repeat(64),seed:1,tools:[{name:"lookup",description:"Synthetic lookup",input_schema:{type:"object",required:["id"],properties:{id:{type:"string"}},additionalProperties:false},output_schema:{type:"object"}}],initial_state:{},transitions:[{tool_name:"lookup",when:{kind:"always" as const},result:{ok:true},next_state:{}}],final_state_predicates:[{kind:"always" as const}],reset:"restore_initial_state" as const,side_effects:"simulated_only" as const};
  const toolScenario={mode:"tool_workflow" as const,required_capabilities:["tool_calls" as const],messages:candidateInput.messages,attachments:[],termination:{kind:"final_answer" as const},tool_fixture_set_id:fixture.fixture_set_id,turn_plan:null};
  const toolStepId=await tx(tenant,c=>enqueueTargetExecution(c,tenant,{workflowId:toolWorkflowId,runId:toolRunId,planHash:"e".repeat(64),version:1,input:{kind:"target_execution",runId:toolRunId,caseUnitId:toolUnitId,caseRevisionId,targetRevisionId:multiTargetRevisionId,repetition:0,candidateInput,scenario:toolScenario,toolFixture:fixture,timeoutMs:1000,destinationPolicyId:"public-https-v1"}}));
  const toolHash=await tx(tenant,async c=>(await c.query("SELECT input_hash FROM evals.workflow_step WHERE id=$1",[toolStepId])).rows[0].input_hash);
  const toolWorker=new TargetExecutionWorker({tx,keys:new Map(),actorId:actor,workerId:randomUUID(),execute:async(_config,input,context)=>{const now=new Date().toISOString();return observationSchema.parse(withContentHash({schema_version:"1.0",observation_id:randomUUID(),run_id:context.run_id,case_revision_id:input.case_revision_id,repetition:0,attempt_id:context.attempt_id,target_revision_id:context.target_revision_id,started_at:now,finished_at:now,messages:[...input.messages,{role:"assistant",content:"",tool_calls:[{call_id:"bad-call",name:"lookup",arguments:{wrong:"shape"}}]}],tool_events:[{kind:"call",call_id:"bad-call",tool_name:"lookup",arguments:{wrong:"shape"},timestamp:now}],artifacts:[],provider_request_id:null,status:"succeeded",error:null,metadata:{latency_ms:{value:1,provenance:"measured"},input_tokens:{value:null,provenance:"unavailable"},output_tokens:{value:null,provenance:"unavailable"},cost:{value:null,provenance:"unavailable"},model_identity:{value:null,provenance:"unavailable"}},extensions:{}}));}});
  await toolWorker.handle({orgId,stepId:toolStepId,inputHash:toolHash});
  const malformed=await tx(tenant,async c=>({unit:(await c.query("SELECT status,reason_code FROM evals.case_unit WHERE id=$1",[toolUnitId])).rows[0],ledger:(await c.query("SELECT state FROM evals.target_invocation_ledger WHERE run_id=$1",[toolRunId])).rows[0],call:(await c.query("SELECT state FROM evals.target_invocation_call WHERE attempt_id=(SELECT attempt_id FROM evals.case_unit WHERE id=$1)",[toolUnitId])).rows[0]}));
  expect(malformed).toMatchObject({unit:{status:"capture_incomplete",reason_code:"tool_schema_invalid"},ledger:{state:"recorded"},call:{state:"recorded"}});

  const networkTargetRevisionId=randomUUID(),networkRunId=randomUUID(),networkUnitId=randomUUID(),networkWorkflowId=randomUUID();
  await owner!.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",[networkTargetRevisionId,orgId,targetId,"9".repeat(64),{...config,target_revision_id:networkTargetRevisionId}]);
  await owner!.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode) VALUES($1,$2,$3,$4,$5,'deployed_system')",[networkRunId,orgId,evaluationId,networkTargetRevisionId,suiteVersionId]);
  await owner!.query("INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status) VALUES($1,$2,$3,$4,0,'queued')",[networkUnitId,orgId,networkRunId,caseRevisionId]);
  const networkStepId=await tx(tenant,c=>enqueueTargetExecution(c,tenant,{workflowId:networkWorkflowId,runId:networkRunId,planHash:"e".repeat(64),version:1,input:{kind:"target_execution",runId:networkRunId,caseUnitId:networkUnitId,caseRevisionId,targetRevisionId:networkTargetRevisionId,repetition:0,candidateInput,timeoutMs:1000,destinationPolicyId:"public-https-v1"}}));
  const networkHash=await tx(tenant,async c=>(await c.query("SELECT input_hash FROM evals.workflow_step WHERE id=$1",[networkStepId])).rows[0].input_hash);
  const networkWorker=new TargetExecutionWorker({tx,keys:new Map(),actorId:actor,workerId:randomUUID(),execute:async()=>{throw new Error("synthetic_network_failure");}});
  await networkWorker.handle({orgId,stepId:networkStepId,inputHash:networkHash});
  const network=await tx(tenant,async c=>({unit:(await c.query("SELECT status,reason_code FROM evals.case_unit WHERE id=$1",[networkUnitId])).rows[0],ledger:(await c.query("SELECT state FROM evals.target_invocation_ledger WHERE run_id=$1",[networkRunId])).rows[0],call:(await c.query("SELECT state FROM evals.target_invocation_call WHERE attempt_id=(SELECT attempt_id FROM evals.case_unit WHERE id=$1)",[networkUnitId])).rows[0]}));
  expect(network).toMatchObject({unit:{status:"transport_error",reason_code:"target_transport_failed"},ledger:{state:"unknown"},call:{state:"unknown"}});
 },30000);
});
