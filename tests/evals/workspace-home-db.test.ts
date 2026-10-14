/**
 * Launch L-22 on the real schema: the workspace summary Home and Systems read
 * (plan, last successful check, scores per system, next scheduled run, role
 * checks), "Check now" (the existing connection check: role-checked, one probe
 * in flight per system, rate-limited) and the faster review's approval (spot
 * check allowed on free and pay-as-you-go only, attributed in the audit trail
 * with the questions checked), plus bulk removal of draft questions.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { canonicalJson, sha256, withContentHash } from "@/lib/evals/contracts/hashing";
import { caseSchema } from "@/lib/evals/contracts/cases";
import { syntheticAccountingFixture } from "@/lib/evals/generation/packs";
import { createPrefixedId } from "@/lib/operator/ids";

const identity = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => identity.current!,
}));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const headers = { host: "localhost", origin: "http://localhost", "content-type": "application/json" };

type Fixture = Awaited<ReturnType<typeof createFixtureOnce>>;

/**
 * The fixture in one transaction, retried when PostgreSQL picks it as a
 * deadlock victim (SQLSTATE 40P01): the other real-schema suites write to the
 * same tables in parallel (I-12, launch L-24), and a retry is PostgreSQL's
 * documented answer. Fresh ids each attempt.
 */
async function createFixture(owner: Pool, plan: "free" | "payg" | "managed") {
  for (let attempt = 1; ; attempt++) {
    try {
      return await createFixtureOnce(owner, plan);
    } catch (error) {
      if ((error as { code?: string }).code !== "40P01" || attempt >= 3) throw error;
    }
  }
}

/** One workspace on `plan` with a generated, frozen 12-question test set awaiting review, an API system and a scored run. */
async function createFixtureOnce(owner: Pool, plan: "free" | "payg" | "managed") {
  const actorId = createPrefixedId("au"), viewerId = createPrefixedId("au"), outsiderId = createPrefixedId("au");
  const orgId = randomUUID(), projectId = randomUUID(), artifactId = randomUUID(), suiteId = randomUUID(), suiteVersionId = randomUUID();
  const evaluationId = randomUUID(), scoredEvaluationId = randomUUID(), targetId = randomUUID(), targetRevisionId = randomUUID();
  const runId = randomUUID(), reportId = randomUUID(), revisionId = randomUUID();
  const { source, rubric, cases: [template] } = syntheticAccountingFixture(actorId);
  const cases = Array.from({ length: 12 }, () =>
    caseSchema.parse(withContentHash({ ...template, case_id: randomUUID(), revision_id: randomUUID(), family_id: randomUUID(), reference: { ...template.reference, rubric_revision_id: rubric.revision_id } })),
  );
  const access = { candidate: false, judge: true, customer: true, public: false };
  const manifest = withContentHash({
    schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, title: "Generated", created_at: new Date().toISOString(),
    scope: { domain: template.domain, languages: [template.language], jurisdictions: [], as_of: null, description: "Fixture set." },
    execution_mode: "deployed_system", evidence_policy: "source_grounded",
    case_revisions: cases.map((item) => ({ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split, weight: item.weight })),
    source_revisions: [{ revision_id: source.revision_id, content_hash: source.content_hash }],
    rubric_revisions: [{ revision_id: rubric.revision_id, content_hash: rubric.content_hash }], fixture_revisions: [], output_schema_revisions: [],
    execution_policy: { limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 }, session: "fresh_per_case", retry: { max_attempts: 3, retryable_statuses: ["transport_error"], uncertain_outcome: "pause_for_review" } },
    scoring_policy: { metric_version: "strict-v1", weighting: "case_weight", thresholds: { pass: 1, partial: 0.5 }, exclusions: ["unsupported"], review: "failures_and_disputes", comparison: "paired_family" },
    sampling_plan: { procedure: "all", seed: 0, planned_repetitions: 1, stopping_rules: { max_cases: cases.length, max_duration_ms: 3600000, early_stopping: false } },
    visibility_policy: { cases: { ...access, candidate: true }, sources: access, rubrics: access, observations: access, assessments: access, allow_candidate_holdout: false, publication_consent_id: null },
    files: [], extensions: {},
  });
  // A private address: the existing API check refuses it before any network call (destination_denied).
  const config = { schema_version: "1.0", target_revision_id: targetRevisionId, limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60_000, repetitions: 1 }, requests_per_minute: 6, concurrent_sessions: 1, reset: "fresh_session", kind: "openai_compatible", endpoint: "https://127.0.0.1/v1", model: "fixture", credential: { kind: "none" } };
  const db = await owner.connect();
  try {
    await db.query("BEGIN");
    for (const [id, name] of [[actorId, "Home owner"], [viewerId, "Home viewer"], [outsiderId, "Outsider"]])
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, name, `${randomUUID()}@example.test`]);
    await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
    await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Home fixture',$2)", [orgId, actorId]);
    await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')", [orgId, actorId, viewerId]);
    await db.query("UPDATE evals.workspace_entitlement SET plan=$2,can_schedule=true WHERE org_id=$1", [orgId, plan]);
    await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Home fixture')", [projectId, orgId]);
    await db.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready')",
      [artifactId, orgId, projectId, source.artifact.path, `test/${artifactId}`, source.artifact.sha256, source.artifact.size_bytes, source.artifact.media_type]);
    await db.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,'caudals_owned')", [source.source_id, orgId, projectId, source.title]);
    await db.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'utf8-text-v1')",
      [source.revision_id, orgId, source.source_id, artifactId, source.content_hash, source]);
    await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [rubric.revision_id, orgId, projectId, rubric.content_hash, rubric]);
    for (const item of cases) {
      await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
      await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, rubric.revision_id]);
    }
    await db.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Generated')", [suiteId, orgId, projectId]);
    await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
    await db.query(`INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,preparation_status)
      VALUES($1,$2,$3,'Review me','source_grounded',100,'EUR','needs_review'),($4,$2,$3,'Scored','source_grounded',100,'EUR','ready')`, [evaluationId, orgId, projectId, scoredEvaluationId]);
    await db.query("UPDATE evals.evaluation SET selected_suite_version_id=$3 WHERE org_id=$1 AND id=$2", [orgId, scoredEvaluationId, suiteVersionId]);
    await db.query("INSERT INTO evals.generation_batch(org_id,evaluation_id,step_kind,input_hash,version,prompt_revision,status,output) VALUES($1,$2,'freeze',$3,1,'fixture','completed',$4)",
      [orgId, evaluationId, sha256(randomUUID()), { suiteId, suiteVersionId }]);
    await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Claims API')", [targetId, orgId, projectId]);
    await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [targetRevisionId, orgId, targetId, sha256(canonicalJson(config)), config]);
    // Checks: a success three days ago, then a failure: "needs attention", last successful check three days ago.
    await db.query(`INSERT INTO evals.connection_check(org_id,target_revision_id,status,error_code,created_at,completed_at)
      VALUES($1,$2,'ready',NULL,now()-interval '3 days',now()-interval '3 days'),($1,$2,'failed','invalid_credentials',now()-interval '1 day',now()-interval '1 day')`, [orgId, targetRevisionId]);
    await db.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase,created_by) VALUES($1,$2,$3,$4,$5,'deployed_system','completed','done',$6)",
      [runId, orgId, scoredEvaluationId, targetRevisionId, suiteVersionId, actorId]);
    const snapshot = { system: { name: "Claims API" }, scope: { review_status: "preliminary" }, metrics: { strict_pass_rate: 0.75, n_pass: 9, n_scorable: 12, n_eligible: 12, headline_status: "complete" } };
    await db.query("INSERT INTO evals.report(id,org_id,project_id,title) VALUES($1,$2,$3,'Scored report')", [reportId, orgId, projectId]);
    await db.query("INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status) VALUES($1,$2,$3,$4,$5,$6,'preliminary')", [revisionId, orgId, reportId, runId, sha256(canonicalJson(snapshot)), snapshot]);
    await db.query("UPDATE evals.report SET current_revision_id=$2,publication_status='published' WHERE id=$1", [reportId, revisionId]);
    // Schedules: a paused one sooner, the active one next, a later active one.
    for (const [status, due] of [["paused", "2 days"], ["active", "5 days"], ["active", "20 days"]])
      await db.query(`INSERT INTO evals.monitor_schedule(org_id,project_id,evaluation_id,target_revision_id,suite_version_id,timezone,cadence,local_time,day_of_month,max_run_spend,currency,status,next_due_at)
        VALUES($1,$2,$3,$4,$5,'Europe/Madrid','monthly','09:00',5,10,'EUR',$6,now()+$7::interval)`, [orgId, projectId, scoredEvaluationId, targetRevisionId, suiteVersionId, status, due]);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
  const person = (id: string, role: "owner" | "viewer" | null): EvalIdentity => ({ user: { id, name: "Fixture", email: `${id}@example.test` }, platformRole: null, workspaces: role ? [{ id: orgId, name: "Home fixture", role }] : [] });
  return { orgId, actorId, suiteId, suiteVersionId, evaluationId, targetId, targetRevisionId, reportId, cases, owner: person(actorId, "owner"), viewer: person(viewerId, "viewer"), outsider: person(outsiderId, null) };
}

describe.skipIf(!ownerUrl || !runtimeUrl)("workspace home, check now and spot-check approval (launch L-22)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  let free: Fixture, managed: Fixture;
  beforeAll(async () => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    vi.stubEnv("DATABASE_URL", runtimeUrl!);
    free = await createFixture(owner, "free");
    managed = await createFixture(owner, "managed");
  });
  afterAll(async () => {
    await owner.end();
    const { getEvalsPool } = await import("@/lib/evals/repositories/db");
    await getEvalsPool().end();
    const { getPostgresPool } = await import("@/lib/db/client");
    await getPostgresPool().end().catch(() => undefined);
    vi.unstubAllEnvs();
  });

  const summary = async (fixture: Fixture, as: EvalIdentity) => {
    identity.current = as;
    const { GET } = await import("@/app/api/evals/v1/workspace/summary/route");
    return GET(new Request(`http://localhost/api/evals/v1/workspace/summary?orgId=${fixture.orgId}`, { headers }));
  };
  const check = async (fixture: Fixture, as: EvalIdentity) => {
    identity.current = as;
    const { POST } = await import("@/app/api/evals/v1/targets/[id]/checks/route");
    return POST(new Request(`http://localhost/api/evals/v1/targets/${fixture.targetRevisionId}/checks`, { method: "POST", headers: { ...headers, "idempotency-key": `check-${randomUUID()}` }, body: JSON.stringify({ orgId: fixture.orgId }) }));
  };
  const approve = async (fixture: Fixture, body: Record<string, unknown>, key = `approve-${randomUUID()}`) => {
    identity.current = fixture.owner;
    const { POST } = await import("@/app/api/evals/v1/evaluations/[id]/approve-suite/route");
    return POST(new Request(`http://localhost/api/evals/v1/evaluations/${fixture.evaluationId}/approve-suite`, { method: "POST", headers: { ...headers, "idempotency-key": key }, body: JSON.stringify({ orgId: fixture.orgId, suiteVersionId: fixture.suiteVersionId, ...body }) }));
  };
  const checks = async (fixture: Fixture) => (await owner.query("SELECT status,error_code FROM evals.connection_check WHERE org_id=$1 ORDER BY created_at", [fixture.orgId])).rows;

  it("summary: plan, last successful check, the score's system, the next active run; members only; under the time budget", async () => {
    await summary(free, free.viewer); // warm: module load and pool
    const started = performance.now();
    const response = await summary(free, free.viewer);
    const elapsed = performance.now() - started;
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.entitlement.plan).toBe("free");
    const [system] = data.systems;
    expect(system).toMatchObject({ id: free.targetId, connection_status: "failed", error_code: "invalid_credentials" });
    expect(new Date(system.connection_ok_at).getTime()).toBeLessThan(Date.now() - 2.9 * 86_400_000);
    expect(data.reports).toEqual([expect.objectContaining({ id: free.reportId, target_id: free.targetId, strict_pass_rate: 0.75, run_created_at: expect.any(String) })]);
    expect(data.next_run).toMatchObject({ evaluation_title: "Scored", cadence: "monthly", timezone: "Europe/Madrid" });
    expect(new Date(data.next_run.next_due_at).getTime()).toBeGreaterThan(Date.now() + 4 * 86_400_000);
    expect(new Date(data.next_run.next_due_at).getTime()).toBeLessThan(Date.now() + 6 * 86_400_000);
    // The customer view keeps internal fields out.
    expect(Object.keys(data.next_run).sort()).toEqual(["cadence", "evaluation_id", "evaluation_title", "id", "next_due_at", "timezone"]);
    expect(system.capability_report).toBeUndefined();
    expect(elapsed).toBeLessThan(500);
    // Another workspace's member and a stranger cannot read it.
    expect((await summary(free, free.outsider)).status).toBeGreaterThanOrEqual(403);
    expect((await summary(free, managed.owner)).status).toBeGreaterThanOrEqual(403);
  });

  it("Check now: editors only, one bounded probe in flight per system, then rate-limited", async () => {
    // Viewers and strangers are refused before anything is queued.
    for (const person of [free.viewer, free.outsider]) {
      const refused = await check(free, person);
      expect(refused.status).toBeGreaterThanOrEqual(403);
      expect(refused.status).toBeLessThan(500);
    }
    expect(await checks(free)).toHaveLength(2);
    // A check still in flight is returned instead of starting another.
    const inflight = (await owner.query("INSERT INTO evals.connection_check(org_id,target_revision_id,status) VALUES($1,$2,'queued') RETURNING id", [free.orgId, free.targetRevisionId])).rows[0].id;
    const reused = await check(free, free.owner);
    expect(reused.status).toBe(200);
    expect((await reused.json()).data).toEqual({ id: inflight, status: "queued", reused: true });
    expect(await checks(free)).toHaveLength(3);
    await owner.query("UPDATE evals.connection_check SET status='failed',completed_at=now() WHERE id=$1", [inflight]);
    // The probe itself is the existing bounded one: the private endpoint is refused without a request.
    const first = await check(free, free.owner);
    expect(first.status).toBe(200);
    expect((await first.json()).data).toMatchObject({ status: "failed", errorCode: "destination_denied" });
    for (let index = 0; index < 4; index++) expect((await check(free, free.owner)).status).toBe(200);
    const limited = await check(free, free.owner);
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toMatchObject({ code: "RATE_LIMITED" });
    expect(await checks(free)).toHaveLength(3 + 5);
  });

  it("spot check: needs 10 checked questions, is attributed, and managed workspaces keep the full review", async () => {
    const ids = free.cases.map((item) => item.revision_id);
    // Nine checked questions are not a spot check.
    const short = await approve(free, { review: { mode: "spot_check", checkedCaseRevisionIds: ids.slice(0, 9), approvedCaseRevisionIds: ids.slice(0, 9) } });
    expect(short.status).toBe(422);
    // Questions outside the set do not count.
    const foreign = await approve(free, { review: { mode: "spot_check", checkedCaseRevisionIds: [...ids.slice(0, 9), randomUUID()], approvedCaseRevisionIds: [] } });
    expect(foreign.status).toBe(422);
    expect((await owner.query("SELECT preparation_status FROM evals.evaluation WHERE id=$1", [free.evaluationId])).rows[0].preparation_status).toBe("needs_review");
    const checked = ids.slice(0, 10);
    const key = `approve-${randomUUID()}`;
    const ok = await approve(free, { review: { mode: "spot_check", checkedCaseRevisionIds: checked, approvedCaseRevisionIds: checked.slice(0, 8) } }, key);
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toMatchObject({ status: "ready", suiteVersionId: free.suiteVersionId, review: { mode: "spot_check", checked: 10, questions: 12 } });
    // A retry returns the same answer and writes nothing more.
    expect((await approve(free, { review: { mode: "spot_check", checkedCaseRevisionIds: checked, approvedCaseRevisionIds: checked.slice(0, 8) } }, key)).status).toBe(200);
    const audit = (await owner.query("SELECT actor_id,action,subject_id,details FROM evals.audit_event WHERE org_id=$1 AND action='suite.approved'", [free.orgId])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: free.actorId, subject_id: free.evaluationId, details: { suite_version_id: free.suiteVersionId, review_mode: "spot_check", question_count: 12 } });
    expect([...audit[0].details.checked_case_revision_ids].sort()).toEqual([...checked].sort());
    expect(audit[0].details.approved_case_revision_ids).toHaveLength(8);
    const request = (await owner.query("SELECT created_by FROM evals.evidence_request WHERE org_id=$1 AND route=$2", [free.orgId, `approve-suite/${free.evaluationId}`])).rows;
    expect(request).toEqual([{ created_by: free.actorId }]);
    expect((await owner.query("SELECT preparation_status,selected_suite_version_id FROM evals.evaluation WHERE id=$1", [free.evaluationId])).rows[0]).toEqual({ preparation_status: "ready", selected_suite_version_id: free.suiteVersionId });

    // Managed: a spot check is refused; the full review approves (recorded as such).
    const refused = await approve(managed, { review: { mode: "spot_check", checkedCaseRevisionIds: managed.cases.map((item) => item.revision_id), approvedCaseRevisionIds: [] } });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.code).toBe("REVIEW_REQUIRED");
    const full = await approve(managed, { review: { mode: "full", checkedCaseRevisionIds: [], approvedCaseRevisionIds: [] } });
    expect(full.status).toBe(200);
    const managedAudit = (await owner.query("SELECT actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action='suite.approved'", [managed.orgId])).rows;
    expect(managedAudit).toEqual([{ actor_id: managed.actorId, details: expect.objectContaining({ review_mode: "full", checked_case_revision_ids: [] }) }]);
  });

  it("pay as you go may spot-check; an approval without a review (older clients, the API) is a full review", async () => {
    const payg = await createFixture(owner, "payg");
    const ids = payg.cases.map((item) => item.revision_id).slice(0, 10);
    expect((await approve(payg, { review: { mode: "spot_check", checkedCaseRevisionIds: ids, approvedCaseRevisionIds: ids } })).status).toBe(200);
    const fixture = await createFixture(owner, "free");
    const response = await approve(fixture, {});
    expect(response.status).toBe(200);
    expect((await owner.query("SELECT details->>'review_mode' AS mode FROM evals.audit_event WHERE org_id=$1 AND action='suite.approved'", [fixture.orgId])).rows).toEqual([{ mode: "full" }]);
  });

  it("bulk removal from a draft is all or nothing, keeps one question and is audited", async () => {
    const fixture = await createFixture(owner, "free");
    // An editable draft: the frozen manifest with a new version id.
    const { content_hash: _hash, ...frozen } = (await owner.query("SELECT manifest FROM evals.suite_version WHERE id=$1", [fixture.suiteVersionId])).rows[0].manifest;
    void _hash;
    const draft = withContentHash({ ...frozen, suite_version_id: randomUUID() });
    await owner.query("UPDATE evals.suite SET draft=$2 WHERE id=$1", [fixture.suiteId, draft]);
    const remove = async (ids: string[], as = fixture.owner) => {
      identity.current = as;
      const { POST } = await import("@/app/api/evals/v1/suites/[id]/cases/remove/route");
      return POST(new Request(`http://localhost/api/evals/v1/suites/${fixture.suiteId}/cases/remove`, { method: "POST", headers, body: JSON.stringify({ orgId: fixture.orgId, caseRevisionIds: ids }) }));
    };
    const ids = fixture.cases.map((item) => item.revision_id);
    expect([403, 404]).toContain((await remove(ids.slice(0, 2), fixture.viewer)).status);
    expect((await remove([ids[0], randomUUID()])).status).toBe(404);
    expect((await remove(ids)).status).toBe(422);
    const ok = await remove(ids.slice(0, 3));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toMatchObject({ suiteId: fixture.suiteId, removed: 3 });
    const left = (await owner.query("SELECT draft FROM evals.suite WHERE id=$1", [fixture.suiteId])).rows[0].draft.case_revisions.map((item: { revision_id: string }) => item.revision_id);
    expect(left).toEqual(ids.slice(3));
    expect((await owner.query("SELECT actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action='suite.questions_removed'", [fixture.orgId])).rows).toEqual([
      { actor_id: fixture.actorId, details: expect.objectContaining({ case_revision_ids: ids.slice(0, 3) }) },
    ]);
  });
});
