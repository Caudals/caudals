import { afterAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool,withTenant } from "../../lib/evals/repositories/db";
import { claimDueSchedules,createSchedule,dispatchScheduleSlot,updateSchedule } from "../../lib/evals/monitoring/schedules";
import { canonicalJson,sha256,withContentHash } from "../../lib/evals/contracts/hashing";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { caseSchema } from "../../lib/evals/contracts/cases";
import { authenticateCustomerToken,createCustomerToken,revokeCustomerToken } from "../../lib/evals/monitoring/tokens";
import { queueWebhookEvent,tickWebhookDeliveries } from "../../lib/evals/monitoring/webhooks";
import { encryptSecret } from "../../lib/evals/security/envelope";
import { settleScheduledRun } from "../../lib/evals/monitoring/alerts";
import { createPrefixedId } from "../../lib/operator/ids";

const runtimeUrl=process.env.EVALS_TEST_DATABASE_URL,ownerUrl=process.env.EVALS_TEST_OWNER_URL;
(runtimeUrl&&ownerUrl?describe:describe.skip)("WP-13 monitoring database path",()=>{
  const owner=new Pool({connectionString:ownerUrl,max:1});
  afterAll(async()=>{await owner.end();await getEvalsPool().end();});
  it("claims only the latest missed slot once and records budget and freshness skips",async()=>{
    process.env.EVALS_DATABASE_URL=runtimeUrl!;
    const orgId=randomUUID(),otherOrgId=randomUUID(),projectId=randomUUID(),targetId=randomUUID(),targetRevisionId=randomUUID(),
      evaluationId=randomUUID(),suiteId=randomUUID(),suiteVersionId=randomUUID(),
      rubricId=randomUUID(),caseId=randomUUID(),revisionId=randomUUID();
    const actorId=createPrefixedId("au");
    const config={kind:"https_json",schema_version:"1.0",endpoint:"https://example.test/api"};
    const source=syntheticAccountingFixture(),item=caseSchema.parse(withContentHash({...source.cases[0],case_id:caseId,
      revision_id:revisionId,reference:{...source.cases[0].reference,rubric_revision_id:rubricId}}));
    const manifest=withContentHash({schema_version:"1.0",suite_id:suiteId,suite_version_id:suiteVersionId,
      execution_mode:"deployed_system",case_revisions:[{case_id:caseId,revision_id:revisionId,
        content_hash:item.content_hash,family_id:item.family_id,split:item.split,weight:item.weight}],
      source_revisions:[],rubric_revisions:[],output_schema_revisions:[],fixture_revisions:[],files:[]});
    const c=await owner.connect();try{
      await c.query("BEGIN");await c.query("INSERT INTO public.auth_user(id,name,email,\"emailVerified\") VALUES($1,'Fixture',$2,true)",[actorId,`${randomUUID()}@example.test`]);
      await c.query("SELECT set_config('evals.actor_id',$1,true)",[actorId]);
      await c.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Monitor fixture',$3),($2,'Other fixture',$3)",[orgId,otherOrgId,actorId]);
      await c.query("UPDATE evals.workspace_entitlement SET can_schedule=true,monthly_spend_limit=500 WHERE org_id=$1",[orgId]);
      await c.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Project')",[projectId,orgId]);
      await c.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'System')",[targetId,orgId,projectId]);
      await c.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",
        [targetRevisionId,orgId,targetId,sha256(canonicalJson(config)),config]);
      await c.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",
        [rubricId,orgId,projectId,source.rubric.content_hash,source.rubric]);
      await c.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)',[caseId,orgId,projectId]);
      await c.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [revisionId,orgId,caseId,item.family_id,item.split,item.content_hash,item,rubricId]);
      await c.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Frozen')",[suiteId,orgId,projectId]);
      await c.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)",
        [suiteVersionId,orgId,suiteId,manifest.content_hash,manifest]);
      await c.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,0)",
        [orgId,suiteVersionId,revisionId]);
      await c.query(`INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,
        preparation_status,selected_suite_version_id) VALUES($1,$2,$3,'Monitor','source_grounded',200,'EUR','ready',$4)`,
        [evaluationId,orgId,projectId,suiteVersionId]);
      await c.query("COMMIT");
    }catch(error){await c.query("ROLLBACK");throw error;}finally{c.release();}
    const scope={orgId,actorId};
    const base={evaluationId,targetRevisionId,suiteVersionId,timezone:"UTC",cadence:"daily",localTime:"09:00",
      weekday:null,dayOfMonth:null,maxRunSpend:"200",currency:"EUR",sourceMaxAgeDays:null};
    const created=await createSchedule(scope,base,"monitor-fixture-key-1");
    expect(await withTenant({orgId:otherOrgId,actorId},async db=>(await db.query("SELECT id FROM evals.monitor_schedule")).rows)).toEqual([]);
    await owner.query("UPDATE evals.monitor_schedule SET next_due_at='2026-09-01T09:00:00Z' WHERE id=$1",[created.id]);
    const claimed=await claimDueSchedules(scope,"2026-09-20T12:00:00Z");
    expect(claimed).toHaveLength(1);
    expect(await claimDueSchedules(scope,"2026-09-20T12:00:00Z")).toEqual([]);
    const dispatch=await withTenant(scope,async db=>(await db.query("SELECT local_slot_key,missed_slots FROM evals.schedule_dispatch WHERE org_id=$1 AND id=$2",
      [orgId,claimed[0]])).rows[0]);
    expect(dispatch).toMatchObject({local_slot_key:"2026-09-20T09:00",missed_slots:19});
    await owner.query("UPDATE evals.workspace_entitlement SET monthly_spend_limit=100 WHERE org_id=$1",[orgId]);
    expect((await dispatchScheduleSlot(scope,claimed[0])).reason_code).toBe("monthly_budget_exhausted");
    await owner.query("UPDATE evals.workspace_entitlement SET monthly_spend_limit=500 WHERE org_id=$1",[orgId]);
    const fresh=await createSchedule(scope,{...base,sourceMaxAgeDays:1},"monitor-fixture-key-2");
    const unrelatedSource=randomUUID(),unrelatedArtifact=randomUUID(),unrelatedRevision=randomUUID();
    await owner.query(`INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state,created_by)
      VALUES($1,$2,$3,$4,$5,$6,1,'text/plain','ready',$7)`,[unrelatedArtifact,orgId,projectId,
      `fixture/${unrelatedArtifact}`,`fixture/${unrelatedArtifact}`,sha256("x"),actorId]);
    await owner.query("INSERT INTO evals.source(id,org_id,project_id,title,rights,created_by) VALUES($1,$2,$3,'Unrelated','customer_owned',$4)",
      [unrelatedSource,orgId,projectId,actorId]);
    await owner.query(`INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version,created_by)
      VALUES($1,$2,$3,$4,$5,$6,'fixture',$7)`,[unrelatedRevision,orgId,unrelatedSource,unrelatedArtifact,
      sha256("unrelated"),{},actorId]);
    await owner.query("UPDATE evals.monitor_schedule SET next_due_at='2026-09-19T09:00:00Z' WHERE id=$1",[fresh.id]);
    const second=await claimDueSchedules(scope,"2026-09-20T12:00:00Z");
    expect(second).toHaveLength(1);
    expect((await dispatchScheduleSlot(scope,second[0])).reason_code).toBe("sources_stale");
    const overlap=await createSchedule(scope,base,"monitor-fixture-key-3");
    await owner.query(`INSERT INTO evals.schedule_dispatch(org_id,schedule_id,scheduled_for,local_slot_key,
      schedule_version,target_revision_id,suite_version_id,max_run_spend,status)
      VALUES($1,$2,'2026-09-18T09:00:00Z','2026-09-18T09:00',$3,$4,$5,200,'starting')`,
      [orgId,overlap.id,overlap.version,targetRevisionId,suiteVersionId]);
    await owner.query("UPDATE evals.monitor_schedule SET next_due_at='2026-09-19T09:00:00Z' WHERE id=$1",[overlap.id]);
    const third=await claimDueSchedules(scope,"2026-09-20T12:00:00Z");
    expect(third).toHaveLength(1);
    expect((await dispatchScheduleSlot(scope,third[0])).reason_code).toBe("overlap_skipped");
    const restart=await createSchedule(scope,base,"monitor-fixture-key-5"),restartDispatch=randomUUID(),restartRun=randomUUID();
    await owner.query(`INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,
      execution_mode,status,phase,created_by) VALUES($1,$2,$3,$4,$5,'deployed_system','queued','preflight','evals-scheduler')`,
      [restartRun,orgId,evaluationId,targetRevisionId,suiteVersionId]);
    await owner.query(`INSERT INTO evals.schedule_dispatch(id,org_id,schedule_id,scheduled_for,local_slot_key,
      schedule_version,target_revision_id,suite_version_id,max_run_spend,status,updated_at)
      VALUES($1,$2,$3,'2026-09-20T09:00:00Z','2026-09-20T09:00',$4,$5,$6,200,'starting',now()-interval '2 minutes')`,
      [restartDispatch,orgId,restart.id,restart.version,targetRevisionId,suiteVersionId]);
    const replayInput={evaluationId,targetRevisionId,suiteVersionId};
    await owner.query(`INSERT INTO evals.evidence_request(org_id,created_by,route,request_key,request_hash,response)
      VALUES($1,'evals-scheduler','self-service-runs',$2,$3,$4)`,[orgId,`schedule-${restartDispatch}`,
      sha256(canonicalJson(replayInput)),{id:restartRun,status:"queued"}]);
    expect(await dispatchScheduleSlot(scope,restartDispatch)).toMatchObject({status:"started",run_id:restartRun});
    expect(await dispatchScheduleSlot(scope,restartDispatch)).toMatchObject({status:"started",run_id:restartRun});
    expect(await withTenant(scope,async db=>(await db.query("SELECT count(*)::int AS count FROM evals.schedule_dispatch WHERE org_id=$1 AND schedule_id=$2",
      [orgId,restart.id])).rows[0].count)).toBe(1);
    const pending=await createSchedule(scope,base,"monitor-fixture-key-4");
    const runId=randomUUID();
    await owner.query(`INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,
      execution_mode,status,phase,created_by) VALUES($1,$2,$3,$4,$5,'deployed_system','completed','grading',$6)`,
      [runId,orgId,evaluationId,targetRevisionId,suiteVersionId,actorId]);
    await owner.query("INSERT INTO evals.case_unit(org_id,run_id,case_revision_id,repetition,status) VALUES($1,$2,$3,0,'capture_incomplete')",
      [orgId,runId,revisionId]);
    const dispatchId=randomUUID();
    await owner.query(`INSERT INTO evals.schedule_dispatch(id,org_id,schedule_id,scheduled_for,local_slot_key,
      schedule_version,target_revision_id,suite_version_id,max_run_spend,status,run_id)
      VALUES($1,$2,$3,'2026-09-20T09:00:00Z','2026-09-20T09:00',$4,$5,$6,200,'started',$7)`,
      [dispatchId,orgId,pending.id,pending.version,targetRevisionId,suiteVersionId,runId]);
    expect((await settleScheduledRun(scope,dispatchId)).status).toBe("inconclusive");
    expect(await settleScheduledRun(scope,dispatchId)).toBeNull();
    expect(await withTenant(scope,async db=>(await db.query("SELECT count(*)::int AS count FROM evals.notification WHERE org_id=$1 AND event_id=$2",
      [orgId,`monitor:${dispatchId}:inconclusive`])).rows[0].count)).toBe(1);
    await owner.query("UPDATE evals.evaluation SET preparation_status='needs_input' WHERE id=$1",[evaluationId]);
    expect(await updateSchedule(scope,fresh.id,{expectedVersion:fresh.version,status:"paused"})).toMatchObject({status:"paused",reason_code:"manual_pause"});
    const token=await createCustomerToken(scope,{name:"CI monitor",scopes:["runs:read"],
      expiresAt:new Date(Date.now()+3600_000).toISOString()});
    expect(await authenticateCustomerToken(orgId,`Bearer ${token.token}`,"runs:read")).toMatchObject({tokenId:token.id});
    await expect(authenticateCustomerToken(orgId,`Bearer ${token.token}`,"reports:read")).rejects.toThrow();
    await revokeCustomerToken(scope,token.id);
    await expect(authenticateCustomerToken(orgId,`Bearer ${token.token}`,"runs:read")).rejects.toThrow();
    const endpointId=randomUUID(),versionId=randomUUID(),secret=Buffer.alloc(32,4),keys=new Map([["test",Buffer.alloc(32,2)]]);
    await withTenant(scope,async db=>{
      await db.query("INSERT INTO evals.webhook_endpoint(id,org_id,label,url,events) VALUES($1,$2,'CI','https://example.com/hook',ARRAY['regression'])",
        [endpointId,orgId]);
      await db.query("INSERT INTO evals.webhook_secret_version(id,org_id,endpoint_id,envelope) VALUES($1,$2,$3,$4)",
        [versionId,orgId,endpointId,encryptSecret(secret,{orgId,recordId:endpointId,versionId,purpose:"webhook",scopeId:endpointId},"test",keys)]);
      await db.query("UPDATE evals.webhook_endpoint SET current_secret_version_id=$3 WHERE org_id=$1 AND id=$2",[orgId,endpointId,versionId]);
      await queueWebhookEvent(db,orgId,"monitor:fixture:regression","regression",{status:"regression"});
      await queueWebhookEvent(db,orgId,"monitor:fixture:regression","regression",{status:"regression"});
    });
    const deliveries=await withTenant(scope,async db=>(await db.query("SELECT id,payload_hash FROM evals.webhook_delivery WHERE org_id=$1 AND endpoint_id=$2",
      [orgId,endpointId])).rows);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].payload_hash).toMatch(/^[a-f0-9]{64}$/);
    await owner.query(`UPDATE evals.webhook_delivery SET status='sending',attempt_count=5,
      lease_until=now()-interval '1 minute' WHERE id=$1`,[deliveries[0].id]);
    const runsBefore=await withTenant(scope,async db=>(await db.query("SELECT count(*)::int AS count FROM evals.run WHERE org_id=$1",[orgId])).rows[0].count);
    expect(await tickWebhookDeliveries(scope,keys)).toBe(0);
    const finalDelivery=await withTenant(scope,async db=>(await db.query("SELECT status,attempt_count FROM evals.webhook_delivery WHERE org_id=$1 AND id=$2",
      [orgId,deliveries[0].id])).rows[0]);
    expect(finalDelivery).toMatchObject({status:"failed",attempt_count:5});
    expect(await withTenant(scope,async db=>(await db.query("SELECT count(*)::int AS count FROM evals.run WHERE org_id=$1",[orgId])).rows[0].count)).toBe(runsBefore);
  });
});
