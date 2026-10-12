import { importedJudgeRunFixture } from "./judge-run-fixture";
import { recordDomainCreation, recordRunFinished } from "@/lib/analytics/domain-events";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { createPrefixedId } from "@/lib/operator/ids";
import { getEvalsPool, withTenant } from "@/lib/evals/repositories/db";
import { getPostgresPool } from "@/lib/db/client";
import { insertRun, getRun } from "@/lib/demo/store";
import { requestSignup } from "@/lib/evals/signup";
import { demoStarted, demoFinished } from "@/lib/demo/events";
import { createProject } from "@/lib/evals/repositories/evidence";
import { createEvaluation } from "@/lib/evals/repositories/managed";
import { getGrowth } from "@/lib/analytics/growth";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
const mail = vi.hoisted(() => vi.fn(async () => ({data:{id:"fake"},error:null})));
vi.mock("@/lib/resend/client", () => ({getResendClient: () => ({emails:{send:mail}})}));
vi.mock("@/lib/demo/import", () => ({importDemo: vi.fn(async () => ({evaluationId:null}))}));
vi.mock("@/lib/security/rate-limit", () => ({consumeRateLimit: vi.fn(async () => ({allowed:true}))}));
const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
describe.skipIf(!ownerUrl || !runtimeUrl)("analytics real-schema journey and operator growth", () => {
  const owner = new Pool({connectionString:ownerUrl,max:1});
  let operator: EvalIdentity, member: EvalIdentity, orgId: string;
  beforeAll(async () => {
    Object.assign(process.env,{EVALS_DATABASE_URL:runtimeUrl,DATABASE_URL:runtimeUrl,ANALYTICS_EVENTS_V2:"true",RESEND_FROM_EMAIL:"demo@example.test",SIGNUP_TERMS_REQUIRED:"true"});
    await owner.query("DELETE FROM public.product_analytics_event");
    const userId = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,\'Fixture operator\',$2,true)',[userId,`${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')",[userId]);
    operator={user:{id:userId,name:"Fixture",email:"fixture@example.test"},platformRole:"operator",workspaces:[]};
  });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); await getPostgresPool().end(); });
  it("carries first-touch demo → signup → evaluation and deduplicates replay", async () => {
    const runId=await insertRun({tokenHash:"a".repeat(64),locale:"en",spec:{kind:"openai_compatible",url:"https://example.test/v1/chat/completions",model:"fixture"},targetHost:"example.test",docsUrl:"https://example.test/docs",docsHost:"example.test",clientHash:"b".repeat(64),auth:false,attribution:{utm_source:"newsletter",partner:"agency-one"}});
    await owner.query("UPDATE demo.run SET phase='done',finished_at=now(),summary=$2::jsonb WHERE id=$1",[runId,JSON.stringify({scored:8,correct:5})]);
    const run=(await getRun(runId))!;
    demoStarted(run); demoFinished(run);
    await requestSignup({email:"analytics-journey@example.test",runId,host:"example.test",locale:"en"});
    const token=(mail.mock.calls[0] as unknown as [{text:string}])[0].text.match(/signup#([A-Za-z0-9_-]{43})/)![1];
    const {POST}=await import("@/app/api/evals/v1/signup/route");
    const response=await POST(new Request("http://localhost/api/evals/v1/signup",{method:"POST",headers:{host:"localhost",origin:"http://localhost","content-type":"application/json"},body:JSON.stringify({token,name:"Analytics fixture",password:"fixture-password-very-long",acceptTerms:true,locale:"en"})}));
    expect(response.status).toBe(200);
    const body=await response.json();orgId=body.data.orgId;
    const user=(await owner.query("SELECT created_by,acquisition_attribution FROM evals.workspace WHERE id=$1",[orgId])).rows[0];
    expect(user.acquisition_attribution).toEqual({utm_source:"newsletter",partner:"agency-one"});
    member={user:{id:user.created_by,email:"analytics-journey@example.test",name:"Fixture"},platformRole:null,workspaces:[{id:orgId,name:"Fixture",role:"owner"}]};
    const scope={orgId,actorId:member.user.id};
    const project=await createProject(scope,{title:"Fixture project",description:"Fixture"},"analytics-project");
    const input={projectId:project.id,title:"Fixture evaluation",evidencePolicy:"source_grounded" as const,commercialCap:"5",currency:"EUR"};
    const first=await createEvaluation(scope,input,"analytics-evaluation");
    expect((await createEvaluation(scope,input,"analytics-evaluation")).id).toBe(first.id);
    const rows=(await owner.query("SELECT event_name,metadata,attribution,run_id,user_id FROM public.product_analytics_event ORDER BY occurred_at")).rows;
    expect(rows.map(row=>row.event_name)).toEqual(expect.arrayContaining(["demo_started","demo_finished","demo_signup_requested","account_created","evaluation_created"]));
    expect(rows.filter(row=>row.event_name==="evaluation_created")).toHaveLength(1);
    expect(rows.every(row=>row.user_id===null)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/analytics-journey@|192\.168|fixture-password/);
    expect(rows.filter(row=>row.event_name.startsWith("demo_")).every(row=>/^[a-f0-9]{64}$/.test(row.run_id))).toBe(true);
  },30000);
  it("makes analytics read-only for operators and invisible to workspace members", async () => {
    const visible=await withTenant({orgId:"",actorId:operator.user.id},async db=>(await db.query("SELECT event_name FROM public.product_analytics_event")).rows);
    expect(visible.length).toBeGreaterThan(0);
    expect(await withTenant({orgId,actorId:member.user.id},async db=>(await db.query("SELECT event_name FROM public.product_analytics_event")).rows)).toEqual([]);
    await expect(getGrowth(member)).rejects.toThrow();
    await expect(getGrowth({...member,platformRole:"operator"})).rejects.toThrow();
    await expect(withTenant({orgId:"",actorId:operator.user.id},db=>db.query("DELETE FROM public.product_analytics_event"))).rejects.toThrow(/permission denied/);
    await expect(withTenant({orgId,actorId:operator.user.id},db=>db.query("SELECT evals.set_acquisition_attribution($1,'{}'::jsonb)",[orgId]))).rejects.toThrow(/SCOPE_DENIED/);
  });
  it("deduplicates concurrent server events and rolls back with the domain transaction", async () => {
    const event={eventName:"report_viewed" as const,source:"server" as const,orgId,eventKey:randomUUID(),payload:{first_view:true}};
    await Promise.all(Array.from({length:5},()=>recordProductEvent(event)));
    expect((await owner.query("SELECT count(*)::int n FROM public.product_analytics_event WHERE event_name='report_viewed'")).rows[0].n).toBe(1);
    await expect(withTenant({orgId,actorId:member.user.id},async db=>{await recordProductEvent({eventName:"api_token_created",source:"server",orgId,eventKey:"rollback"},db);throw new Error("rollback");})).rejects.toThrow("rollback");
    expect((await owner.query("SELECT count(*)::int n FROM public.product_analytics_event WHERE event_name='api_token_created'")).rows[0].n).toBe(0);
  });
  it("records actual run dimensions and waits for terminal reporting before finishing", async () => {
    const fixture=await importedJudgeRunFixture(owner,runtimeUrl!);
    let rows=(await owner.query("SELECT event_name,metadata FROM public.product_analytics_event WHERE org_id=$1",[fixture.orgId])).rows;
    expect(rows.find(row=>row.event_name==="run_started")?.metadata).toMatchObject({questions:2,models:1,estimate:null});
    await withTenant(fixture.scope,db=>recordRunFinished(db,fixture.orgId,fixture.run.id));
    expect((await owner.query("SELECT count(*)::int n FROM public.product_analytics_event WHERE org_id=$1 AND event_name='run_finished'",[fixture.orgId])).rows[0].n).toBe(0);
    await withTenant(fixture.scope,async db=>{
      await db.query("UPDATE evals.run SET phase='done',updated_at=now() WHERE org_id=$1 AND id=$2",[fixture.orgId,fixture.run.id]);
      await recordRunFinished(db,fixture.orgId,fixture.run.id);await recordRunFinished(db,fixture.orgId,fixture.run.id);
      const suite=(await db.query("SELECT suite_id,manifest FROM evals.suite_version WHERE org_id=$1 AND id=$2",[fixture.orgId,fixture.suiteVersionId])).rows[0];
      await recordDomainCreation(db,fixture.scope,`freeze/${suite.suite_id}`,{}, {id:fixture.suiteVersionId,manifest:suite.manifest});
    });
    rows=(await owner.query("SELECT event_name,metadata FROM public.product_analytics_event WHERE org_id=$1",[fixture.orgId])).rows;
    expect(rows.filter(row=>row.event_name==="run_finished")).toHaveLength(1);
    expect(rows.find(row=>row.event_name==="run_finished")?.metadata).toMatchObject({questions:2,models:1,credits_charged:null});
    expect(rows.find(row=>row.event_name==="test_set_ready")?.metadata).toMatchObject({question_count:2,duration_s:expect.any(Number)});
  });
  it("records a fully drained cancellation without waiting for a report", async () => {
    const fixture=await importedJudgeRunFixture(owner,runtimeUrl!);
    await withTenant(fixture.scope,async db=>{
      await db.query("UPDATE evals.run SET status='canceled',phase='target_execution',updated_at=now() WHERE org_id=$1 AND id=$2",[fixture.orgId,fixture.run.id]);
      await recordRunFinished(db,fixture.orgId,fixture.run.id);
    });
    const rows=(await owner.query("SELECT metadata FROM public.product_analytics_event WHERE org_id=$1 AND event_name='run_finished'",[fixture.orgId])).rows;
    expect(rows).toHaveLength(1);expect(rows[0].metadata).toMatchObject({outcome:"canceled",questions:2});
  });
  it("loads indexed eight-week cohorts under two seconds with 20,000 fixture views", async () => {
    await owner.query(`INSERT INTO public.product_analytics_event(id,event_name,event_category,source,metadata,occurred_at)
      SELECT 'pa_'||lpad(n::text,26,'0'),'page_view','product','client','{}'::jsonb,now()-(n%55)*interval '1 day' FROM generate_series(1,20000) n`);
    const start=performance.now();const data=await getGrowth(operator);const duration=performance.now()-start;
    expect(duration).toBeLessThan(2000);expect(data.weeks).toHaveLength(8);expect(data.cohorts).toHaveLength(8);
    expect(data.accounts.find(row=>row.orgId===orgId)).toMatchObject({source:"newsletter",stage:"report_viewed"});
    expect(data.sources.find(row=>row.source==="newsletter")).toMatchObject({demos:1,accounts:1,activated:1});
    console.log("growth_fixture_ms",Math.round(duration));
  });
});
