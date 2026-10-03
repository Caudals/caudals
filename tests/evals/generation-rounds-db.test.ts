import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { buildContextProfile } from "../../lib/evals/generation/context";
import { digest } from "../../lib/evals/queue/store";
import { advanceAutomaticGeneration, advancePendingGenerations, getAutomaticGeneration } from "../../lib/evals/repositories/automatic-generation";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

/** Simulates the worker finishing a generate step with the given model cases. */
async function completeStep(db: PoolClient, orgId: string, stepId: string, providerId: string, priceId: string, cases: unknown[]) {
  const attemptId = randomUUID();
  await db.query("INSERT INTO evals.execution_attempt(id,org_id,step_id,fence,ordinal,provider_revision_id,price_revision_id,status,token_bound) VALUES($1,$2,$3,0,1,$4,$5,'completed',100)", [attemptId, orgId, stepId, providerId, priceId]);
  const output = { text: JSON.stringify({ cases }), complete: true };
  await db.query("INSERT INTO evals.execution_result(org_id,step_id,attempt_id,output,output_hash) VALUES($1,$2,$3,$4,$5)", [orgId, stepId, attemptId, output, digest(output)]);
  await db.query("UPDATE evals.workflow_step SET status='completed' WHERE org_id=$1 AND id=$2", [orgId, stepId]);
}

(ownerUrl && runtimeUrl ? describe : describe.skip)("large test sets drafted in rounds on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("accumulates validated cases, queues the next round, and finishes when a round adds nothing new", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID(), artifactId = randomUUID();
    const jobId = randomUUID(), workflowId = randomUUID(), promptRevisionId = randomUUID(), profileRevisionId = randomUUID(), firstStep = randomUUID();
    const accountId = randomUUID(), providerId = randomUUID(), priceId = randomUUID();
    const { source } = syntheticAccountingFixture(actorId);
    const anchor = source.anchors[0];
    const scope = { orgId, actorId };
    const job = { title: "Rounds fixture", promptRevision: "dgx-context-cases-v4", executionMode: "imported_responses", maxCases: 100 };
    const cases = [
      { question: "What service fee does policy A add to the subtotal?", expected: "10% service fee", sourceRevisionId: source.revision_id, anchorId: anchor.id, supportingQuote: anchor.excerpt, severity: "high", difficulty: "routine" },
      { question: "How many times is the total rounded under policy A?", expected: "round once to two decimals", sourceRevisionId: source.revision_id, anchorId: anchor.id, supportingQuote: anchor.excerpt, severity: "medium", difficulty: "advanced" },
    ];
    const profile = buildContextProfile({ evaluationId, purpose: "Answer fee questions", languages: ["en"], tasks: ["fees"], sources: [{ revisionId: source.revision_id }], promptRevision: job.promptRevision, modelRevisionId: providerId });
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Rounds fixture", randomUUID() + "@example.test"]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Rounds fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Rounds fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready',now()+interval '1 day')",
        [artifactId, orgId, projectId, source.artifact.path, "test/" + artifactId, source.artifact.sha256, source.artifact.size_bytes, source.artifact.media_type]);
      await db.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,'caudals_owned')", [source.source_id, orgId, projectId, source.title]);
      await db.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'utf8-text-v1')",
        [source.revision_id, orgId, source.source_id, artifactId, source.content_hash, source]);
      const [, start, end] = anchor.locator.split(":");
      await db.query("INSERT INTO evals.source_chunk(id,org_id,source_revision_id,ordinal,excerpt,anchor) VALUES($1,$2,$3,0,$4,$5)", [anchor.id, orgId, source.revision_id, anchor.excerpt, { start: Number(start), end: Number(end) }]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Rounds fixture','source_grounded',5,'EUR')", [evaluationId, orgId, projectId]);
      await db.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'rounds fixture','EUR',100,true)", [accountId]);
      await db.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
        VALUES($1,$2,'dgx','http://dgx.invalid/v1','fixture-generator','fixture',ARRAY['context_analyzer','generator','judge'],'{"text":true,"boundedTokens":true,"jsonObject":true}',32768,8192,ARRAY['synthetic'],ARRAY['private'],1000,10000000,4)`, [providerId, accountId]);
      await db.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0,0,0,0,0,'fixture')", [priceId, providerId]);
      for (const role of ["context_analyzer", "generator"])
        await db.query("INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,'synthetic','private',0.0001,$5)", [orgId, role, providerId, priceId, actorId]);
      await db.query("INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,'workspace',$1,'EUR',10),($1,'run',$2,'EUR',5)", [orgId, jobId]);
      await db.query("INSERT INTO evals.context_profile_revision(id,org_id,evaluation_id,content_hash,document,model_revision_id,prompt_revision) VALUES($1,$2,$3,$4,$5,$6,$7)", [profileRevisionId, orgId, evaluationId, profile.content_hash, profile, providerId, job.promptRevision]);
      await db.query(`INSERT INTO evals.generation_job(org_id,id,evaluation_id,workflow_id,title,execution_mode,source_revision_ids,prompt_revision,prompt_revision_id,requested_case_count,complexity,status,profile_revision_id,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'expert','draft_ready',$11,$12)`,
        [orgId, jobId, evaluationId, workflowId, job.title, job.executionMode, [source.revision_id], job.promptRevision, promptRevisionId, job.maxCases, profileRevisionId, actorId]);
      await db.query(`INSERT INTO evals.generation_batch(org_id,evaluation_id,generation_job_id,step_kind,input_hash,version,prompt_revision,model_revision_id,status,attempt_count)
        VALUES($1,$2,$3,'profile',$4,1,$5,$6,'completed',1),($1,$2,$3,'draft',$7,1,$5,$6,'completed',1)`, [orgId, evaluationId, jobId, "c".repeat(64), job.promptRevision, providerId, "d".repeat(64)]);
      const planHash = digest({ jobId, sourceRevisionIds: [source.revision_id], title: job.title, promptRevision: job.promptRevision, executionMode: job.executionMode, maxCases: job.maxCases });
      await db.query("INSERT INTO evals.execution_workflow(id,org_id,run_id,status,plan_hash,created_by) VALUES($1,$2,$3,'running',$4,$5)", [workflowId, orgId, jobId, planHash, actorId]);
      await db.query("INSERT INTO evals.workflow_step(id,org_id,workflow_id,step_kind,input_hash,version,input,status) VALUES($1,$2,$3,'generate',$4,1,$5,'running')", [firstStep, orgId, workflowId, "a".repeat(64), { generationJobId: jobId, generationStep: "draft" }]);
      await completeStep(db, orgId, firstStep, providerId, priceId, cases);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }

    // Round 1 adds two cases out of 100: a second round is queued that avoids them.
    const next = await advanceAutomaticGeneration(scope, evaluationId, jobId, randomUUID());
    expect(next).toMatchObject({ status: "drafting", progress: { written: 2, target: 100 } });
    const state = await withTenant(scope, async (connection) => ({
      job: (await connection.query("SELECT status,draft_rounds,jsonb_array_length(draft_cases)::int AS written FROM evals.generation_job WHERE org_id=$1 AND id=$2", [orgId, jobId])).rows[0],
      step: (await connection.query("SELECT id,version,input FROM evals.workflow_step WHERE org_id=$1 AND workflow_id=$2 AND step_kind='generate' ORDER BY version DESC LIMIT 1", [orgId, workflowId])).rows[0],
    }));
    expect(state.job).toEqual({ status: "drafting", draft_rounds: 1, written: 2 });
    expect(state.step.version).toBe(2);
    const request = JSON.parse(state.step.input.messages[1].content);
    expect(request).toMatchObject({ round: 2, complexity: "expert", maxCases: 12, avoidQuestions: cases.map((item) => item.question) });
    expect(state.step.input.messages[0].content).toContain("Complexity is expert");
    expect((await getAutomaticGeneration(scope, evaluationId, jobId)).job?.progress).toMatchObject({ written: 2, target: 100, rounds: 1 });

    // Round 2 only repeats the same facts: the set is finished with the two validated cases.
    const db2 = await owner.connect();
    try {
      await db2.query("BEGIN");
      await db2.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await completeStep(db2, orgId, state.step.id, providerId, priceId, cases);
      await db2.query("UPDATE evals.generation_job SET status='draft_ready',updated_at=now()-interval '1 minute' WHERE org_id=$1 AND id=$2", [orgId, jobId]);
      await db2.query("COMMIT");
    } catch (error) { await db2.query("ROLLBACK"); throw error; }
    finally { db2.release(); }
    // Nobody has the page open: the scheduler finishes the set with the same code.
    const scheduler = { orgId, actorId: "service:evals-scheduler" };
    expect(await advancePendingGenerations(scheduler)).toBe(1);
    expect(await advancePendingGenerations(scheduler)).toBe(0);
    const final = await withTenant(scope, async (connection) => (await connection.query("SELECT status,suite_id IS NOT NULL AS has_suite FROM evals.generation_job WHERE org_id=$1 AND id=$2", [orgId, jobId])).rows[0]);
    expect(final).toEqual({ status: "needs_review", has_suite: true });
  });
});
