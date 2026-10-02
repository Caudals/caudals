import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { editSourceExcerpts, getSource } from "../../lib/evals/repositories/evidence";
import { answerGenerationQuestions, getAutomaticGeneration } from "../../lib/evals/repositories/automatic-generation";
import { sourceSchema } from "../../lib/evals/contracts/cases";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("excerpt edits and optional context answers on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("saves excerpt edits as a new traceable revision and answers or skips questions together", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID(), artifactId = randomUUID(), jobId = randomUUID();
    const { source } = syntheticAccountingFixture(actorId);
    const anchor = source.anchors[0];
    const scope = { orgId, actorId };
    const questionIds = [randomUUID(), randomUUID(), randomUUID()];
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Preparation fixture", randomUUID() + "@example.test"]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Preparation fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Preparation fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready')",
        [artifactId, orgId, projectId, source.artifact.path, "test/" + artifactId, source.artifact.sha256, source.artifact.size_bytes, source.artifact.media_type]);
      await db.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,'caudals_owned')", [source.source_id, orgId, projectId, source.title]);
      await db.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'utf8-text-v1')",
        [source.revision_id, orgId, source.source_id, artifactId, source.content_hash, source]);
      const [, start, end] = anchor.locator.split(":");
      await db.query("INSERT INTO evals.source_chunk(id,org_id,source_revision_id,ordinal,excerpt,anchor) VALUES($1,$2,$3,0,$4,$5)", [anchor.id, orgId, source.revision_id, anchor.excerpt, { start: Number(start), end: Number(end) }]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Preparation fixture','source_grounded',1,'EUR')", [evaluationId, orgId, projectId]);
      await db.query(`INSERT INTO evals.generation_job(org_id,id,evaluation_id,workflow_id,title,execution_mode,source_revision_ids,prompt_revision,prompt_revision_id,requested_case_count,complexity,status,created_by)
        VALUES($1,$2,$3,$4,'Large fixture','imported_responses',$5,'dgx-context-cases-v4',$6,100,'expert','needs_input',$7)`,
        [orgId, jobId, evaluationId, randomUUID(), [source.revision_id], randomUUID(), actorId]);
      const questions: Array<[string, string, string]> = [["purpose", "What is it for?", "Purpose"], ["languages", "Which languages?", "Languages"], ["tasks", "Which tasks?", "Tasks"]];
      for (const [index, [field, question]] of questions.entries())
        await db.query("INSERT INTO evals.context_question(id,org_id,evaluation_id,generation_job_id,field,question,critical,context) VALUES($1,$2,$3,$4,$5,$6,true,$7)",
          [questionIds[index], orgId, evaluationId, jobId, field, question, index === 0 ? { why: "It sets what a correct answer achieves.", suggestions: ["Answer billing questions"] } : null]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }

    // Excerpt edits: a new revision of the same artifact, with provenance of the change.
    const edited = await editSourceExcerpts(scope, source.source_id, { baseRevisionId: source.revision_id, edits: [{ anchorId: anchor.id, excerpt: "Policy A: add a 10% service fee, then round once." }], removals: [] }, randomUUID());
    expect(edited).toMatchObject({ sourceId: source.source_id, changed: 1, removed: 0 });
    expect(edited.revisionId).not.toBe(source.revision_id);
    const detail = await getSource(scope, source.source_id);
    expect(detail.revisions[0].id).toBe(edited.revisionId);
    expect(detail.chunks.map((chunk: { excerpt: string }) => chunk.excerpt)).toEqual(["Policy A: add a 10% service fee, then round once."]);
    expect(detail.chunkCount).toBe(1);
    const document = await withTenant(scope, async (connection) => sourceSchema.parse((await connection.query("SELECT document FROM evals.source_revision WHERE org_id=$1 AND id=$2", [orgId, edited.revisionId])).rows[0].document));
    expect(document.anchors[0].locator).toBe(anchor.locator);
    expect(document.extensions["caudals.evals/excerpt-edits"]).toMatchObject({ base_revision_id: source.revision_id, edited_by: actorId, edited: [anchor.id], removed: [] });
    // A stale base is refused, and the last excerpt cannot be removed.
    await expect(editSourceExcerpts(scope, source.source_id, { baseRevisionId: source.revision_id, edits: [], removals: [anchor.id] }, randomUUID())).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(editSourceExcerpts(scope, source.source_id, { baseRevisionId: edited.revisionId, edits: [], removals: [detail.chunks[0].id] }, randomUUID())).rejects.toMatchObject({ code: "INPUT_INVALID" });

    // Context answers: one invalid answer saves nothing.
    await expect(answerGenerationQuestions(scope, evaluationId, jobId, [
      { questionId: questionIds[0], answer: "Answer billing questions" },
      { questionId: questionIds[1], answer: "Klingonese" },
    ])).rejects.toMatchObject({ status: 422 });
    const untouched = await withTenant(scope, async (connection) => (await connection.query("SELECT count(*)::int AS count FROM evals.context_question WHERE org_id=$1 AND generation_job_id=$2 AND status='open'", [orgId, jobId])).rows[0].count);
    expect(untouched).toBe(3);
    // Answered, named-language and skipped answers are saved together and unblock preparation.
    const saved = await answerGenerationQuestions(scope, evaluationId, jobId, [
      { questionId: questionIds[0], answer: "Answer billing questions" },
      { questionId: questionIds[1], answer: "English and Spanish" },
      { questionId: questionIds[2], answer: null },
    ]);
    expect(saved).toEqual({ answered: 2, skipped: 1, criticalOpen: 0 });
    const rows = await withTenant(scope, async (connection) => (await connection.query("SELECT field,status,answer,context FROM evals.context_question WHERE org_id=$1 AND generation_job_id=$2 ORDER BY field", [orgId, jobId])).rows);
    expect(rows).toEqual([
      { field: "languages", status: "answered", answer: "en, es", context: null },
      { field: "purpose", status: "answered", answer: "Answer billing questions", context: { why: "It sets what a correct answer achieves.", suggestions: ["Answer billing questions"] } },
      { field: "tasks", status: "waived", answer: null, context: null },
    ]);
    const generation = await getAutomaticGeneration(scope, evaluationId, jobId);
    expect(generation.job?.progress).toEqual({ written: 0, target: 100, rounds: 0, complexity: "expert" });
  });
});
