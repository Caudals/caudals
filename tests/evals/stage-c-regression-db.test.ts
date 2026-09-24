import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool } from "../../lib/evals/repositories/db";
import { caseSchema, type CefCase } from "../../lib/evals/contracts/cases";
import { manifestSchema } from "../../lib/evals/contracts/manifest";
import { observationSchema } from "../../lib/evals/contracts/results";
import { withContentHash, sha256, canonicalJson } from "../../lib/evals/contracts/hashing";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { gradeDeterministically } from "../../lib/evals/scoring/deterministic";
import { createRegressionDraft, getRegressionDraft, releaseRegressionCase } from "../../lib/evals/repositories/stage-c";
import { addRevision, freezeSuite } from "../../lib/evals/repositories/evidence";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("WP-10 regression release on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("rejects pending, cross-tenant, personal-data and judge revisions before a deterministic release and frozen suite", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au");
    const orgId = randomUUID(), otherOrgId = randomUUID(), projectId = randomUUID();
    const targetId = randomUUID(), targetRevisionId = randomUUID(), evaluationId = randomUUID();
    const sourceCase = syntheticAccountingFixture(actorId);
    const original = sourceCase.cases[0], source = sourceCase.source, rubric = sourceCase.rubric;
    const artifactId = randomUUID(), oldSuiteId = randomUUID(), oldSuiteVersionId = randomUUID();
    const runId = randomUUID(), unitId = randomUUID(), observationId = randomUUID();
    const suiteId = randomUUID(), suiteVersionId = randomUUID(), now = new Date().toISOString();
    const access = { candidate: false, judge: true, customer: true, public: false };
    const buildManifest = (suite_id: string, suite_version_id: string, item: CefCase) => manifestSchema.parse(withContentHash({
      schema_version: "1.0", suite_id, suite_version_id,
      title: "Regression fixture", created_at: now,
      scope: { domain: "generic", languages: ["en"], jurisdictions: [], as_of: null, description: "Synthetic regression fixture" },
      execution_mode: "deployed_system", evidence_policy: "source_grounded",
      case_revisions: [{ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split, weight: item.weight }],
      source_revisions: [{ revision_id: source.revision_id, content_hash: source.content_hash }],
      rubric_revisions: [{ revision_id: rubric.revision_id, content_hash: rubric.content_hash }],
      fixture_revisions: [], output_schema_revisions: [],
      execution_policy: { limits: item.limits, session: "fresh_per_case", retry: { max_attempts: 1, retryable_statuses: [], uncertain_outcome: "pause_for_review" } },
      scoring_policy: { metric_version: "fixture-v1", weighting: "case_weight", thresholds: { pass: 1, partial: 0.5 }, exclusions: ["unsupported", "transport_error"], review: "all", comparison: "paired_family" },
      sampling_plan: { procedure: "all", seed: 42, planned_repetitions: 1, stopping_rules: { max_cases: 1, max_duration_ms: 60000, early_stopping: false } },
      visibility_policy: { cases: { ...access, candidate: true }, sources: { ...access, candidate: true }, rubrics: { ...access, customer: false }, observations: access, assessments: access, allow_candidate_holdout: false, publication_consent_id: null },
      files: [{ path: source.artifact.path, sha256: source.artifact.sha256, size_bytes: source.artifact.size_bytes }],
      extensions: {},
    }));
    const observation = observationSchema.parse(withContentHash({
      schema_version: "1.0", observation_id: observationId, run_id: runId,
      case_revision_id: original.revision_id, repetition: 0, attempt_id: randomUUID(),
      target_revision_id: targetRevisionId, started_at: now, finished_at: now,
      messages: [...original.scenario.messages, { role: "assistant", content: "EUR 0.00" }],
      tool_events: [], artifacts: [], provider_request_id: null, status: "succeeded", error: null,
      metadata: {
        latency_ms: { value: 1, provenance: "measured" },
        input_tokens: { value: null, provenance: "unavailable" },
        output_tokens: { value: null, provenance: "unavailable" },
        cost: { value: null, provenance: "unavailable" },
        model_identity: { value: null, provenance: "unavailable" },
      }, extensions: {},
    }));
    const assessment = gradeDeterministically({
      caseRevision: original, observation, rubric, graderRevisionId: "regression-fixture-v1",
    });
    expect(assessment.outcome).toBe("fail");
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Regression fixture", randomUUID() + "@example.test"]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Regression fixture',$3),($2,'Other fixture',$3)", [orgId, otherOrgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Regression')", [projectId, orgId]);
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Fixture')", [targetId, orgId, projectId]);
      const targetConfig = { schema_version: "1.0", target_revision_id: targetRevisionId, kind: "openai_compatible", endpoint: "https://example.test/v1", model: "fixture", credential: { kind: "none" }, limits: original.limits, requests_per_minute: 1, concurrent_sessions: 1, reset: "fresh_session" };
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [targetRevisionId, orgId, targetId, sha256(canonicalJson(targetConfig)), targetConfig]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Fixture','source_grounded',1,'EUR')", [evaluationId, orgId, projectId]);
      await db.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,'caudals_owned')", [source.source_id, orgId, projectId, source.title]);
      await db.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,visibility,object_key,sha256,byte_size,media_type,state) VALUES($1,$2,$3,$4,'candidate',$5,$6,$7,$8,'ready')", [artifactId, orgId, projectId, source.artifact.path, "fixture/" + artifactId, source.artifact.sha256, source.artifact.size_bytes, source.artifact.media_type]);
      await db.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,extraction_version,document) VALUES($1,$2,$3,$4,$5,'plain-text-v1',$6)", [source.revision_id, orgId, source.source_id, artifactId, source.content_hash, source]);
      const anchor = source.anchors[0], bounds = anchor.locator.split(":").slice(1).map(Number);
      await db.query("INSERT INTO evals.source_chunk(id,org_id,source_revision_id,ordinal,excerpt,anchor) VALUES($1,$2,$3,0,$4,$5)", [anchor.id, orgId, source.revision_id, anchor.excerpt, { start: bounds[0], end: bounds[1] }]);
      await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [rubric.revision_id, orgId, projectId, rubric.content_hash, rubric]);
      await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [original.case_id, orgId, projectId]);
      await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [original.revision_id, orgId, original.case_id, original.family_id, original.split, original.content_hash, original, rubric.revision_id]);
      await db.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Old suite')", [oldSuiteId, orgId, projectId]);
      const oldManifest = buildManifest(oldSuiteId, oldSuiteVersionId, original);
      await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [oldSuiteVersionId, orgId, oldSuiteId, oldManifest.content_hash, oldManifest]);
      await db.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,0)", [orgId, oldSuiteVersionId, original.revision_id]);
      await db.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase) VALUES($1,$2,$3,$4,$5,'deployed_system','completed','grading')", [runId, orgId, evaluationId, targetRevisionId, oldSuiteVersionId]);
      await db.query("INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status) VALUES($1,$2,$3,$4,0,'succeeded')", [unitId, orgId, runId, original.revision_id]);
      await db.query("INSERT INTO evals.observation(id,org_id,run_id,case_unit_id,content_hash,document,execution_status) VALUES($1,$2,$3,$4,$5,$6,'succeeded')", [observationId, orgId, runId, unitId, observation.content_hash, observation]);
      await db.query("INSERT INTO evals.assessment(id,org_id,observation_id,content_hash,document,outcome,review_status) VALUES($1,$2,$3,$4,$5,$6,$7)", [assessment.assessment_id, orgId, observationId, assessment.content_hash, assessment, assessment.outcome, assessment.review_status]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }

    const scope = { orgId, actorId };
    const [draft, raced] = await Promise.all([
      createRegressionDraft(scope, observationId), createRegressionDraft(scope, observationId),
    ]);
    expect(draft).toMatchObject({ redaction_status: "pending", validation_status: "pending" });
    expect(raced.id).toBe(draft.id);
    await expect(getRegressionDraft({ orgId: otherOrgId, actorId }, draft.id)).rejects.toThrow();

    const candidate = caseSchema.parse(withContentHash({
      ...original, revision_id: randomUUID(), title: "Reviewed regression calculation",
      provenance: { ...original.provenance, method: "human_authored", evidence_level: "expert_reviewed", reviewer_ids: [actorId] },
      extensions: { "caudals.evals/regression": {
        regression_case_id: draft.id, source_observation_id: observationId, source_case_revision_id: original.revision_id,
      } },
    }));
    const insert = async (document: typeof candidate) => addRevision(scope, projectId, { kind: "case", document }, randomUUID());
    await insert(candidate);

    const manifest = buildManifest(suiteId, suiteVersionId, candidate);
    await owner.query("INSERT INTO evals.suite(id,org_id,project_id,title,draft,version,created_by) VALUES($1,$2,$3,'Regression suite',$4,1,$5)", [suiteId, orgId, projectId, manifest, actorId]);
    await expect(freezeSuite(scope, suiteId, 1, randomUUID())).rejects.toThrow(/redacted and revalidated/);
    const pii = caseSchema.parse(withContentHash({ ...candidate, revision_id: randomUUID(), title: "alice@example.com" }));
    await insert(pii);
    await expect(releaseRegressionCase(scope, draft.id, pii.revision_id, randomUUID())).rejects.toThrow(/personal addresses/);
    const judge = caseSchema.parse(withContentHash({ ...candidate, revision_id: randomUUID(), reference: { ...candidate.reference, graders: [{ kind: "llm_judge", model_revision_id: "judge-v1", prompt_revision_id: "prompt-v1", calibration_revision_id: null }] } }));
    await insert(judge);
    await expect(releaseRegressionCase(scope, draft.id, judge.revision_id, randomUUID())).rejects.toThrow(/deterministic/);
    await expect(releaseRegressionCase({ orgId: otherOrgId, actorId }, draft.id, candidate.revision_id, randomUUID())).rejects.toThrow();
    const key = randomUUID();
    const released = await releaseRegressionCase(scope, draft.id, candidate.revision_id, key);
    expect(released).toMatchObject({ redactionStatus: "redacted", validationStatus: "valid", revalidationOutcome: "fail" });
    expect(await releaseRegressionCase(scope, draft.id, candidate.revision_id, key)).toEqual(released);
    const frozen = await freezeSuite(scope, suiteId, 1, randomUUID());
    expect(frozen.id).toBe(suiteVersionId);
    const stored = await owner.query("SELECT redaction_status,validation_status,draft_case_revision_id FROM evals.regression_case WHERE id=$1", [draft.id]);
    expect(stored.rows[0]).toMatchObject({ redaction_status: "redacted", validation_status: "valid", draft_case_revision_id: candidate.revision_id });
  }, 30000);
});
