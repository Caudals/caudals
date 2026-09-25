import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { prepareGroundedSuiteOnce } from "../../lib/evals/repositories/managed";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("generation quarantine on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("retains validation errors as JSON and permits a corrected grounded suite", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID(), artifactId = randomUUID();
    const { source } = syntheticAccountingFixture(actorId);
    const scope = { orgId, actorId };
    const generationJobIds = [randomUUID(), randomUUID()];
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Generation fixture", randomUUID() + "@example.test"]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Generation fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Generation fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready')",
        [artifactId, orgId, projectId, source.artifact.path, "test/" + artifactId, source.artifact.sha256, source.artifact.size_bytes, source.artifact.media_type]);
      await db.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,'caudals_owned')",
        [source.source_id, orgId, projectId, source.title]);
      await db.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'utf8-text-v1')",
        [source.revision_id, orgId, source.source_id, artifactId, source.content_hash, source]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Generation fixture','source_grounded',1,'EUR')", [evaluationId, orgId, projectId]);
      for (const generationJobId of generationJobIds) {
        await db.query(`INSERT INTO evals.generation_job(org_id,id,evaluation_id,workflow_id,title,execution_mode,source_revision_ids,prompt_revision,prompt_revision_id,requested_case_count,status,created_by)
          VALUES($1,$2,$3,$4,'Retry fixture','imported_responses',$5,'schema-retry-v1',$6,1,'profiling',$7)`,
        [orgId, generationJobId, evaluationId, randomUUID(), [source.revision_id], randomUUID(), actorId]);
      }
      await db.query(`INSERT INTO evals.generation_batch(org_id,evaluation_id,generation_job_id,step_kind,input_hash,version,prompt_revision,status,attempt_count)
        VALUES($1,$2,$3,'extract',$4,1,'schema-retry-v1','completed',1),
              ($1,$2,$5,'extract',$4,1,'schema-retry-v1','completed',1)`,
      [orgId, evaluationId, generationJobIds[0], "e".repeat(64), generationJobIds[1]]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }

    const input = {
      sourceRevisionId: source.revision_id,
      title: "Grounded fixture",
      executionMode: "imported_responses" as const,
      promptRevision: "quarantine-db-v1",
      questions: [{ question: "What is the total for EUR 100.00?", expected: "EUR 110.00", anchor: randomUUID(), severity: "medium" as const }],
    };
    const quarantined = await prepareGroundedSuiteOnce(scope, evaluationId, input, randomUUID());
    expect(quarantined).toMatchObject({ status: "quarantined", errors: ["Source anchor is absent from the frozen revision."] });
    const recorded = await withTenant(scope, async connection => ({
      quarantine: (await connection.query("SELECT schema_errors FROM evals.case_quarantine WHERE org_id=$1 AND evaluation_id=$2", [orgId, evaluationId])).rows[0],
      batch: (await connection.query("SELECT status FROM evals.generation_batch WHERE org_id=$1 AND evaluation_id=$2 AND step_kind='draft' AND generation_job_id IS NULL", [orgId, evaluationId])).rows[0],
    }));
    expect(recorded).toEqual({
      quarantine: { schema_errors: ["Source anchor is absent from the frozen revision."] },
      batch: { status: "failed" },
    });
    const corrected = await prepareGroundedSuiteOnce(scope, evaluationId, {
      ...input, questions: [{ ...input.questions[0], anchor: source.anchors[0].id }],
    }, randomUUID());
    expect(corrected).toMatchObject({ status: "needs_review", cases: 1 });

    const generatedInput = {
      ...input,
      generation: {
        generationJobId: generationJobIds[0],
        generatorRevisionId: randomUUID(),
        promptRevisionId: randomUUID(),
        modelRevisionId: null,
      },
    };
    const generatedQuarantined = await prepareGroundedSuiteOnce(scope, evaluationId, generatedInput, randomUUID());
    expect(generatedQuarantined).toMatchObject({ status: "quarantined" });
    const generatedCorrected = await prepareGroundedSuiteOnce(scope, evaluationId, {
      ...generatedInput, questions: [{ ...input.questions[0], anchor: source.anchors[0].id }],
    }, randomUUID());
    expect(generatedCorrected).toMatchObject({ status: "needs_review", cases: 1 });
    const generatedBatch = await withTenant(scope, async connection => (await connection.query(
      "SELECT status FROM evals.generation_batch WHERE org_id=$1 AND generation_job_id=$2 AND step_kind='validate'",
      [orgId, generationJobIds[0]],
    )).rows[0]);
    expect(generatedBatch).toEqual({ status: "completed" });
  }, 30000);
});
