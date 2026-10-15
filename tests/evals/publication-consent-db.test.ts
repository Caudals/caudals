/**
 * Opt-in public results pages and the anonymous sector index on the real
 * schema (launch L-31, migration 104). Nothing renders without a standing
 * written consent and the founder's publication; a withdrawn consent takes
 * the page down at once; our own snapshots of third parties can never be
 * published; the index takes only consenting customers and sector-assigned
 * snapshots, with no identifiers, suppresses cohorts under 10 and needs a
 * recorded legal sign-off.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { createPrefixedId } from "@/lib/operator/ids";
import { CONSENT_VERSION } from "@/lib/publication/contracts";
import { aggregateSectorIndex, publishableSectors, type SectorIndexInput } from "@/lib/publication/sector-index";

const identity = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => identity.current!,
}));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const SECRET = `customer-content-${randomUUID()}`;
type User = { id: string; name: string; email: string };

describe.skipIf(!ownerUrl || !runtimeUrl)("publication consent and the anonymous index (launch L-31)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 2 });
  const headers = { host: "localhost", origin: "http://localhost", "content-type": "application/json" };
  const route = () => import("@/app/api/evals/v1/reports/[id]/publication/route");
  const call = (reportId: string, method: "GET" | "POST" | "PATCH", body?: unknown, orgId?: string) =>
    new Request(`http://localhost/api/evals/v1/reports/${reportId}/publication${orgId ? `?orgId=${orgId}` : ""}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let admin: User;

  async function person(name: string, platformRole?: "platform_admin"): Promise<User> {
    const id = createPrefixedId("au");
    const email = `${randomUUID()}@example.test`;
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, name, email]);
    if (platformRole) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2)", [id, platformRole]);
    return { id, name, email };
  }

  /**
   * One system with a published report revision. Fixture rows only: they are
   * written with triggers and foreign keys off (session_replication_role), so
   * a run needs no real test set. Every function under test runs normally.
   */
  async function system(options: {
    members?: Array<[User, "owner" | "editor" | "viewer" | "operator"]>; host?: string; pass?: number; partial?: number; fail?: number; planned?: number;
    headline?: "complete" | "incomplete"; publishedAt?: string; sandbox?: { company: string; sector?: string | null };
  } = {}) {
    const orgId = randomUUID(), targetId = randomUUID(), targetRevisionId = randomUUID(), runId = randomUUID(), reportId = randomUUID(), revisionId = randomUUID();
    const pass = options.pass ?? 30, partial = options.partial ?? 5, fail = options.fail ?? 10;
    const scored = pass + partial + fail, planned = options.planned ?? scored + 2;
    const host = options.host ?? `chat-${randomUUID().slice(0, 8)}.example.test`;
    const publishedAt = options.publishedAt ?? new Date().toISOString();
    const members = options.members ?? [];
    const snapshot = {
      schema_version: "1.0", report_revision_id: revisionId, run_id: runId, created_at: publishedAt, content_hash: "0".repeat(64),
      system: { name: `${SECRET} system`, target_revision_id: targetRevisionId, purpose: `${SECRET} purpose`, execution_mode: "deployed_system" },
      scope: { suite_version_id: randomUUID(), evidence_policy: "source_grounded", started_at: "2026-08-14T08:00:00.000Z", finished_at: "2026-08-14T09:30:00.000Z", languages: ["es", "not a language"], review_status: "preliminary" },
      metrics: { n_planned: planned, n_eligible: planned, n_executed: planned, n_scorable: scored, n_pass: pass, n_partial: partial, n_fail: fail, n_unscorable: planned - scored, n_pending: 0, n_unresolved: 0,
        strict_pass_rate: scored ? pass / scored : null, rubric_score: null, assessed_coverage: scored / planned, execution_completion: 1, pass_bounds: null,
        wilson_interval: scored ? { low: 0.5, high: 0.8 } : null, family_cluster_interval: null, critical_unassessed: 0, headline_status: options.headline ?? "complete" },
      findings: [{ id: "f1", title: `${SECRET} finding`, severity: "high", evidence_strength: "strong", frequency_n: 1, frequency_denominator: 1, observation: SECRET, cause_hypothesis: null, recommendation: SECRET, assessment_ids: ["a1"] }],
      results: [{ case_revision_id: "c1", title: `${SECRET} question`, topic: "t", severity: "high", outcome: "fail", assessment_id: "a1", observation_id: "o1", input: `${SECRET} input`, output: `${SECRET} answer`, rationale: SECRET, source_refs: [], review_status: "preliminary" }],
      improvements: [], takeaways: [],
      methodology: { cef_version: "1.0", scorer_version: "strict-v1", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "all", exclusions: [], review_coverage: "none", cost: null, limitations: [] },
    };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL session_replication_role = replica");
      const creator = members[0]?.[0].id ?? admin.id;
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,$2,$3)", [orgId, `${SECRET} workspace`, creator]);
      for (const [member, role] of members) await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,$3)", [orgId, member.id, role]);
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title,created_by) VALUES($1,$2,$3,'Chat',$4)", [targetId, orgId, randomUUID(), creator]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document,created_by) VALUES($1,$2,$3,$4,$5,$6)",
        [targetRevisionId, orgId, targetId, createHash("sha256").update(targetRevisionId).digest("hex"), { kind: "website", endpoint: `https://${host}/help` }, creator]);
      await db.query("INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase,created_by) VALUES($1,$2,$3,$4,$5,'deployed_system','completed','done',$6)",
        [runId, orgId, randomUUID(), targetRevisionId, randomUUID(), creator]);
      await db.query("INSERT INTO evals.report(id,org_id,project_id,title,publication_status,current_revision_id,created_by) VALUES($1,$2,$3,'Report','published',$4,$5)", [reportId, orgId, randomUUID(), revisionId, creator]);
      // As every publish path does (publishReport, the reviewed revision of an expert order): the revision becomes
      // the report's current one and a "report published" notice is written; report_revision.published_at stays NULL.
      await db.query("INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,'preliminary',$7,$8)",
        [revisionId, orgId, reportId, runId, createHash("sha256").update(revisionId).digest("hex"), snapshot, creator, publishedAt]);
      await db.query("INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at,created_at) VALUES($1,$2,'report_published','workspace','{}','delivered',$3,$3)",
        [orgId, `report:${reportId}:${revisionId}:published`, publishedAt]);
      let snapshotId: string | null = null;
      if (options.sandbox) {
        snapshotId = randomUUID();
        await db.query(`INSERT INTO evals.prospect_snapshot(id,org_id,request_key,company,target_url,target_host,help_url,help_host,locale,testing_basis,scope,traffic_limit,madrid_day,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$6,'es','public_information',$8,$9,current_date,$10)`,
        [snapshotId, orgId, `key-${randomUUID()}`, options.sandbox.company, `https://${host}/help`, host, `https://${host}/`,
          { adversarial: false, questions: "ordinary", information: "public", sharing: "private_link", public_naming: false },
          { requests_per_minute: 4, concurrent_sessions: 1, max_questions: 10, runs_per_month: 3 }, admin.id]);
      }
      await db.query("COMMIT");
      if (snapshotId && options.sandbox?.sector) await asActor(admin.id, null, (client) => client.query("SELECT * FROM evals.set_snapshot_index_sector($1,$2)", [snapshotId, options.sandbox!.sector]));
      return { orgId, reportId, revisionId, snapshotId, host };
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }
  }

  /** Runs SQL as the web runtime role (NOBYPASSRLS) for one actor, committed. */
  async function asActor<T>(actor: string, orgId: string | null, work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await runtime.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.org_id',$1,true),set_config('evals.actor_id',$2,true)", [orgId ?? "", actor]);
      const result = await work(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }
  }

  const consentSql = `SELECT * FROM evals.record_publication_consent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`;
  const indexConsent = (orgId: string, revisionId: string, sector = "insurance") =>
    [orgId, revisionId, false, true, null, null, sector, "Olga Owner", "CEO", CONSENT_VERSION, "es", `req-${randomUUID()}`, "in_app", null, null];
  function as(user: User, orgId: string, role: EvalIdentity["workspaces"][number]["role"], platformRole: EvalIdentity["platformRole"] = null) {
    identity.current = { user, platformRole, workspaces: [{ id: orgId, name: "Fixture", role }] };
  }
  const json = async (response: Response) => ({ status: response.status, body: await response.json() });
  const publicView = async (slug: string) => (await asActor("public:results", null, (db) => db.query("SELECT * FROM evals.public_result_page_view($1)", [slug]))).rows;

  beforeAll(async () => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    vi.stubEnv("DATABASE_URL", runtimeUrl!);
    vi.stubEnv("PUBLIC_RESULTS_ENABLED", "true");
    admin = await person("Founder", "platform_admin");
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await owner.end();
    await runtime.end();
    const { getEvalsPool } = await import("@/lib/evals/repositories/db");
    await getEvalsPool().end();
  });

  it("records an owner's written consent once, and nothing is public until the founder publishes", async () => {
    const ana = await person("Ana Owner"), eddie = await person("Eddie Editor");
    const fixture = await system({ members: [[ana, "owner"], [eddie, "editor"]] });
    const { GET, POST } = await route();
    const body = (requestId: string, extra: Record<string, unknown> = {}) => ({
      orgId: fixture.orgId, revisionId: fixture.revisionId, resultsPage: true, sectorIndex: true, publicName: "Gestoría Ejemplo",
      scopeSummary: "Questions about invoices and VAT from our help centre, in Spanish.", indexSector: "fiscal_accounting_payroll",
      signerName: "Ana Owner", signerRole: "CEO", version: CONSENT_VERSION, locale: "es", accepted: true, requestId, ...extra,
    });

    as(ana, fixture.orgId, "owner");
    const before = await json(await GET(call(fixture.reportId, "GET", undefined, fixture.orgId)));
    expect(before).toMatchObject({ status: 200, body: { data: { canConsent: true, version: CONSENT_VERSION, consents: [] } } });
    const requestId = `req-${randomUUID()}`;
    const recorded = await json(await POST(call(fixture.reportId, "POST", body(requestId))));
    expect(recorded.status).toBe(200);
    const consent = recorded.body.data.consents[0];
    expect(consent).toMatchObject({ revisionId: fixture.revisionId, resultsPage: true, sectorIndex: true, indexSector: "fiscal_accounting_payroll", method: "in_app",
      signer: { name: "Ana Owner", role: "CEO" }, version: CONSENT_VERSION, revokedAt: null, page: null });
    // A retry returns the same record; a second consent for the same revision is refused.
    expect((await json(await POST(call(fixture.reportId, "POST", body(requestId))))).body.data.consents.map((item: { id: string }) => item.id)).toEqual([consent.id]);
    expect(await json(await POST(call(fixture.reportId, "POST", body(`req-${randomUUID()}`))))).toMatchObject({ status: 409, body: { error: { code: "CONSENT_EXISTS" } } });
    // The consent must be explicit and versioned.
    expect((await POST(call(fixture.reportId, "POST", body(`req-${randomUUID()}`, { accepted: false })))).status).toBe(400);
    expect((await POST(call(fixture.reportId, "POST", body(`req-${randomUUID()}`, { version: "2026-01-01" })))).status).toBe(400);
    // Editors neither see nor give consent.
    as(eddie, fixture.orgId, "editor");
    expect((await GET(call(fixture.reportId, "GET", undefined, fixture.orgId))).status).toBe(404);
    expect((await POST(call(fixture.reportId, "POST", body(`req-${randomUUID()}`)))).status).toBe(404);
    // An administrator reads it but never consents for a customer in the app.
    as(admin, fixture.orgId, "operator", "platform_admin");
    expect((await json(await GET(call(fixture.reportId, "GET", undefined, fixture.orgId)))).body.data.canConsent).toBe(false);

    const audit = (await owner.query("SELECT actor_id, details FROM evals.audit_event WHERE org_id=$1 AND action='publication.consent_recorded'", [fixture.orgId])).rows;
    expect(audit).toEqual([{ actor_id: ana.id, details: expect.objectContaining({ method: "in_app", consent_version: CONSENT_VERSION, signer: { name: "Ana Owner", role: "CEO" } }) }]);
    // Consent alone publishes nothing.
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.public_result_page WHERE org_id=$1", [fixture.orgId])).rows[0].n).toBe(0);
    const { getPublicResultPage } = await import("@/lib/publication/store");
    expect(await getPublicResultPage("gestoria-ejemplo")).toBeNull();
  });

  it("lets only a platform administrator publish, freezes a projection without report content, and revocation takes it down", async () => {
    const olga = await person("Olga Owner");
    const fixture = await system({ members: [[olga, "owner"]] });
    const consent = (await asActor(olga.id, fixture.orgId, (db) => db.query(consentSql,
      [fixture.orgId, fixture.revisionId, true, false, "Seguros Ejemplo", "Questions about home insurance claims, in Spanish.", null, "Olga Owner", "CEO", CONSENT_VERSION, "es", `req-${randomUUID()}`, "in_app", null, null]))).rows[0];
    const slug = `seguros-ejemplo-${randomUUID().slice(0, 6)}`;
    const publish = (actor: string, note = "Checked the name, scope and figures against the report.", pageSlug = slug) =>
      asActor(actor, null, (db) => db.query("SELECT * FROM evals.publish_result_page($1,$2,$3)", [consent.id, pageSlug, note]));

    await expect(publish(olga.id)).rejects.toThrow("SCOPE_DENIED");
    await expect(publish(admin.id, "short")).rejects.toThrow("INPUT_INVALID");
    await expect(publish(admin.id, undefined, "Not A Slug")).rejects.toThrow("INPUT_INVALID");
    const page = (await publish(admin.id)).rows[0];
    expect(Object.keys(page.projection).sort()).toEqual([
      "consented_on", "correct", "incorrect", "interval_high", "interval_low", "languages", "not_scored", "partial", "pass_rate", "public_name",
      "questions", "report_published_at", "review_status", "schema", "scope_summary", "scored", "scorer_version", "tested_from", "tested_to",
    ]);
    expect(page.projection).toMatchObject({ public_name: "Seguros Ejemplo", questions: 47, scored: 45, correct: 30, partial: 5, incorrect: 10, not_scored: 2, languages: ["es"] });
    expect(JSON.stringify(page.projection)).not.toContain(SECRET);
    await expect(publish(admin.id)).rejects.toThrow("PAGE_EXISTS");

    const { getPublicResultPage } = await import("@/lib/publication/store");
    const live = await getPublicResultPage(slug);
    expect(live?.projection.public_name).toBe("Seguros Ejemplo");
    const resultsRoute = await import("@/app/[locale]/results/[slug]/page");
    expect(await resultsRoute.default({ params: Promise.resolve({ locale: "es", slug }) })).toBeTruthy();

    // The owner withdraws consent: the page goes down in the same transaction.
    const { PATCH } = await route();
    as(olga, fixture.orgId, "owner");
    const revoked = await json(await PATCH(call(fixture.reportId, "PATCH", { orgId: fixture.orgId, consentId: consent.id, reason: "We changed our minds." })));
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.consents[0]).toMatchObject({ id: consent.id, revokedAt: expect.any(String), page: { slug, unpublishedAt: expect.any(String) } });
    expect(await publicView(slug)).toEqual([]);
    expect(await getPublicResultPage(slug)).toBeNull();
    await expect(resultsRoute.default({ params: Promise.resolve({ locale: "es", slug }) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    // A withdrawn consent cannot be published again, and its address is never reused.
    await expect(publish(admin.id, undefined, `${slug}-2`)).rejects.toThrow("CONSENT_REQUIRED");
    // The records stay: they change once and are never deleted.
    await expect(owner.query("UPDATE evals.publication_consent SET revoked_at=NULL, revoked_by=NULL WHERE id=$1", [consent.id])).rejects.toThrow(/changes only once/);
    await expect(owner.query("DELETE FROM evals.publication_consent WHERE id=$1", [consent.id])).rejects.toThrow(/permanent/);
    await expect(owner.query("UPDATE evals.public_result_page SET unpublished_at=NULL, unpublished_by=NULL, unpublish_reason=NULL WHERE slug=$1", [slug])).rejects.toThrow(/changes only once/);
    const actions = (await owner.query("SELECT action FROM evals.audit_event WHERE org_id=$1 AND action LIKE 'publication.%' ORDER BY created_at", [fixture.orgId])).rows.map((row) => row.action);
    expect(actions).toEqual(["publication.consent_recorded", "publication.page_published", "publication.consent_revoked"]);
  });

  it("hides a page when the workspace is deleted or the report withdrawn, and refuses thin evidence", async () => {
    const otto = await person("Otto Owner");
    const consented = async (fixture: Awaited<ReturnType<typeof system>>) => (await asActor(otto.id, fixture.orgId, (db) => db.query(consentSql,
      [fixture.orgId, fixture.revisionId, true, false, "Otto SL", "Questions about energy bills, in Spanish.", null, "Otto Owner", "CEO", CONSENT_VERSION, "es", `req-${randomUUID()}`, "in_app", null, null]))).rows[0];
    const publish = (consentId: string, slug: string) => asActor(admin.id, null, (db) => db.query("SELECT * FROM evals.publish_result_page($1,$2,'Checked against the report by hand.')", [consentId, slug]));

    const deleted = await system({ members: [[otto, "owner"]] });
    const deletedSlug = `otto-${randomUUID().slice(0, 6)}`;
    await publish((await consented(deleted)).id, deletedSlug);
    expect(await publicView(deletedSlug)).toHaveLength(1);
    await owner.query("UPDATE evals.workspace SET deleted_at=now() WHERE id=$1", [deleted.orgId]);
    expect(await publicView(deletedSlug)).toEqual([]);

    const withdrawn = await system({ members: [[otto, "owner"]] });
    const withdrawnSlug = `otto-${randomUUID().slice(0, 6)}`;
    await publish((await consented(withdrawn)).id, withdrawnSlug);
    await owner.query("UPDATE evals.report SET publication_status='withdrawn' WHERE id=$1", [withdrawn.reportId]);
    expect(await publicView(withdrawnSlug)).toEqual([]);

    const thin = await system({ members: [[otto, "owner"]], pass: 6, partial: 1, fail: 1 });
    await expect(publish((await consented(thin)).id, `thin-${randomUUID().slice(0, 6)}`)).rejects.toThrow("EVIDENCE_TOO_THIN");
    const incomplete = await system({ members: [[otto, "owner"]], headline: "incomplete" });
    await expect(publish((await consented(incomplete)).id, `incomplete-${randomUUID().slice(0, 6)}`)).rejects.toThrow("EVIDENCE_TOO_THIN");
    // An unpublished report cannot be consented.
    const draft = await system({ members: [[otto, "owner"]] });
    await owner.query("UPDATE evals.report SET publication_status='draft' WHERE id=$1", [draft.reportId]);
    await expect(consented(draft)).rejects.toThrow("REPORT_NOT_PUBLISHED");
    // Nor a revision of a published report that was never published itself (no notice, not the current one) ...
    const report = await system({ members: [[otto, "owner"]] });
    const unpublished = randomUUID();
    const runId = (await owner.query("SELECT run_id FROM evals.report_revision WHERE id=$1", [report.revisionId])).rows[0].run_id;
    await owner.query("INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status,created_by) SELECT $1,org_id,report_id,run_id,$2,snapshot,review_status,created_by FROM evals.report_revision WHERE id=$3",
      [unpublished, createHash("sha256").update(unpublished).digest("hex"), report.revisionId]);
    expect(runId).toBeTruthy();
    await expect(consented({ ...report, revisionId: unpublished })).rejects.toThrow("REPORT_NOT_PUBLISHED");
    // ... while the current revision of a published report counts even without its notice.
    await owner.query("DELETE FROM evals.notification WHERE org_id=$1", [report.orgId]);
    const fallback = await consented(report);
    const fallbackSlug = `otto-${randomUUID().slice(0, 6)}`;
    const page = (await publish(fallback.id, fallbackSlug)).rows[0];
    expect(page.projection.report_published_at).toEqual(expect.any(String));
    // The publication date comes from the notice, never from report_revision.published_at.
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.report_revision WHERE published_at IS NOT NULL AND org_id=$1", [report.orgId])).rows[0].n).toBe(0);
  });

  it("never publishes our own snapshots of third parties", async () => {
    const operatorUser = await person("Ops");
    const snapshot = await system({ members: [[operatorUser, "owner"]], sandbox: { company: "Aseguradora Tercera SA" } });
    // Not even an owner membership or a signed document lets a sandbox consent.
    await expect(asActor(operatorUser.id, snapshot.orgId, (db) => db.query(consentSql,
      [snapshot.orgId, snapshot.revisionId, true, false, "Aseguradora Tercera", "Questions about home insurance, in Spanish.", null, "Ops", "Ops", CONSENT_VERSION, "es", `req-${randomUUID()}`, "in_app", null, null])))
      .rejects.toThrow("PUBLICATION_NOT_ALLOWED");
    await expect(asActor(admin.id, snapshot.orgId, (db) => db.query(consentSql,
      [snapshot.orgId, snapshot.revisionId, true, false, "Aseguradora Tercera", "Questions about home insurance, in Spanish.", null, "Ops", "Ops", CONSENT_VERSION, "es", `req-${randomUUID()}`, "signed_document", "Folder 1", new Date().toISOString()])))
      .rejects.toThrow("PUBLICATION_NOT_ALLOWED");
    // Even a consent row written around the functions cannot be published or read publicly.
    const consentId = randomUUID(), pageSlug = `tercera-${randomUUID().slice(0, 6)}`;
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query(`INSERT INTO evals.publication_consent(id,org_id,report_id,report_revision_id,results_page,sector_index,public_name,scope_summary,consent_version,locale,method,signer_user_id,signer_name,signer_role,signed_at,request_id,recorded_by)
        VALUES($1,$2,$3,$4,true,false,'Aseguradora Tercera','Questions about home insurance.',$5,'es','in_app',$6,'Ops','Ops',now(),$7,$6)`, [consentId, snapshot.orgId, snapshot.reportId, snapshot.revisionId, CONSENT_VERSION, operatorUser.id, `req-${randomUUID()}`]);
      await db.query(`INSERT INTO evals.public_result_page(org_id,consent_id,report_revision_id,slug,projection,review_note,published_by)
        VALUES($1,$2,$3,$4,'{"schema":1,"public_name":"Aseguradora Tercera"}','Written around the functions.',$5)`, [snapshot.orgId, consentId, snapshot.revisionId, pageSlug, admin.id]);
      await db.query("COMMIT");
    } finally {
      db.release();
    }
    await expect(asActor(admin.id, null, (client) => client.query("SELECT * FROM evals.publish_result_page($1,$2,'Checked by hand against the report.')", [consentId, `${pageSlug}-x`])))
      .rejects.toThrow("PUBLICATION_NOT_ALLOWED");
    expect(await publicView(pageSlug)).toEqual([]);
  });

  it("keeps consents and pages from editors, viewers, other workspaces and direct writes", async () => {
    const ines = await person("Ines Owner"), vera = await person("Vera Viewer"), stranger = await person("Stranger");
    const fixture = await system({ members: [[ines, "owner"], [vera, "viewer"]] });
    const other = await system({ members: [[stranger, "owner"]] });
    await asActor(ines.id, fixture.orgId, (db) => db.query(consentSql, indexConsent(fixture.orgId, fixture.revisionId)));
    const count = (actor: string, orgId: string) => asActor(actor, orgId, async (db) => (await db.query("SELECT count(*)::int AS n FROM evals.publication_consent")).rows[0].n);
    expect(await count(ines.id, fixture.orgId)).toBe(1);
    expect(await count(vera.id, fixture.orgId)).toBe(0);
    expect(await count(stranger.id, other.orgId)).toBe(0);
    expect(await count(stranger.id, fixture.orgId)).toBe(0);
    expect(await asActor(ines.id, fixture.orgId, async (db) => (await db.query("SELECT count(*)::int AS n FROM evals.sector_index_publication")).rows[0].n)).toBe(0);
    await expect(asActor(ines.id, fixture.orgId, (db) => db.query(`INSERT INTO evals.publication_consent(org_id,report_id,report_revision_id,results_page,sector_index,index_sector,consent_version,locale,method,signer_user_id,signer_name,signer_role,signed_at,request_id,recorded_by)
      VALUES($1,$2,$3,false,true,'insurance',$4,'es','in_app',$5,'Ines','CEO',now(),$6,$5)`, [fixture.orgId, fixture.reportId, fixture.revisionId, CONSENT_VERSION, ines.id, `req-${randomUUID()}`])))
      .rejects.toMatchObject({ code: "42501" });
    // A stranger cannot consent for, or revoke in, someone else's workspace.
    await expect(asActor(stranger.id, fixture.orgId, (db) => db.query(consentSql, indexConsent(fixture.orgId, fixture.revisionId)))).rejects.toThrow("OWNER_REQUIRED");
    await expect(asActor(stranger.id, other.orgId, (db) => db.query(consentSql, indexConsent(fixture.orgId, fixture.revisionId)))).rejects.toThrow("SCOPE_DENIED");
  });

  it("builds the index only from consenting customers and sector-assigned snapshots, without identifiers, and suppresses cohorts under 10", async () => {
    const quarter = "2026-Q3", inQuarter = "2026-08-15T10:00:00.000Z";
    const owners: User[] = [];
    const consenting = async (options: Parameters<typeof system>[0] = {}) => {
      const user = await person("Customer owner");
      owners.push(user);
      const fixture = await system({ members: [[user, "owner"]], publishedAt: inQuarter, ...options });
      const consent = (await asActor(user.id, fixture.orgId, (db) => db.query(consentSql, indexConsent(fixture.orgId, fixture.revisionId)))).rows[0];
      return { ...fixture, user, consentId: consent.id as string };
    };
    const inputs = async () => (await asActor(admin.id, null, (db) => db.query("SELECT * FROM evals.sector_index_inputs($1)", [quarter]))).rows as SectorIndexInput[];
    const insuranceEligible = async () => (await inputs()).filter((row) => row.sector === "insurance" && row.eligible).length;
    const baseline = await insuranceEligible();

    const customers = [];
    for (let index = 0; index < 7; index += 1) customers.push(await consenting({ pass: 20 + index, partial: 3, fail: 10 - index }));
    // A customer who never consented, one who withdrew, and one with too few answers.
    await system({ members: [[await person("Silent"), "owner"]], publishedAt: inQuarter });
    const withdrew = await consenting();
    await asActor(withdrew.user.id, withdrew.orgId, (db) => db.query("SELECT * FROM evals.revoke_publication_consent($1,$2,$3)", [withdrew.orgId, withdrew.consentId, null]));
    await consenting({ pass: 2, partial: 0, fail: 1 });
    // Our own snapshots: one assigned to the sector, one on the same chat as a customer (counted once), one unassigned.
    await system({ publishedAt: inQuarter, sandbox: { company: "Tercera Uno SA", sector: "insurance" } });
    await system({ publishedAt: inQuarter, host: customers[0].host, sandbox: { company: "Tercera Dos SA", sector: "insurance" } });
    await system({ publishedAt: inQuarter, sandbox: { company: "Tercera Tres SA" } });

    const rows = await inputs();
    expect(Object.keys(rows[0]).sort()).toEqual(["eligible", "exclusion", "n_fail", "n_partial", "n_pass", "n_scorable", "sector", "source", "strict_pass_rate"]);
    const serialized = JSON.stringify(rows);
    for (const leak of [SECRET, "Tercera", "example.test", ...customers.map((item) => item.orgId)]) expect(serialized).not.toContain(leak);
    // 7 consenting customers + 1 assigned snapshot; the duplicate chat counts once, as the customer.
    expect(await insuranceEligible()).toBe(baseline + 8);
    expect(rows.filter((row) => row.exclusion === "no_sector").length).toBeGreaterThanOrEqual(1);
    expect(rows.filter((row) => row.exclusion === "weak_evidence").length).toBeGreaterThanOrEqual(1);
    await expect(asActor(owners[0].id, customers[0].orgId, (db) => db.query("SELECT * FROM evals.sector_index_inputs($1)", [quarter]))).rejects.toThrow("SCOPE_DENIED");

    const record = (aggregates: unknown, legal: [string | null, string | null, string | null] = ["Signed review, folder 2026-Q3", "Counsel SLP", "2026-10-05"], forQuarter = quarter) =>
      asActor(admin.id, null, (db) => db.query("SELECT * FROM evals.record_sector_index_publication($1,'insurance',$2,'sector-index-v1',$3,$4,$5)", [forQuarter, aggregates, ...legal]));
    const fake = { systems: 10, answers_scored: 400, median_pass: 60, p25_pass: 50, p75_pass: 70, correct_share: 60, partial_share: 10, incorrect_share: 30 };
    if (baseline + 8 < 10) await expect(record(fake)).rejects.toThrow("COHORT_TOO_SMALL");

    // Two more consenting customers reach the minimum cohort.
    while (await insuranceEligible() < 10) customers.push(await consenting({ pass: 25, partial: 2, fail: 8 }));
    const preview = aggregateSectorIndex(quarter, await inputs());
    const [insurance] = publishableSectors(preview).filter((item) => item.sector === "insurance");
    expect(insurance.cohortSize).toBeGreaterThanOrEqual(10);

    await expect(record(insurance.aggregates, [null, "Counsel SLP", "2026-10-05"])).rejects.toThrow("LEGAL_SIGNOFF_REQUIRED");
    await expect(record(insurance.aggregates, ["Signed review", "Counsel SLP", "2099-01-01"])).rejects.toThrow("LEGAL_SIGNOFF_REQUIRED");
    await expect(record({ ...insurance.aggregates, company: 1 })).rejects.toThrow("INPUT_INVALID");
    await expect(record({ ...insurance.aggregates, median_pass: 101 })).rejects.toThrow("INPUT_INVALID");
    await expect(record({ ...insurance.aggregates, systems: insurance.cohortSize + 1 })).rejects.toThrow("AGGREGATES_STALE");
    await expect(record(insurance.aggregates, undefined, "2099-Q1")).rejects.toThrow("QUARTER_NOT_ENDED");
    await expect(asActor(owners[0].id, null, (db) => db.query("SELECT * FROM evals.record_sector_index_publication($1,'insurance',$2,'sector-index-v1','Ref','Counsel','2026-10-05')", [quarter, insurance.aggregates]))).rejects.toThrow("SCOPE_DENIED");
    const edition = (await record(insurance.aggregates)).rows[0];
    expect(edition).toMatchObject({ quarter, sector: "insurance", cohort_size: insurance.cohortSize, legal_reviewer: "Counsel SLP" });
    await expect(record(insurance.aggregates)).rejects.toThrow("EDITION_EXISTS");

    // The public read: signed-off, live sectors only, without the sign-off reference.
    const publicRows = (await asActor("public:results", null, (db) => db.query("SELECT * FROM evals.public_sector_index($1)", [quarter]))).rows;
    expect(publicRows).toHaveLength(1);
    expect(Object.keys(publicRows[0]).sort()).toEqual(["aggregates", "cohort_size", "legal_signed_on", "methodology_version", "published_at", "quarter", "sector"]);
    const { getPublicSectorIndex } = await import("@/lib/publication/store");
    expect((await getPublicSectorIndex(quarter))?.rows[0]).toMatchObject({ sector: "insurance", cohortSize: insurance.cohortSize, legalSignedOn: "2026-10-05" });
    const indexRoute = await import("@/app/[locale]/sector-index/[quarter]/page");
    expect(await indexRoute.default({ params: Promise.resolve({ locale: "en", quarter: "2026-q3" }) })).toBeTruthy();

    await asActor(admin.id, null, (db) => db.query("SELECT * FROM evals.withdraw_sector_index_publication($1,'Withdrawn for the test.')", [edition.id]));
    expect(await getPublicSectorIndex(quarter)).toBeNull();
    await expect(owner.query("DELETE FROM evals.sector_index_publication WHERE id=$1", [edition.id])).rejects.toThrow(/kept as a record/);
  });

  it("refuses the rollback while publication rows exist", async () => {
    const rollback = readFileSync("db/rollbacks/104_evals_publication_consent_down.sql", "utf8");
    const client = await owner.connect();
    try {
      await expect(client.query(rollback)).rejects.toThrow(/Rollback blocked: \d+ publication rows exist/);
      await client.query("ROLLBACK").catch(() => undefined);
    } finally {
      client.release();
    }
    expect((await owner.query("SELECT to_regclass('evals.publication_consent') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });
});
