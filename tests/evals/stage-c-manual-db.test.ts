import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { canonicalJson, sha256, withContentHash } from "../../lib/evals/contracts/hashing";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { applyMatchedAnswers, createReportForRun, createRun, persistImport, scoreRun } from "../../lib/evals/repositories/managed";
import { createSuite, editSuiteDraftCase, freezeSuite, getDraft, getSuiteDraftCases, listSuiteVersions } from "../../lib/evals/repositories/evidence";
import { forkSuite } from "../../lib/evals/repositories/stage-c";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("WP-11 manual answers on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("resumes a partial import, rejects a substituted suite and grades a completed run", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au");
    const orgId = randomUUID(), otherOrgId = randomUUID(), projectId = randomUUID();
    const targetId = randomUUID(), targetRevisionId = randomUUID(), suiteId = randomUUID(), suiteVersionId = randomUUID(), otherSuiteVersionId = randomUUID(), evaluationId = randomUUID();
    const fixtures = [syntheticAccountingFixture(actorId), syntheticAccountingFixture(actorId)];
    const scope = { orgId, actorId };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Manual answer fixture", randomUUID() + "@example.test"]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Manual answers',$3),($2,'Other',$3)", [orgId, otherOrgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Manual fixture')", [projectId, orgId]);
      const config = { schema_version: "1.0", target_revision_id: targetRevisionId,
        kind: "imported_responses", source_path: "responses/manual.csv", mapping_revision_id: randomUUID(),
        limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 },
        requests_per_minute: 1, concurrent_sessions: 1, reset: "fresh_session" };
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Manual system')", [targetId, orgId, projectId]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [targetRevisionId, orgId, targetId, sha256(canonicalJson(config)), config]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Manual eval','source_grounded',1,'EUR')", [evaluationId, orgId, projectId]);
      await db.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Manual suite')", [suiteId, orgId, projectId]);
      for (const fixture of fixtures) {
        const item = fixture.cases[0], rubric = fixture.rubric;
        await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [rubric.revision_id, orgId, projectId, rubric.content_hash, rubric]);
        await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
        await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, rubric.revision_id]);
      }
      const manifest = withContentHash({
        schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, title: "Manual suite",
        created_at: new Date().toISOString(), scope: { domain: "generic", languages: ["en"], jurisdictions: [], as_of: null, description: "Synthetic manual answers" },
        execution_mode: "imported_responses", evidence_policy: "source_grounded",
        case_revisions: fixtures.map(fixture => { const item = fixture.cases[0]; return { case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split, weight: item.weight }; }),
        source_revisions: [], rubric_revisions: fixtures.map(fixture => ({ revision_id: fixture.rubric.revision_id, content_hash: fixture.rubric.content_hash })),
        fixture_revisions: [], output_schema_revisions: [], files: [],
        execution_policy: { limits: config.limits, session: "fresh_per_case", retry: { max_attempts: 1, retryable_statuses: [], uncertain_outcome: "pause_for_review" } },
        scoring_policy: { metric_version: "fixture-v1", weighting: "case_weight", thresholds: { pass: 1, partial: 0.5 }, exclusions: ["unsupported"], review: "all", comparison: "paired_family" },
        sampling_plan: { procedure: "all", seed: 0, planned_repetitions: 1, stopping_rules: { max_cases: 2, max_duration_ms: 60000, early_stopping: false } },
        visibility_policy: { cases: { candidate: true, judge: true, customer: true, public: false }, sources: { candidate: false, judge: true, customer: true, public: false }, rubrics: { candidate: false, judge: true, customer: false, public: false }, observations: { candidate: false, judge: true, customer: true, public: false }, assessments: { candidate: false, judge: true, customer: true, public: false }, allow_candidate_holdout: false, publication_consent_id: null },
        extensions: {},
      });
      await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
      const otherManifest = withContentHash({ ...manifest, suite_version_id: otherSuiteVersionId });
      await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [otherSuiteVersionId, orgId, suiteId, otherManifest.content_hash, otherManifest]);
      for (const [ordinal, fixture] of fixtures.entries()) await db.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,$4)", [orgId, suiteVersionId, fixture.cases[0].revision_id, ordinal]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }

    const created = await createRun(scope, { evaluationId, targetRevisionId, suiteVersionId, executionMode: "imported_responses", plan: { purpose: "Synthetic manual import" } }, randomUUID());
    expect(created.status).toBe("awaiting_answers");
    const runId = created.id;
    const mapping = { suite_version_id: "suite_version_id", case_id: "case_id", case_revision_id: "case_revision_id", input: "input", system_answer: "system_answer" };
    const csv = (index: number, version = suiteVersionId) => Buffer.from(
      "suite_version_id,case_id,case_revision_id,input,system_answer\n" +
      [version, fixtures[index].cases[0].case_id, fixtures[index].cases[0].revision_id, "Calculate the total", "EUR 135.80"].join(",") + "\n"
    );
    const first = await persistImport(scope, { projectId, intent: "manual_answers", format: "csv", mapping, suiteVersionId, bytes: csv(0) }, randomUUID());
    const partial = await applyMatchedAnswers(scope, first.id, runId);
    expect(partial).toMatchObject({ saved: 1, complete: false });
    if (!("missing" in partial)) throw new Error("Manual import result missing revision list");
    expect(partial.missing).toContain(fixtures[1].cases[0].revision_id);
    const wrong = await persistImport(scope, { projectId, intent: "manual_answers", format: "csv", mapping, suiteVersionId: otherSuiteVersionId, bytes: csv(1, otherSuiteVersionId) }, randomUUID());
    await expect(applyMatchedAnswers(scope, wrong.id, runId)).rejects.toThrow();
    const duplicateRows = Buffer.concat([csv(1), csv(1).subarray(csv(1).indexOf(10) + 1)]);
    const duplicate = await persistImport(scope, { projectId, intent: "manual_answers", format: "csv", mapping, suiteVersionId, bytes: duplicateRows }, randomUUID());
    const rejected = await applyMatchedAnswers(scope, duplicate.id, runId);
    expect(rejected.saved).toBe(0);
    if (!("errors" in rejected)) throw new Error("Manual import result missing row errors");
    expect(rejected.errors).toHaveLength(2);
    const second = await persistImport(scope, { projectId, intent: "manual_answers", format: "csv", mapping, suiteVersionId, bytes: csv(1) }, randomUUID());
    const resumed = await applyMatchedAnswers(scope, second.id, runId);
    expect(resumed).toMatchObject({ saved: 1, complete: true, missing: [] });
    expect((await applyMatchedAnswers(scope, second.id, runId)).saved).toBe(0);
    const state = await withTenant(scope, async connection => ({
      run: (await connection.query("SELECT status FROM evals.run WHERE id=$1", [runId])).rows[0],
      observations: Number((await connection.query("SELECT count(*) FROM evals.observation WHERE run_id=$1", [runId])).rows[0].count),
    }));
    expect(state).toEqual({ run: { status: "completed" }, observations: 2 });
    const scored = await scoreRun(scope, runId, "manual-fixture-v1");
    expect(scored.created).toBe(2);
    expect(scored.metrics.n_executed).toBe(2);
    const report = await createReportForRun(scope, { runId, title: "Synthetic manual report", reviewStatus: "preliminary", scorerVersion: "fixture-v1" }, randomUUID());
    expect(report.snapshot.methodology.limitations).toContain("Responses were imported; execution identity, latency and usage may be unavailable.");
    expect(report.snapshot.results).toHaveLength(2);

    const forkSource = await createSuite(scope, { projectId, title: "Customer source suite" }, randomUUID());
    const template = await withTenant(scope, async connection => (await connection.query(
      "SELECT manifest FROM evals.suite_version WHERE org_id=$1 AND id=$2", [orgId, suiteVersionId],
    )).rows[0].manifest);
    const editableCase = withContentHash({
      ...fixtures[0].cases[0], case_id: randomUUID(), revision_id: randomUUID(), family_id: randomUUID(),
      reference: { ...fixtures[0].cases[0].reference, source_refs: [] },
      provenance: { ...fixtures[0].cases[0].provenance, evidence_level: "unverified" as const },
    });
    const holdout = withContentHash({
      ...fixtures[1].cases[0], case_id: randomUUID(), revision_id: randomUUID(), family_id: randomUUID(), split: "holdout" as const,
      reference: { ...fixtures[1].cases[0].reference, source_refs: [] },
      provenance: { ...fixtures[1].cases[0].provenance, evidence_level: "unverified" as const },
    });
    const forkSourceVersionId = randomUUID();
    const forkSourceManifest = withContentHash({
      ...template, suite_id: forkSource.id, suite_version_id: forkSourceVersionId, title: "Customer source suite", evidence_policy: "exploratory" as const,
      case_revisions: [
        { case_id: editableCase.case_id, revision_id: editableCase.revision_id, content_hash: editableCase.content_hash,
          family_id: editableCase.family_id, split: editableCase.split, weight: editableCase.weight },
        { case_id: holdout.case_id, revision_id: holdout.revision_id, content_hash: holdout.content_hash,
          family_id: holdout.family_id, split: holdout.split, weight: holdout.weight },
      ],
    });
    await withTenant(scope, async connection => {
      for (const item of [editableCase, holdout]) {
        await connection.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
        await connection.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, item.reference.rubric_revision_id]);
      }
      await connection.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)",
        [forkSourceVersionId, orgId, forkSource.id, forkSourceManifest.content_hash, forkSourceManifest]);
      for (const [ordinal, item] of forkSourceManifest.case_revisions.entries()) await connection.query(
        "INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,$4)",
        [orgId, forkSourceVersionId, item.revision_id, ordinal],
      );
    });
    const fork = await forkSuite(scope, forkSource.id, forkSourceVersionId, "Customer fork", randomUUID());
    const draftCases = await getSuiteDraftCases(scope, fork.suiteId);
    expect(draftCases.cases).toHaveLength(1);
    expect(draftCases.cases[0].caseRevisionId).not.toBe(holdout.revision_id);
    const editable = draftCases.cases[0];
    const contents = editable.document.scenario.messages.map((message, index) => index === 0 ? "A customer-edited question" : message.content);
    const editKey = randomUUID();
    const editInput = { title: "Customer-edited case", contents, expected: editable.document.reference.expected };
    const edited = await editSuiteDraftCase(scope, fork.suiteId, editable.caseRevisionId, editInput, editKey);
    expect(await editSuiteDraftCase(scope, fork.suiteId, editable.caseRevisionId, editInput, editKey)).toEqual(edited);
    expect(edited.version).toBe(2);
    await expect(editSuiteDraftCase(scope, fork.suiteId, holdout.revision_id, editInput, randomUUID())).rejects.toMatchObject({ status: 404 });
    const savedCases = await getSuiteDraftCases(scope, fork.suiteId);
    expect(savedCases.cases[0].document).toMatchObject({
      title: "Customer-edited case",
      provenance: { evidence_level: "customer_supplied_unreviewed", reviewer_ids: [] },
      scenario: { messages: [{ content: "A customer-edited question" }] },
    });
    expect((await getDraft(scope, fork.suiteId)).version).toBe(2);
    const frozenFork = await freezeSuite(scope, fork.suiteId, edited.version, randomUUID());
    expect(frozenFork.manifest.case_revisions.map(item => item.revision_id)).toContain(holdout.revision_id);
    expect((await listSuiteVersions(scope)).find(item => item.suite_id === fork.suiteId)).toMatchObject({ case_count: 1 });
  }, 30000);
});
