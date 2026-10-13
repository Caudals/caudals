/**
 * Readout decks and presenter notes on the real schema (launch L-35,
 * migration 099). Operators and platform admins save and read notes; owners,
 * editors and viewers cannot read a note through any route, export or direct
 * query, and the document worker has no grant on notes at all. A readout PDF
 * job carries only the transcripts and the next step, and the PDF the worker
 * renders contains no note.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { chromium } from "@playwright/test";
import JSZip from "jszip";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { createPrefixedId } from "@/lib/operator/ids";
import { importedJudgeRunFixture } from "./judge-run-fixture";

const identity = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => identity.current!,
}));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_DATABASE_URL, endpoint = process.env.EVALS_TEST_S3_ENDPOINT;
const MARKER = `operator-only-note-${randomUUID()}`;

function pdfText(bytes: Uint8Array) {
  try {
    return execFileSync("pdftotext", ["-layout", "-", "-"], { input: Buffer.from(bytes), encoding: "utf8" });
  } catch {
    return null;
  }
}

describe.skipIf(!ownerUrl || !runtimeUrl)("readout decks and notes on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 2 });
  let orgId = "", reportId = "", revisionId = "", operatorId = "", projectId = "";
  const users: Record<"owner" | "editor" | "viewer" | "admin" | "outsider", string> = { owner: "", editor: "", viewer: "", admin: "", outsider: "" };
  let otherOrg = "";
  const headers = { host: "localhost", origin: "http://localhost", "content-type": "application/json" };
  const call = (path: string, method: string, body?: unknown) => new Request(`http://localhost/api/evals/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const as = (who: keyof typeof users | "operator") => {
    const id = who === "operator" ? operatorId : users[who];
    const role = who === "admin" ? null : who === "outsider" ? null : who;
    identity.current = {
      user: { id, email: `${who}@example.test`, name: who },
      platformRole: who === "admin" ? "platform_admin" : null,
      workspaces: role ? [{ id: orgId, name: "Readout fixture", role }] : [],
    };
  };
  /** Runs SQL as the web runtime role, for one actor in this workspace. */
  async function asActor<T>(actor: string, work: (db: import("pg").PoolClient) => Promise<T>, org = orgId): Promise<T> {
    const db = await runtime.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.org_id',$1,true),set_config('evals.actor_id',$2,true)", [org, actor]);
      return await work(db);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      db.release();
    }
  }
  const readout = () => import("@/app/api/evals/v1/reports/[id]/readout/route");

  beforeAll(async () => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    vi.stubEnv("DATABASE_URL", runtimeUrl!);
    vi.stubEnv("ANALYTICS_EVENTS_V2", "true");
    const { scoreRun, createReportForRun, publishReport } = await import("@/lib/evals/repositories/managed");
    const fixture = await importedJudgeRunFixture(owner, runtimeUrl!);
    orgId = fixture.orgId;
    operatorId = fixture.actorId;
    projectId = fixture.projectId;
    await scoreRun(fixture.scope, fixture.run.id, "customer-manual-deterministic-v1");
    const report = await createReportForRun(fixture.scope, { runId: fixture.run.id, title: "Readout", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    await publishReport(fixture.scope, report.reportId, report.revisionId);
    reportId = report.reportId;
    revisionId = report.revisionId;
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      users[who] = createPrefixedId("au");
      await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [users[who], who, `${randomUUID()}@example.test`]);
    }
    for (const role of ["owner", "editor", "viewer"] as const) await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,$3)", [orgId, users[role], role]);
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [users.admin]);
    // An operator of another workspace: an operator there, nobody here.
    otherOrg = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Other',$2)", [otherOrg, users.outsider]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [otherOrg, users.outsider]);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await owner.end();
    await runtime.end();
    const { getEvalsPool } = await import("@/lib/evals/repositories/db");
    await getEvalsPool().end();
  });

  it("is invisible while READOUT_MODE_ENABLED is off", async () => {
    vi.stubEnv("READOUT_MODE_ENABLED", "");
    as("operator");
    const { GET } = await readout();
    expect((await GET(call(`/reports/${reportId}/readout?orgId=${orgId}`, "GET"))).status).toBe(404);
  });

  it("lets an operator save picks, a next step and notes, with the actor and an audit event", async () => {
    vi.stubEnv("READOUT_MODE_ENABLED", "operators");
    as("operator");
    const { GET, PUT } = await readout();
    const first = await (await GET(call(`/reports/${reportId}/readout?orgId=${orgId}`, "GET"))).json();
    expect(first.data.access).toEqual({ present: true, notes: true, edit: true });
    expect(first.data.revision.id).toBe(revisionId);
    expect(first.data.notes).toEqual({});
    const ids = first.data.revision.snapshot.results.map((item: { assessment_id: string }) => item.assessment_id);
    const saved = await PUT(call(`/reports/${reportId}/readout`, "PUT", { orgId, revisionId, transcriptIds: [ids[1], ids[0]], nextStep: "subscription", notes: { cover: MARKER, [`transcript:${ids[0]}`]: `${MARKER} transcript` } }));
    expect(saved.status).toBe(200);
    const body = (await saved.json()).data;
    expect(body.deck).toMatchObject({ transcriptIds: [ids[1], ids[0]], nextStep: "subscription" });
    expect(body.notes).toEqual({ cover: MARKER, [`transcript:${ids[0]}`]: `${MARKER} transcript` });
    const rows = await owner.query("SELECT updated_by FROM evals.readout_note WHERE org_id=$1 AND report_revision_id=$2", [orgId, revisionId]);
    expect(rows.rows.map((row) => row.updated_by)).toEqual([operatorId, operatorId]);
    const audit = await owner.query("SELECT actor_id FROM evals.audit_event WHERE org_id=$1 AND action='readout.saved' AND subject_id=$2", [orgId, revisionId]);
    expect(audit.rows).toEqual([{ actor_id: operatorId }]);
    // Unknown results and slide keys are refused.
    expect((await PUT(call(`/reports/${reportId}/readout`, "PUT", { orgId, revisionId, transcriptIds: ["not-a-result"] }))).status).toBe(422);
    expect((await PUT(call(`/reports/${reportId}/readout`, "PUT", { orgId, revisionId, notes: { "transcript:not-a-result": "x" } }))).status).toBe(422);
    // A platform admin (no membership) reads the notes too, audited as support.
    as("admin");
    const admin = await (await GET(call(`/reports/${reportId}/readout?orgId=${orgId}`, "GET"))).json();
    expect(admin.data.notes.cover).toBe(MARKER);
  });

  it("never lets a customer role read a note through a readout route", async () => {
    vi.stubEnv("READOUT_MODE_ENABLED", "true");
    const { GET, PUT } = await readout();
    for (const who of ["owner", "editor"] as const) {
      as(who);
      const response = await GET(call(`/reports/${reportId}/readout?orgId=${orgId}`, "GET"));
      expect(response.status, who).toBe(200);
      const text = await response.text();
      expect(text, who).not.toContain(MARKER);
      const body = JSON.parse(text).data;
      expect(body.access, who).toEqual({ present: true, notes: false, edit: false });
      expect("notes" in body, who).toBe(false);
      // Customers see the operator's picks and next step, never the notes.
      expect(body.deck.nextStep, who).toBe("subscription");
      expect((await PUT(call(`/reports/${reportId}/readout`, "PUT", { orgId, revisionId, notes: { cover: "owner note" } }))).status, who).toBe(404);
    }
    as("viewer");
    expect((await GET(call(`/reports/${reportId}/readout?orgId=${orgId}`, "GET"))).status).toBe(404);
    as("outsider");
    expect((await GET(call(`/reports/${reportId}/readout?orgId=${orgId}`, "GET"))).status).toBe(404);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.readout_note WHERE org_id=$1", [orgId])).rows[0].n).toBe(2);
  });

  it("hides notes from customer roles in the database itself (RLS), whatever the query", async () => {
    for (const who of ["owner", "editor", "viewer", "outsider"] as const) {
      await asActor(users[who], async (db) => {
        expect((await db.query("SELECT * FROM evals.readout_note")).rows, who).toEqual([]);
        expect((await db.query("UPDATE evals.readout_note SET body='x',updated_at=now() WHERE org_id=$1 RETURNING slide_key", [orgId])).rows, who).toEqual([]);
        expect((await db.query("DELETE FROM evals.readout_note WHERE org_id=$1 RETURNING slide_key", [orgId])).rows, who).toEqual([]);
        await expect(db.query("INSERT INTO evals.readout_note(org_id,report_revision_id,slide_key,body) VALUES($1,$2,'verdict','x')", [orgId, revisionId]), who).rejects.toMatchObject({ code: "42501" });
      });
      await asActor(users[who], async (db) => {
        // Picks are readable by members, writable by operators only.
        expect((await db.query("SELECT next_step FROM evals.readout_deck WHERE org_id=$1", [orgId])).rows.length, who).toBe(1);
        expect((await db.query("UPDATE evals.readout_deck SET next_step='pilot',updated_by=evals.actor_id() WHERE org_id=$1 RETURNING org_id", [orgId])).rows, who).toEqual([]);
      });
    }
    await asActor(operatorId, async (db) => expect((await db.query("SELECT slide_key FROM evals.readout_note ORDER BY slide_key")).rows.length).toBe(2));
    await asActor(users.admin, async (db) => expect((await db.query("SELECT slide_key FROM evals.readout_note")).rows.length).toBe(2));
    // A workspace operator elsewhere is nobody here, even naming this workspace.
    await asActor(users.outsider, async (db) => expect((await db.query("SELECT slide_key FROM evals.readout_note")).rows).toEqual([]), orgId);
    // Workers never get a grant on notes (the scheduler runs as the web runtime, so RLS above applies to it).
    for (const role of ["evals_document", "evals_worker", "evals_browser", "evals_execution_admin"]) {
      const granted = (await owner.query("SELECT has_table_privilege($1,'evals.readout_note','SELECT') AS can", [role])).rows[0].can;
      expect(granted, role).toBe(false);
    }
  });

  it("keeps notes out of the report, shares and every export", async () => {
    const managed = await import("@/lib/evals/repositories/managed");
    const scope = { orgId, actorId: users.owner };
    as("owner");
    const report = await import("@/app/api/evals/v1/reports/[id]/route");
    expect(await (await report.GET(call(`/reports/${reportId}?orgId=${orgId}`, "GET"))).text()).not.toContain(MARKER);
    const share = await managed.createReportShare({ orgId, actorId: operatorId }, reportId, { reportRevisionId: revisionId, audience: "bearer", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), permittedFields: ["system", "scope", "metrics", "results", "findings"] }, randomUUID());
    expect(JSON.stringify(await managed.resolveShare(String(share.token), randomUUID()))).not.toContain(MARKER);
    if (endpoint) {
      for (const [name, value] of Object.entries({ DO_SPACES_ENDPOINT: endpoint, DO_SPACES_REGION: "us-east-1", DO_SPACES_BUCKET: "evals-readout-test", DO_SPACES_ACCESS_KEY_ID: "evals_test", DO_SPACES_SECRET_ACCESS_KEY: "evals_test_password", DO_SPACES_FORCE_PATH_STYLE: "true" })) vi.stubEnv(name, value);
      const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: "evals_test_password" } });
      try { await s3.send(new CreateBucketCommand({ Bucket: "evals-readout-test" })); } catch (error) { if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((error as Error).name)) throw error; }
      for (const kind of ["csv", "cef", "docx"] as const) {
        const file = await managed.createMachineExport(scope, revisionId, kind, "en");
        const bytes = (await managed.getReportArtifact(scope, file.artifactId)).bytes;
        const text = kind === "docx" ? await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string") : bytes.toString("utf8");
        expect(text, kind).not.toContain(MARKER);
      }
    }
  });

  let rendered = false;
  it("queues a readout PDF with only transcripts and next step, and the worker's PDF has no note", async () => {
    vi.stubEnv("READOUT_MODE_ENABLED", "true");
    as("owner");
    const { POST } = await import("@/app/api/evals/v1/reports/[id]/readout/export/route");
    const queued = await POST(call(`/reports/${reportId}/readout/export`, "POST", { orgId, revisionId, locale: "es", nextStep: "pilot" }));
    expect(queued.status).toBe(200);
    const job = (await queued.json()).data;
    expect(job.status).toBe("queued");
    // Asking again for the same deck reuses the job.
    expect((await (await POST(call(`/reports/${reportId}/readout/export`, "POST", { orgId, revisionId, locale: "es", nextStep: "pilot" }))).json()).data.id).toBe(job.id);
    const row = (await owner.query("SELECT kind,readout,share_id FROM evals.export_job WHERE id=$1", [job.id])).rows[0];
    expect(row.kind).toBe("readout_pdf");
    expect(row.share_id).toBeNull();
    expect(Object.keys(row.readout).sort()).toEqual(["next_step", "transcript_ids"]);
    // Without a choice in the request, the operator's saved picks are used; the next step asked for wins.
    const saved = (await owner.query("SELECT transcript_ids FROM evals.readout_deck WHERE org_id=$1 AND report_revision_id=$2", [orgId, revisionId])).rows[0].transcript_ids;
    expect(row.readout).toEqual({ transcript_ids: saved, next_step: "pilot" });
    expect(JSON.stringify(row)).not.toContain(MARKER);
    // The database refuses a readout job that would carry anything else.
    await expect(asActor(users.owner, (db) => db.query("INSERT INTO evals.export_job(org_id,report_revision_id,kind,locale,readout) VALUES($1,$2,'readout_pdf','en',$3)", [orgId, revisionId, { transcript_ids: [], next_step: "pilot", notes: { cover: MARKER } }]))).rejects.toMatchObject({ code: "23514" });
    // The export event carries a hashed revision and the slide count only.
    const event = (await owner.query("SELECT metadata AS payload FROM public.product_analytics_event WHERE event_name='readout_exported' AND org_id=$1", [orgId])).rows;
    expect(event.length).toBe(1);
    expect(Object.keys(event[0].payload).sort()).toEqual(["revision_hash", "slide_count"]);
    expect(JSON.stringify(event[0].payload)).not.toContain(revisionId);

    if (!endpoint) return;
    let browserReady = true;
    try { execFileSync(chromium.executablePath(), ["--version"], { stdio: "ignore" }); } catch { browserReady = false; }
    if (!browserReady) return;
    const { processReadoutOne } = await import("@/services/evals-documents/readout");
    rendered = true;
    const browser = await chromium.launch({ headless: true });
    try {
      // The worker runs as the document service: no membership and no grant on notes.
      expect(await processReadoutOne(orgId, "service:evals-documents", async () => { const page = await browser.newPage(); return { page, close: () => page.close() }; })).toBe(true);
    } finally {
      await browser.close();
    }
    const done = (await owner.query("SELECT j.status,a.export_path,a.id FROM evals.export_job j JOIN evals.artifact a ON a.org_id=j.org_id AND a.id=j.artifact_id WHERE j.id=$1", [job.id])).rows[0];
    expect(done.status).toBe("completed");
    expect(done.export_path).toMatch(new RegExp(`^readouts/${revisionId}\\.es\\.[0-9a-f]{12}\\.v1\\.pdf$`));
    const managed = await import("@/lib/evals/repositories/managed");
    const artifact = await managed.getReportArtifact({ orgId, actorId: users.owner }, done.id);
    const text = pdfText(artifact.bytes);
    if (text != null) {
      expect(text).toContain("Siguiente paso");
      expect(text).not.toContain(MARKER);
    }
    expect(artifact.media_type).toBe("application/pdf");
    console.info("readout_pdf_rendered", { pages: (text ?? "").split("\f").filter((page) => page.trim()).length, rendered });
  }, 120_000);

  it("records readout_presented once per person, revision and day", async () => {
    vi.stubEnv("READOUT_MODE_ENABLED", "operators");
    as("operator");
    const { POST } = await import("@/app/api/evals/v1/reports/[id]/readout/presented/route");
    for (let attempt = 0; attempt < 2; attempt++) expect((await POST(call(`/reports/${reportId}/readout/presented`, "POST", { orgId, revisionId, slideCount: 6 }))).status).toBe(200);
    const events = (await owner.query("SELECT metadata AS payload FROM public.product_analytics_event WHERE event_name='readout_presented' AND org_id=$1", [orgId])).rows;
    expect(events).toEqual([{ payload: { revision_hash: expect.stringMatching(/^[0-9a-f]{16}$/), slide_count: 6 } }]);
    // Owners may not present while the flag is "operators".
    as("owner");
    expect((await POST(call(`/reports/${reportId}/readout/presented`, "POST", { orgId, revisionId, slideCount: 6 }))).status).toBe(404);
    void projectId;
  });
});
