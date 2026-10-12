import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPrefixedId } from "@/lib/operator/ids";
import { canonicalJson, sha256, withContentHash } from "@/lib/evals/contracts/hashing";
import { genericGroundedQaPack, syntheticAccountingFixture } from "@/lib/evals/generation/packs";
import { getEvalsPool, withTenant } from "@/lib/evals/repositories/db";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import type { OpsDigestData } from "@/lib/analytics/targets";

/**
 * Launch L-21 on the real schema: the sandbox and its basis record, the daily
 * cap and host rule, the policy triggers (ordinary questions, traffic limits,
 * labelled 30-day links), the explicit CRM draft, operator-only RLS, the
 * growth details and the weekly digest's numbers and once-a-week send.
 */
const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const SCHEDULER = "service:evals-scheduler";

describe.skipIf(!ownerUrl || !runtimeUrl)("prospect snapshots and the ops digest on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const suffix = randomUUID().slice(0, 8);
  let operator: EvalIdentity, admin: EvalIdentity, customer: EvalIdentity;
  let customerOrg: string, secondOrg: string, cohortOrg: string;
  let snapshotId: string, sandboxOrg: string;
  let token = "";
  let prospects: typeof import("@/lib/evals/repositories/prospects");
  let crm: typeof import("@/lib/evals/monitoring/crm");
  let managed: typeof import("@/lib/evals/repositories/managed");

  async function user(email: string, role?: "operator" | "platform_admin") {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Fixture", email]);
    if (role) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2)", [id, role]);
    return id;
  }
  async function workspace(name: string, ownerId: string, plan: "free" | "managed" = "free") {
    const id = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,$2,$3)", [id, name, ownerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [id, ownerId]);
    if (plan === "free") await owner.query("UPDATE evals.workspace_entitlement SET plan='free' WHERE org_id=$1", [id]);
    return id;
  }
  const input = (host: string) => ({ company: `Acme ${host}`, chatUrl: `https://chat-${host}-${suffix}.acme-seguros.es/ayuda?utm=x#chat`, helpUrl: `https://ayuda-${host}-${suffix}.acme-seguros.es/`, locale: "es" as const, basis: "public_information" as const });

  /** A frozen suite in the sandbox, built the way the engine stores one. */
  async function suite(orgId: string, projectId: string, count: number, tags: string[] = ["fees"]) {
    const actorId = operator.user.id;
    const { source } = syntheticAccountingFixture(actorId);
    const pack = genericGroundedQaPack({ source, authorId: actorId, questions: Array.from({ length: count }, (_, index) => ({ question: `What fee applies under policy A? (${index})`, expected: "10% service fee", anchor: source.anchors[0].id, severity: "medium" as const })) });
    const cases = pack.cases.map((item) => withContentHash({ ...item, tags }));
    const suiteId = randomUUID(), suiteVersionId = randomUUID();
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [pack.rubric.revision_id, orgId, projectId, pack.rubric.content_hash, pack.rubric]);
      await db.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Snapshot suite')", [suiteId, orgId, projectId]);
      for (const item of cases) {
        await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
        await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, pack.rubric.revision_id]);
      }
      const limits = { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 };
      const manifest = withContentHash({
        schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, title: "Snapshot suite", created_at: new Date().toISOString(),
        scope: { domain: "generic", languages: ["en"], jurisdictions: [], as_of: null, description: "Snapshot fixture" },
        execution_mode: "deployed_system", evidence_policy: "source_grounded",
        case_revisions: cases.map((item) => ({ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split, weight: item.weight })),
        source_revisions: [], rubric_revisions: [{ revision_id: pack.rubric.revision_id, content_hash: pack.rubric.content_hash }], fixture_revisions: [], output_schema_revisions: [], files: [],
        execution_policy: { limits, session: "fresh_per_case", retry: { max_attempts: 1, retryable_statuses: [], uncertain_outcome: "pause_for_review" } },
        scoring_policy: { metric_version: "fixture-v1", weighting: "case_weight", thresholds: { pass: 1, partial: 0.5 }, exclusions: ["unsupported"], review: "all", comparison: "paired_family" },
        sampling_plan: { procedure: "all", seed: 0, planned_repetitions: 1, stopping_rules: { max_cases: count, max_duration_ms: 60000, early_stopping: false } },
        visibility_policy: { cases: { candidate: true, judge: true, customer: true, public: false }, sources: { candidate: false, judge: true, customer: true, public: false }, rubrics: { candidate: false, judge: true, customer: false, public: false }, observations: { candidate: false, judge: true, customer: true, public: false }, assessments: { candidate: false, judge: true, customer: true, public: false }, allow_candidate_holdout: false, publication_consent_id: null },
        extensions: {},
      });
      await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
      for (const [ordinal, item] of cases.entries()) await db.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,$4)", [orgId, suiteVersionId, item.revision_id, ordinal]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    return suiteVersionId;
  }
  /** Insert a run as the engine would (the trigger checks it either way). */
  async function insertRun(orgId: string, evaluationId: string, targetRevisionId: string, suiteVersionId: string) {
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [operator.user.id, orgId]);
      const id = randomUUID();
      await db.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode) VALUES($1,$2,$3,$4,$5,'deployed_system')", [id, orgId, evaluationId, targetRevisionId, suiteVersionId]);
      await db.query("COMMIT");
      return id;
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  }
  const event = (name: string, at: string, values: { org?: string | null; session?: string; metadata?: Record<string, unknown> } = {}) =>
    owner.query("INSERT INTO public.product_analytics_event(id,event_name,event_category,source,session_id,metadata,org_id,occurred_at) VALUES($1,$2,'product','server',$3,$4,$5,$6)",
      [createPrefixedId("pa"), name, values.session ?? null, values.metadata ?? {}, values.org ?? null, at]);

  beforeAll(async () => {
    Object.assign(process.env, { EVALS_DATABASE_URL: runtimeUrl, ANALYTICS_EVENTS_V2: "true", PROSPECT_SNAPSHOTS_ENABLED: "true", PROSPECT_SNAPSHOT_DAILY_CAP: "3", PROSPECT_SNAPSHOT_MAX_QUESTIONS: "2" });
    await owner.query("DELETE FROM evals.prospect_snapshot_day");
    await owner.query("DELETE FROM public.product_analytics_event");
    const operatorId = await user(`operator-${suffix}@example.test`, "operator");
    const adminId = await user(`admin-${suffix}@example.test`, "platform_admin");
    const customerId = await user(`ana@foo-${suffix}.es`);
    customerOrg = await workspace("Foo SL", customerId);
    secondOrg = await workspace("Bar Ltd", await user(`bo@bar-${suffix}.co.uk`), "managed");
    cohortOrg = await workspace("Cohort SA", await user(`cy@cohort-${suffix}.es`));
    operator = { user: { id: operatorId, name: "Operator", email: "operator@example.test" }, platformRole: "operator", workspaces: [] };
    admin = { user: { id: adminId, name: "Admin", email: "admin@example.test" }, platformRole: "platform_admin", workspaces: [] };
    customer = { user: { id: customerId, name: "Ana", email: "ana@example.test" }, platformRole: null, workspaces: [{ id: customerOrg, name: "Foo SL", role: "owner" }] };
    prospects = await import("@/lib/evals/repositories/prospects");
    crm = await import("@/lib/evals/monitoring/crm");
    managed = await import("@/lib/evals/repositories/managed");
  });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("creates the sandbox, its basis record, limits and evaluation in one step, idempotently", async () => {
    const key = `snapshot-${randomUUID()}`;
    const created = await prospects.createProspectSnapshot(operator, input("one"), key);
    snapshotId = created.id; sandboxOrg = created.orgId;
    const row = (await owner.query("SELECT * FROM evals.prospect_snapshot WHERE id=$1", [snapshotId])).rows[0];
    expect(row).toMatchObject({ org_id: sandboxOrg, company: "Acme one", testing_basis: "public_information", locale: "es", created_by: operator.user.id,
      target_url: `https://chat-one-${suffix}.acme-seguros.es/ayuda`, target_host: `chat-one-${suffix}.acme-seguros.es`, help_host: `ayuda-one-${suffix}.acme-seguros.es` });
    expect(row.scope).toMatchObject({ questions: "ordinary", information: "public", adversarial: false, sharing: "private_link", public_naming: false });
    expect(row.traffic_limit).toEqual({ requests_per_minute: 4, concurrent_sessions: 1, max_questions: 2, runs_per_month: 3 });
    expect(row.evaluation_id && row.project_id && row.target_id).toBeTruthy();
    const limits = (await owner.query("SELECT max_systems,max_tests_per_set,max_runs_per_month,max_active_runs,allowed_connection_types,can_schedule FROM evals.workspace_entitlement WHERE org_id=$1", [sandboxOrg])).rows[0];
    expect(limits).toEqual({ max_systems: 1, max_tests_per_set: 2, max_runs_per_month: 3, max_active_runs: 1, allowed_connection_types: ["website"], can_schedule: false });
    const basis = (await owner.query("SELECT basis,scope,traffic_limit FROM evals.authorization_record WHERE org_id=$1", [sandboxOrg])).rows;
    expect(basis).toEqual([{ basis: "external_snapshot", scope: expect.objectContaining({ endpoint: row.target_url, adversarial: false, testing_basis: "public_information" }), traffic_limit: { requests_per_minute: 4, concurrent_sessions: 1 } }]);
    const evaluation = (await owner.query("SELECT selected_target_revision_id FROM evals.evaluation WHERE org_id=$1 AND id=$2", [sandboxOrg, row.evaluation_id])).rows[0];
    expect(evaluation.selected_target_revision_id).toBeTruthy();
    expect((await owner.query("SELECT start_url,page_limit FROM evals.website_source_job WHERE org_id=$1", [sandboxOrg])).rows).toEqual([{ start_url: row.help_url, page_limit: 10 }]);
    expect((await owner.query("SELECT status FROM evals.connection_check WHERE org_id=$1", [sandboxOrg])).rows).toEqual([{ status: "queued" }]);
    const target = (await owner.query("SELECT document FROM evals.target_revision WHERE org_id=$1", [sandboxOrg])).rows[0].document;
    expect(target).toMatchObject({ kind: "website", requests_per_minute: 4, concurrent_sessions: 1, endpoint: row.target_url });
    expect((await owner.query("SELECT action FROM evals.audit_event WHERE org_id=$1 ORDER BY action", [sandboxOrg])).rows.map((item) => item.action)).toEqual(expect.arrayContaining(["prospect_snapshot.created", "workspace.created"]));
    // A replay returns the same snapshot and does not use another slot.
    expect((await prospects.createProspectSnapshot(operator, input("one"), key)).id).toBe(snapshotId);
    expect((await owner.query("SELECT created FROM evals.prospect_snapshot_day")).rows).toEqual([{ created: 1 }]);
  }, 30000);

  it("enforces one snapshot per chat a day and the daily cap", async () => {
    await expect(prospects.createProspectSnapshot(operator, input("one"), `snapshot-${randomUUID()}`)).rejects.toMatchObject({ code: "SNAPSHOT_HOST_LIMIT", status: 429 });
    await prospects.createProspectSnapshot(operator, input("two"), `snapshot-${randomUUID()}`);
    await prospects.createProspectSnapshot(operator, input("three"), `snapshot-${randomUUID()}`);
    await expect(prospects.createProspectSnapshot(operator, input("four"), `snapshot-${randomUUID()}`)).rejects.toMatchObject({ code: "SNAPSHOT_DAILY_CAP", status: 429 });
    expect((await owner.query("SELECT created,cap FROM evals.prospect_snapshot_day")).rows).toEqual([{ created: 3, cap: 3 }]);
    expect((await owner.query("SELECT count(*)::int n FROM evals.prospect_snapshot")).rows[0].n).toBe(3);
  }, 30000);

  it("blocks adversarial packs and non-public addresses before anything is written", async () => {
    const before = (await owner.query("SELECT count(*)::int n FROM evals.workspace")).rows[0].n;
    for (const packId of ["prompt-injection", "jailbreak-suite", "red-team"]) {
      await expect(prospects.createProspectSnapshot(operator, { ...input("five"), packId }, `snapshot-${randomUUID()}`)).rejects.toMatchObject({ code: "SNAPSHOT_POLICY_BLOCKED", status: 422 });
    }
    await expect(prospects.createProspectSnapshot(operator, { ...input("five"), chatUrl: "http://chat.acme-seguros.es/" }, `snapshot-${randomUUID()}`)).rejects.toMatchObject({ status: 422 });
    await expect(prospects.createProspectSnapshot(operator, { ...input("five"), helpUrl: "https://10.0.0.8/faq" }, `snapshot-${randomUUID()}`)).rejects.toMatchObject({ status: 422 });
    expect((await owner.query("SELECT count(*)::int n FROM evals.workspace")).rows[0].n).toBe(before);
    // The testing basis of a snapshot cannot be recorded outside a sandbox.
    const project = (await withTenant({ orgId: customerOrg, actorId: customer.user.id }, async (db) => (await db.query("INSERT INTO evals.project(org_id,title) VALUES($1,'Own') RETURNING id", [customerOrg])).rows[0]));
    await expect(withTenant({ orgId: customerOrg, actorId: customer.user.id }, (db) => db.query("INSERT INTO evals.authorization_record(org_id,project_id,basis,scope,traffic_limit) VALUES($1,$2,'external_snapshot','{\"adversarial\":false}','{}')", [customerOrg, project.id])))
      .rejects.toThrow(/SNAPSHOT_POLICY_BLOCKED/);
  });

  it("keeps snapshots, details and digests to platform staff", async () => {
    const asCustomer = { orgId: customerOrg, actorId: customer.user.id };
    expect(await withTenant(asCustomer, async (db) => (await db.query("SELECT * FROM evals.prospect_snapshot")).rows)).toEqual([]);
    expect(await withTenant(asCustomer, async (db) => (await db.query("SELECT * FROM evals.prospect_snapshot_day")).rows)).toEqual([]);
    for (const sql of ["SELECT * FROM evals.ops_workspace_details()", "SELECT evals.ops_digest_data(now()-interval '7 days',now())", "SELECT evals.claim_ops_digest('2026-10-12')",
      "SELECT * FROM evals.create_prospect_snapshot('k-123456789','X','https://a.es/','a.es','https://b.es/','b.es','en','public_information',NULL,'{}','{}',5)"]) {
      await expect(withTenant(asCustomer, (db) => db.query(sql))).rejects.toThrow(/SCOPE_DENIED/);
    }
    await expect(prospects.listProspectSnapshots(customer)).rejects.toMatchObject({ status: 404 });
    await expect(prospects.getProspectSnapshot(customer, snapshotId)).rejects.toMatchObject({ status: 404 });
    // Staff read; nobody writes the basis record directly or deletes it.
    const asOperator = { orgId: "", actorId: operator.user.id };
    expect((await withTenant(asOperator, async (db) => (await db.query("SELECT id FROM evals.prospect_snapshot")).rows)).length).toBe(3);
    await expect(withTenant(asOperator, (db) => db.query("DELETE FROM evals.prospect_snapshot"))).rejects.toThrow(/permission denied/);
    await expect(withTenant(asOperator, (db) => db.query("UPDATE evals.prospect_snapshot SET testing_basis='owner_permission'"))).rejects.toThrow(/permission denied/);
    await expect(withTenant(asOperator, (db) => db.query("SELECT evals.claim_ops_digest('2026-10-12')"))).rejects.toThrow(/SCOPE_DENIED/);
    process.env.PROSPECT_SNAPSHOTS_ENABLED = "false";
    await expect(prospects.listProspectSnapshots(operator)).rejects.toMatchObject({ status: 404 });
    process.env.PROSPECT_SNAPSHOTS_ENABLED = "true";
  });

  it("runs only ordinary questions within the recorded traffic limits", async () => {
    const row = (await owner.query("SELECT project_id,evaluation_id,target_id FROM evals.prospect_snapshot WHERE id=$1", [snapshotId])).rows[0];
    const targetRevision = (await owner.query("SELECT id,document FROM evals.target_revision WHERE org_id=$1 AND target_id=$2", [sandboxOrg, row.target_id])).rows[0];
    const adversarial = await suite(sandboxOrg, row.project_id, 2, ["fees", "Prompt injection"]);
    await expect(insertRun(sandboxOrg, row.evaluation_id, targetRevision.id, adversarial)).rejects.toThrow(/SNAPSHOT_POLICY_BLOCKED/);
    const tooMany = await suite(sandboxOrg, row.project_id, 3);
    await expect(insertRun(sandboxOrg, row.evaluation_id, targetRevision.id, tooMany)).rejects.toThrow(/SNAPSHOT_POLICY_BLOCKED/);
    const ordinary = await suite(sandboxOrg, row.project_id, 2);
    const fast = { ...targetRevision.document, target_revision_id: randomUUID(), requests_per_minute: 30 };
    await owner.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [fast.target_revision_id, sandboxOrg, row.target_id, sha256(canonicalJson(fast)), fast]);
    await expect(insertRun(sandboxOrg, row.evaluation_id, fast.target_revision_id, ordinary)).rejects.toThrow(/SNAPSHOT_POLICY_BLOCKED/);
    const runId = await insertRun(sandboxOrg, row.evaluation_id, targetRevision.id, ordinary);
    expect(runId).toBeTruthy();
    // The API maps the trigger to a 422 with guidance.
    const { inputError } = await import("@/lib/evals/domain/errors");
    expect(inputError(new Error("SNAPSHOT_POLICY_BLOCKED"))).toMatchObject({ code: "SNAPSHOT_POLICY_BLOCKED", status: 422 });
    // A published report for the run (as the engine would publish it).
    const reportId = randomUUID(), revisionId = randomUUID();
    const snapshot = { schema_version: "1.0", report_revision_id: revisionId, run_id: runId, created_at: new Date().toISOString(), content_hash: "c".repeat(64),
      system: { name: "chat", target_revision_id: targetRevision.id, purpose: "Support", execution_mode: "deployed_system" },
      metrics: { n_planned: 8, n_scorable: 8, n_pass: 5, n_partial: 2, n_fail: 1, strict_pass_rate: 0.625 },
      findings: [{ id: "f1", title: "Refund window stated as 14 days instead of 30", severity: "high" }, { id: "f2", title: "Missing opening hours", severity: "low" }], results: [] };
    await owner.query("INSERT INTO evals.report(id,org_id,project_id,title) VALUES($1,$2,$3,'Snapshot report')", [reportId, sandboxOrg, row.project_id]);
    await owner.query("INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status) VALUES($1,$2,$3,$4,$5,$6,'preliminary')", [revisionId, sandboxOrg, reportId, runId, snapshot.content_hash, snapshot]);
    await owner.query("UPDATE evals.report SET current_revision_id=$3,publication_status='published' WHERE org_id=$1 AND id=$2", [sandboxOrg, reportId, revisionId]);
  }, 30000);

  it("makes a labelled 30-day link, replaces and expires it", async () => {
    await expect(crm.createSnapshotCrmDraft(operator.user.id, snapshotId, { locale: "es", linkedin: "Hola", emailSubject: "Asunto", emailBody: "Cuerpo" })).rejects.toMatchObject({ code: "SHARE_REQUIRED", status: 409 });
    const detail = await prospects.getProspectSnapshot(operator, snapshotId);
    expect(detail.report).toMatchObject({ reviewStatus: "preliminary", metrics: { scored: 8, pass: 5, partial: 2, fail: 1 }, finding: "Refund window stated as 14 days instead of 30" });
    expect(detail.weak).toBe(false);
    expect(detail.outreach?.es.linkedin).toContain("5 bien, 2 incompletas y 1 incorrectas");
    const first = await prospects.shareProspectSnapshot(operator, snapshotId, randomUUID());
    expect(first).toMatchObject({ label: "external_snapshot", token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    const days = (new Date(first.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThanOrEqual(30);
    const context = await managed.resolveShareWithContext(first.token!, randomUUID());
    expect(context.share).toMatchObject({ label: "external_snapshot" });
    expect(new Date(context.share.expiresAt!).getTime()).toBe(new Date(first.expiresAt).getTime());
    // Any other share of a sandbox report is clamped to 30 days and must be a bearer link.
    const scope = { orgId: sandboxOrg, actorId: operator.user.id };
    const revision = detail.report!.revisionId;
    const long = await managed.createShare(scope, { reportRevisionId: revision, audience: "bearer", expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(), permittedFields: ["metrics"] }, randomUUID());
    const stored = (await owner.query("SELECT label,expires_at FROM evals.share_grant WHERE id=$1", [long.id])).rows[0];
    expect(stored.label).toBe("external_snapshot");
    expect(new Date(stored.expires_at).getTime()).toBeLessThanOrEqual(Date.now() + 30 * 86_400_000 + 1000);
    await expect(managed.createShare(scope, { reportRevisionId: revision, audience: "workspace", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), permittedFields: ["metrics"] }, randomUUID())).rejects.toThrow(/SNAPSHOT_POLICY_BLOCKED/);
    await managed.revokeShare(scope, long.id);
    // A new link replaces the previous one.
    const second = await prospects.shareProspectSnapshot(operator, snapshotId, randomUUID());
    expect(second.shareId).not.toBe(first.shareId);
    await expect(managed.resolveShareWithContext(first.token!, randomUUID())).rejects.toMatchObject({ status: 404 });
    token = second.token!;
    expect((await managed.resolveShareWithContext(token, randomUUID())).report).toHaveProperty("metrics");
    expect((await owner.query("SELECT count(*)::int n FROM evals.crm_handoff_draft WHERE org_id=$1", [sandboxOrg])).rows[0].n).toBe(0);
  }, 30000);

  it("creates the CRM draft only on an explicit call, without the link token", async () => {
    const link = `https://app.caudals.com/share#token=${token}`;
    const draft = await crm.createSnapshotCrmDraft(operator.user.id, snapshotId, { locale: "es", linkedin: `Hola {nombre}: informe privado: ${link}.`, emailSubject: "Acme: una respuesta", emailBody: `Informe: ${link}\nSi prefieres que no te escribamos más, responde «no».` });
    expect(draft.created).toBe(true);
    expect(draft.summary).toMatchObject({ status: "draft_for_operator_review", kind: "external_snapshot", destination: "warmbly", sent: false, company: "Acme one",
      testing_basis: "public_information", share: { label: "external_snapshot" }, outreach: { locale: "es", linkedin: "Hola {nombre}: informe privado: {link}." } });
    expect(JSON.stringify(draft.summary)).not.toContain(token);
    const again = await crm.createSnapshotCrmDraft(operator.user.id, snapshotId, { locale: "en", linkedin: "Hi", emailSubject: "S", emailBody: "B" });
    expect(again).toMatchObject({ id: draft.id, created: false });
    expect((await owner.query("SELECT crm_draft_id FROM evals.prospect_snapshot WHERE id=$1", [snapshotId])).rows[0].crm_draft_id).toBe(draft.id);
    // Expiry ends the link without touching the draft.
    await owner.query("UPDATE evals.share_grant SET expires_at=now()-interval '1 minute' WHERE org_id=$1 AND revoked_at IS NULL", [sandboxOrg]);
    await expect(managed.resolveShareWithContext(token, randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it("computes the digest and growth details from fixtures, without sandboxes", async () => {
    const at = (iso: string) => new Date(iso).toISOString();
    for (const [session, when] of [["s1", "2026-10-05T09:00:00+02:00"], ["s1", "2026-10-05T09:01:00+02:00"], ["s2", "2026-10-07T10:00:00+02:00"], ["s3", "2026-10-11T23:30:00+02:00"], ["s3", "2026-10-11T23:31:00+02:00"]]) {
      await event("page_view", at(when), { session });
    }
    await event("page_view", at("2026-10-12T00:30:00+02:00"), { session: "s9" }); // the next week
    for (const [outcome, duration, error] of [["done", 100, null], ["done", 300, null], ["done", 200, null], ["failed", 40, "site_thin"]] as const) {
      await event("demo_started", at("2026-10-06T12:00:00+02:00"));
      await event("demo_finished", at("2026-10-06T12:05:00+02:00"), { metadata: { outcome, duration_s: duration, ...(error ? { error_code: error } : {}) } });
    }
    await event("account_created", at("2026-10-08T09:00:00+02:00"), { org: customerOrg, metadata: { acquisition: "demo" } });
    await event("account_created", at("2026-10-09T09:00:00+02:00"), { org: secondOrg, metadata: { acquisition: "direct" } });
    await event("run_started", at("2026-10-09T10:00:00+02:00"), { org: secondOrg });
    // Created the week before; activated within seven days.
    await event("account_created", at("2026-10-01T09:00:00+02:00"), { org: cohortOrg, metadata: { acquisition: "direct" } });
    await event("report_viewed", at("2026-10-03T09:00:00+02:00"), { org: cohortOrg });
    // Our own sandbox activity never counts.
    await event("account_created", at("2026-10-08T10:00:00+02:00"), { org: sandboxOrg });
    await event("run_started", at("2026-10-08T10:00:00+02:00"), { org: sandboxOrg });
    // A pay-as-you-go account with no credits left (no balance change: the ledger stays consistent).
    await owner.query("UPDATE billing.credit_account SET billing_mode='credits' WHERE org_id=$1", [customerOrg]);
    await owner.query("UPDATE evals.run SET updated_at=now()-interval '3 hours' WHERE org_id=$1", [sandboxOrg]);

    const data = await withTenant({ orgId: "", actorId: SCHEDULER }, async (db) =>
      (await db.query("SELECT evals.ops_digest_data($1,$2) AS data", ["2026-10-04T22:00:00Z", "2026-10-11T22:00:00Z"])).rows[0].data as OpsDigestData);
    expect(data.funnel).toMatchObject({ sessions: 3, page_views: 5, demo_starts: 4, demo_finished: 4, demo_succeeded: 3, demo_p50_s: 200, new_accounts: 2,
      activation_cohort: 1, activation_activated: 1, runs_started: 1, paying_customers: 0, purchases_recorded: false, credits_sold: null });
    expect(data.demo_failures).toEqual([{ reason: "site_thin", count: 1 }]);
    expect(data.stuck_run_count).toBe(1);
    expect(data.stuck_runs[0]).toMatchObject({ orgId: sandboxOrg, status: "queued" });
    expect(data.old_holds).toEqual([]);
    expect(data.low_balance).toEqual([{ orgId: customerOrg, workspace: "Foo SL", credits: 0 }]);
    expect(data.signups.map((row) => [row.company, row.domain, row.source, row.stage])).toEqual([
      ["Bar Ltd", `bar-${suffix}.co.uk`, "direct", "run_started"], ["Foo SL", `foo-${suffix}.es`, "demo", "account_created"]]);
    expect(JSON.stringify(data)).not.toMatch(/@/);

    const details = await withTenant({ orgId: "", actorId: admin.user.id }, async (db) => (await db.query("SELECT * FROM evals.ops_workspace_details()")).rows);
    const byOrg = new Map(details.map((row) => [row.org_id, row]));
    expect(byOrg.get(customerOrg)).toMatchObject({ kind: "free", plan: "free", billing_mode: "credits", available_credits: "0.00", credits_bought: null, owner_domain: `foo-${suffix}.es` });
    expect(byOrg.get(secondOrg)).toMatchObject({ kind: "client", plan: "managed", credits_bought: null });
    expect(byOrg.get(sandboxOrg)).toMatchObject({ kind: "snapshot", connection_kind: "website", latest_score: "0.6250", latest_scored: 8 });
    // An operator sees only the workspaces it belongs to (its sandboxes).
    const own = await withTenant({ orgId: "", actorId: operator.user.id }, async (db) => (await db.query("SELECT org_id,kind FROM evals.ops_workspace_details()")).rows);
    expect(own.every((row) => row.kind === "snapshot")).toBe(true);
    const { getGrowth } = await import("@/lib/analytics/growth");
    const growth = await getGrowth(admin);
    expect(growth.accounts.map((row) => row.orgId)).not.toContain(sandboxOrg);
    expect(growth.accounts.find((row) => row.orgId === customerOrg)).toMatchObject({ company: "Foo SL", emailDomain: `foo-${suffix}.es`, creditsBought: null, plan: "free", hasReport: false });
  }, 30000);

  it("sends the Monday digest once, to the given internal address only", async () => {
    const { runOpsDigest } = await import("@/lib/evals/operations/ops-digest");
    const send = vi.fn(async () => ({ id: "email-1" }));
    const options = { actorId: SCHEDULER, send, to: "ops@example.test", appUrl: "https://app.caudals.com" };
    expect(await runOpsDigest({ ...options, now: new Date("2026-10-12T05:59:00Z") })).toMatchObject({ status: "not_due" });
    expect(await runOpsDigest({ ...options, now: new Date("2026-10-13T09:00:00Z") })).toMatchObject({ status: "not_due" });
    const sent = await runOpsDigest({ ...options, now: new Date("2026-10-12T06:30:00Z") });
    expect(sent).toMatchObject({ status: "sent", week: "2026-10-12", summary: { sessions: 3, demo_starts: 4, new_accounts: 2, stuck_runs: 1, low_balance: 1, signups: 2 } });
    expect(send).toHaveBeenCalledTimes(1);
    const message = (send.mock.calls[0] as unknown as [{ to: string; subject: string; text: string; idempotencyKey: string }])[0];
    expect(message).toMatchObject({ to: "ops@example.test", subject: "Caudals weekly digest · 5 Oct – 11 Oct", idempotencyKey: "ops-digest-2026-10-12" });
    expect(message.text).toContain("- Demo success: 75 % (3 of 4) / ≥ 85 %");
    expect(message.text).toContain("- Activation (own report within 7 days): 100 % (1 of 1) / 30 %");
    expect(await runOpsDigest({ ...options, now: new Date("2026-10-12T09:00:00Z") })).toMatchObject({ status: "already_claimed" });
    expect(send).toHaveBeenCalledTimes(1);
    const record = (await owner.query("SELECT status,provider_id,summary,claimed_by FROM evals.ops_digest_send WHERE week_start='2026-10-12'")).rows[0];
    expect(record).toMatchObject({ status: "sent", provider_id: "email-1", claimed_by: SCHEDULER, summary: { demo_starts: 4 } });
    // A failed send is retried after 15 minutes, never twice in parallel.
    const failing = vi.fn(async () => { throw new Error("provider down"); });
    expect(await runOpsDigest({ ...options, send: failing, now: new Date("2026-10-19T06:30:00Z") })).toMatchObject({ status: "failed", reason: "email_failed" });
    expect(await runOpsDigest({ ...options, now: new Date("2026-10-19T06:35:00Z") })).toMatchObject({ status: "already_claimed" });
    await owner.query("UPDATE evals.ops_digest_send SET claimed_at=now()-interval '20 minutes' WHERE week_start='2026-10-19'");
    expect(await runOpsDigest({ ...options, now: new Date("2026-10-19T06:55:00Z") })).toMatchObject({ status: "sent" });
    expect((await owner.query("SELECT status,attempts FROM evals.ops_digest_send WHERE week_start='2026-10-19'")).rows[0]).toEqual({ status: "sent", attempts: 2 });
    // Leave shared fixture state as other suites expect it.
    await owner.query("UPDATE evals.run SET updated_at=now() WHERE org_id=$1", [sandboxOrg]);
    await owner.query("UPDATE billing.credit_account SET billing_mode='free' WHERE org_id=$1", [customerOrg]);
  }, 30000);

  it("refuses the rollback while snapshots exist", async () => {
    const sql = readFileSync(path.resolve(__dirname, "../../db/rollbacks/090_evals_prospect_snapshots_down.sql"), "utf8");
    await expect(owner.query(sql)).rejects.toThrow(/Rollback blocked/);
    expect((await owner.query("SELECT to_regclass('evals.prospect_snapshot') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });
});
