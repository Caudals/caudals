import { afterAll, describe, expect, it } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { withTenant, getEvalsPool } from "../../lib/evals/repositories/db";
import { createPairing, completePairing, authenticateRunner, createRunnerJob, pollRunner,
  submitRunnerResult, revokeRunner } from "../../lib/evals/private-runner/store";
import { signPayload } from "../../lib/evals/private-runner/protocol";
import { canonicalJson, sha256, withContentHash } from "../../lib/evals/contracts/hashing";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { caseSchema } from "../../lib/evals/contracts/cases";
import { createPrefixedId } from "../../lib/operator/ids";

const runtimeUrl=process.env.EVALS_TEST_DATABASE_URL;
const ownerUrl=process.env.EVALS_TEST_OWNER_URL;
const suite=runtimeUrl&&ownerUrl?describe:describe.skip;
suite("WP-12 private runner database path",()=>{
  const owner=new Pool({connectionString:ownerUrl,max:1});
  afterAll(async()=>{await owner.end();await getEvalsPool().end();});
  it("pairs, claims, resumes an upload, rejects replay changes and revokes access",async()=>{
    process.env.EVALS_DATABASE_URL=runtimeUrl!;
    const platformKeys=generateKeyPairSync("ed25519"),runnerKeys=generateKeyPairSync("ed25519");
    const actorId=createPrefixedId("au");
    process.env.EVALS_RUNNER_SIGNING_KEY=platformKeys.privateKey.export({format:"pem",type:"pkcs8"}).toString();
    const runnerPrivate=runnerKeys.privateKey.export({format:"pem",type:"pkcs8"}).toString();
    const runnerPublic=runnerKeys.publicKey.export({format:"pem",type:"spki"}).toString();
    const orgId=randomUUID(),otherOrgId=randomUUID(),projectId=randomUUID(),targetId=randomUUID(),targetRevisionId=randomUUID(),
      evaluationId=randomUUID(),suiteId=randomUUID(),suiteVersionId=randomUUID(),runId=randomUUID(),rubricId=randomUUID(),caseId=randomUUID(),revisionId=randomUUID();
    const source=syntheticAccountingFixture(),item=caseSchema.parse(withContentHash({...source.cases[0],case_id:caseId,
      revision_id:revisionId,reference:{...source.cases[0].reference,rubric_revision_id:rubricId}}));
    const seed=await owner.connect();
    try{
      await seed.query("BEGIN");await seed.query("SELECT set_config('evals.actor_id',$1,true)",[actorId]);
      await seed.query(`INSERT INTO public.auth_user(id,name,email,"emailVerified")
        VALUES($1,'Runner fixture',$2,true)`,[actorId,`${randomUUID()}@example.test`]);
      await seed.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Runner test',$3),($2,'Other runner test',$3)",[orgId,otherOrgId,actorId]);
      await seed.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Private project')",[projectId,orgId]);
      await seed.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Private system')",[targetId,orgId,projectId]);
      const config={schema_version:"1.0",target_revision_id:targetRevisionId,limits:{max_turns:1,max_output_tokens:500,max_tool_calls:0,timeout_ms:60000,repetitions:1},
        requests_per_minute:6,concurrent_sessions:1,reset:"fresh_session",kind:"private_runner",runner_id:randomUUID(),connector_version:"caudals-evals-cli:0.1.0"};
      await seed.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",
        [targetRevisionId,orgId,targetId,sha256(canonicalJson(config)),config]);
      await seed.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",
        [rubricId,orgId,projectId,source.rubric.content_hash,source.rubric]);
      await seed.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)',[caseId,orgId,projectId]);
      await seed.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [revisionId,orgId,caseId,item.family_id,item.split,item.content_hash,item,rubricId]);
      await seed.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Frozen')",[suiteId,orgId,projectId]);
      const manifest=withContentHash({schema_version:"1.0",suite_id:suiteId,suite_version_id:suiteVersionId,
        execution_mode:"deployed_system",case_revisions:[{case_id:caseId,revision_id:revisionId,
          content_hash:item.content_hash,family_id:item.family_id,split:item.split,weight:item.weight}],
        source_revisions:[],rubric_revisions:[],output_schema_revisions:[],fixture_revisions:[],files:[]});
      await seed.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)",
        [suiteVersionId,orgId,suiteId,manifest.content_hash,manifest]);
      await seed.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,0)",
        [orgId,suiteVersionId,revisionId]);
      await seed.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,preparation_status,selected_suite_version_id) VALUES($1,$2,$3,'Private eval','source_grounded',500,'EUR','ready',$4)",
        [evaluationId,orgId,projectId,suiteVersionId]);
      await seed.query("COMMIT");
    }catch(error){await seed.query("ROLLBACK");throw error;}finally{seed.release();}
    const pairing=await createPairing({orgId,actorId},targetId);
    await expect(completePairing(otherOrgId,pairing.code,runnerPublic,"caudals-evals-cli:0.1.0")).rejects.toThrow();
    const identity=await completePairing(orgId,pairing.code,runnerPublic,"caudals-evals-cli:0.1.0");
    await expect(completePairing(orgId,pairing.code,runnerPublic,"caudals-evals-cli:0.1.0")).rejects.toThrow();
    await owner.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase) VALUES($1,$2,$3,$4,$5,'deployed_system','paused','target_execution')",
      [runId,orgId,evaluationId,identity.targetRevisionId,suiteVersionId]);
    const job=await withTenant({orgId,actorId},db=>createRunnerJob(db,{orgId,actorId},{
      runnerId:identity.runnerId,connectorVersion:"caudals-evals-cli:0.1.0",projectId,targetId,targetRevisionId:identity.targetRevisionId,runId,suiteVersionId,
      rows:[{case_revision_id:revisionId,document:item}]}));
    const claimed=await authenticateRunner(orgId,identity.token,(db,runner)=>pollRunner(db,orgId,String(runner.id)));
    expect(claimed.job?.payload.job_id).toBe(job.jobId);
    expect(JSON.stringify(claimed.job)).not.toMatch(/rubric|expected|reference/);
    const caseUnitId=claimed.job!.payload.cases[0].case_unit_id;
    const now=new Date().toISOString(),reported={job_id:job.jobId,case_unit_id:caseUnitId,result:{
      started_at:now,finished_at:now,messages:[...claimed.job!.payload.cases[0].input.messages,{role:"assistant",content:'{"total":"135.80","currency":"EUR"}'}],
      tool_events:[],status:"succeeded",error:null,provider_request_id:null,metadata:{latency_ms:{value:5,provenance:"customer_reported"},
        input_tokens:{value:null,provenance:"unavailable"},output_tokens:{value:null,provenance:"unavailable"},
        cost:{value:null,provenance:"unavailable"},model_identity:{value:null,provenance:"unavailable"}}}};
    const upload={...reported,signature:signPayload(reported,runnerPrivate)};
    const accepted=await authenticateRunner(orgId,identity.token,(db,runner)=>submitRunnerResult(db,runner,upload));
    expect(accepted).toMatchObject({accepted:true,duplicate:false,remaining:0});
    const duplicate=await authenticateRunner(orgId,identity.token,(db,runner)=>submitRunnerResult(db,runner,upload));
    expect(duplicate).toMatchObject({accepted:true,duplicate:true});
    const changed={...reported,result:{...reported.result,messages:[...reported.result.messages.slice(0,-1),{role:"assistant",content:"changed"}]}};
    await expect(authenticateRunner(orgId,identity.token,(db,runner)=>submitRunnerResult(db,runner,{...changed,signature:signPayload(changed,runnerPrivate)}))).rejects.toThrow();
    const stored=await withTenant({orgId,actorId},async db=>(await db.query("SELECT document FROM evals.observation WHERE org_id=$1 AND run_id=$2",[orgId,runId])).rows[0].document);
    expect(stored.extensions["caudals.evals/private_runner"].execution_identity).toBe("customer_runner_reported");
    await revokeRunner({orgId,actorId},identity.runnerId);
    await expect(authenticateRunner(orgId,identity.token,async()=>true)).rejects.toThrow();
  });
});
