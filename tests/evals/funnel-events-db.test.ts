/**
 * Spec v2 §8.3 L-02 acceptance on the production schema: one scripted funnel
 * run produces every non-billing §4.20 event (lib/analytics/events.ts) in
 * `public.product_analytics_event`, through the product's own flows: the
 * public demo (challenge, start, the engine, share, sign-up request), the
 * demo and direct sign-ups, intake (sources, "What we understood", a ready
 * test set), a report's life (run, views, shares, downloads, readout,
 * questions, cancellation), monitoring (web sources, token, destination,
 * schedule) and the six client events posted to the real ingestion route as
 * `trackProductEvent` builds them, after consent. Every stored row carries
 * only allowlisted properties and attribution keys, no user, a hashed run, a
 * route template and no personal data; replays add nothing where the
 * emitter deduplicates. Billing events (top_up_*, auto_recharge_*) are out
 * of scope here.
 *
 * Only external I/O is replaced: email (Resend), the rate limiter, DNS
 * pinning, the demo's site reader, assistant and model provider, and the
 * DNS lookup of a webhook destination. Database-wide assertions, so the suite
 * runs on its own copy of the migrated database (decision I-12):
 * `eval "$(scripts/evals/test-db.sh up)" && npx vitest run tests/evals/funnel-events-db.test.ts`.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { analyticsPath, ATTRIBUTION_KEYS, CLIENT_EVENT_NAMES, sanitizeAttribution, sanitizePayload, SERVER_EVENT_NAMES, type ClientEventName, type ProductEventName, type ProductEventPayload } from "@/lib/analytics/events";
import { getPostgresPool } from "@/lib/db/client";
import { canonicalJson, sha256, withContentHash } from "@/lib/evals/contracts/hashing";
import { leadingZeroBits } from "@/lib/demo/pow";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { syntheticAccountingFixture } from "@/lib/evals/generation/packs";
import { createWebhookEndpoint } from "@/lib/evals/monitoring/webhooks";
import { digest, type TenantTransaction } from "@/lib/evals/queue/store";
import { InvocationWorker } from "@/lib/evals/queue/worker";
import { advanceAutomaticGeneration, startAutomaticGeneration } from "@/lib/evals/repositories/automatic-generation";
import { getEvalsPool, withTenant } from "@/lib/evals/repositories/db";
import { createWebsitePreview, importWebsitePreview } from "@/lib/evals/repositories/intake";
import { createReportForRun, publishReport, scoreRun } from "@/lib/evals/repositories/managed";
import { createPrefixedId } from "@/lib/operator/ids";
import { fakeAskApi, fakeModelFetch, fakeReadSite } from "../../scripts/demo/fake-demo";
import { testDatabaseUrls } from "../helpers/test-database";
import { importedJudgeRunFixture } from "./judge-run-fixture";

// No email leaves: every message is kept here, so links can be followed.
type Mail = { to: string; subject: string; text: string };
const mail = vi.hoisted(() => vi.fn(async (_message: Mail, _options?: unknown) => ({ data: { id: "fake" }, error: null })));
vi.mock("@/lib/resend/client", () => ({ getResendClient: () => ({ emails: { send: mail } }) }));
// The limiter is covered by the routes' own tests; here it always allows.
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async (input: { limit: number }) => ({ allowed: true, limit: input.limit, remaining: 1, retryAfterSeconds: 0, resetAt: Date.now() + 1000 })),
}));
// Workspace sessions: the signed-in person each step acts as.
const identity = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => identity.current!,
}));
// The demo pins public addresses through DNS before it starts: no lookups leave the host.
vi.mock("@/lib/demo/web", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demo/web")>()),
  pinPublic: vi.fn(async () => undefined),
}));

const { ownerUrl, runtimeUrl } = testDatabaseUrls("funnel_events");
const s3 = process.env.EVALS_TEST_S3_ENDPOINT;
const s3Secret = process.env.EVALS_TEST_S3_SECRET ?? "evals_test_password";
const PRIMARY = "http://primary.demo.test/v1";
const FALLBACK = "https://fallback.demo.test/api/v1";
const BILLING = new Set<string>(["top_up_started", "top_up_paid", "auto_recharge_paid", "auto_recharge_failed"]);
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Personal data and credentials the run handles; none may reach an analytics row.
const VISITOR_IP = "203.0.113.7";
const SITE = `funnel-${randomUUID().slice(0, 8)}.example.com`;
const DEMO_EMAIL = `ana.funnel@acme-${randomUUID().slice(0, 6)}.com`;
const DEMO_NAME = "Ana Funnelfixture";
const COLLEAGUE_EMAIL = `colleague.funnel@partner-${randomUUID().slice(0, 6)}.com`;
const DIRECT_EMAIL = `lead.funnel@direct-${randomUUID().slice(0, 6)}.com`;
const DIRECT_NAME = "Luis Funnelfixture";
const FREE_EMAIL = "funnel.personal@gmail.com";
const RECIPIENT_EMAIL = `cfo.funnel@acme-${randomUUID().slice(0, 6)}.com`;
const HOSTILE_EMAIL = "visitor.funnel@example.com";
const PASSWORD = `funnel-password-${randomUUID()}`;
const DEMO_API_KEY = `sk-funnel-${randomBytes(12).toString("hex")}`;
const secrets = new Set<string>([VISITOR_IP, DEMO_EMAIL, DEMO_NAME, COLLEAGUE_EMAIL, DIRECT_EMAIL, DIRECT_NAME, FREE_EMAIL, RECIPIENT_EMAIL, HOSTILE_EMAIL, PASSWORD, DEMO_API_KEY]);
const remember = (...values: Array<string | null | undefined>) => { for (const value of values) if (value) secrets.add(value); };

const keyDir = mkdtempSync(join(tmpdir(), "funnel-events-keys-"));
writeFileSync(join(keyDir, "master.json"), JSON.stringify({ v1: randomBytes(32).toString("base64") }));
writeFileSync(join(keyDir, "webhooks.json"), JSON.stringify({ test: randomBytes(32).toString("base64") }));
const publicDns = (async () => [{ address: "34.120.0.10", family: 4 }]) as never;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const JSON_HEADERS = { "content-type": "application/json", host: "localhost", origin: "http://localhost" };

/** The browser's proof of work (lib/demo/pow.ts), solved as the page's worker does. */
function solve(challenge: { salt: string; bits: number }) {
  for (let nonce = 0; ; nonce++) {
    if (leadingZeroBits(createHash("sha256").update(`${challenge.salt}:${nonce}`).digest()) >= challenge.bits) return String(nonce);
  }
}

/** The signed-in person for the workspace routes. */
function as(userId: string, orgId: string, role: "owner" | "editor" | "viewer" | "operator") {
  identity.current = { user: { id: userId, email: "member.fixture@example.test", name: "Fixture member" }, platformRole: null, workspaces: [{ id: orgId, name: "Funnel fixture", role }] };
}

/** A call to an `/api/evals/v1` route, as the app makes it. */
function call(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/evals/v1${path}`, { method, headers: { ...JSON_HEADERS, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function data<T = Record<string, unknown>>(response: Response, status = 200): Promise<T> {
  const text = await response.text();
  expect(response.status, text.slice(0, 300)).toBe(status);
  return (JSON.parse(text) as { data: T }).data;
}

/** The one-time sign-up link in the last email to `to`. */
function signupLink(to: string) {
  const message = [...mail.mock.calls].reverse().map(([item]) => item).find((item) => item.to === to && /signup#/.test(item.text));
  const token = /signup#([A-Za-z0-9_-]{43})/.exec(message?.text ?? "")?.[1];
  expect(token, `sign-up link for ${to.split("@")[0]}`).toBeTruthy();
  return token!;
}

type Row = {
  id: string; event_name: string; event_category: string; source: string; path: string | null; session_id: string | null;
  metadata: Record<string, string | number | boolean | null>; attribution: Record<string, string>;
  org_id: string | null; run_id: string | null; user_id: string | null; user_role: string | null; event_key: string | null;
};

describe.skipIf(!ownerUrl || !runtimeUrl)("funnel events of spec v2 §4.20 on the production schema (L-02 acceptance)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const workerPool = new Pool({ connectionString: ownerUrl, max: 4 });
  workerPool.on("connect", (client) => { void client.query("SET ROLE evals_worker"); });
  const events = async (name?: string) => (await owner.query<Row>(
    `SELECT * FROM public.product_analytics_event ${name ? "WHERE event_name=$1" : ""} ORDER BY occurred_at,id`, name ? [name] : [])).rows;
  async function eventually(check: () => Promise<boolean>, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error("timed out");
      await sleep(100);
    }
  }

  // Shared across the steps of the run.
  let demo = { id: "", token: "" };
  let w1 = { orgId: "", evaluationId: "" };
  let w2: Awaited<ReturnType<typeof intakeFixture>>;
  let w3: Awaited<ReturnType<typeof importedJudgeRunFixture>>;
  let report = { reportId: "", revisionId: "" };

  beforeAll(async () => {
    const env: Record<string, string> = {
      EVALS_DATABASE_URL: runtimeUrl!, DATABASE_URL: runtimeUrl!, ANALYTICS_EVENTS_V2: "true",
      // Public demo (copied from tests/evals/demo-queue-db.test.ts), with sharing and sign-up.
      DEMO_SECRET: `funnel-${randomUUID()}`, DEMO_ENABLED: "true", DEMO_PUBLIC: "true", DEMO_QUEUE_ENABLED: "true", DEMO_FALLBACK_ENABLED: "true",
      DEMO_ENDPOINT: PRIMARY, DEMO_MODELS: "primary-model", DEMO_FALLBACK_ENDPOINT: FALLBACK, DEMO_FALLBACK_API_KEY: "fallback-test-key",
      DEMO_FALLBACK_MODEL: "google/gemini-3.1-flash-lite", DEMO_FALLBACK_DAILY_EUR: "1", DEMO_MAX_ACTIVE: "3", DEMO_MAX_ACTIVE_WEBSITE: "2",
      EVALS_MASTER_KEYRING_FILE: join(keyDir, "master.json"), EVALS_MASTER_KEY_VERSION: "v1",
      RESEND_API_KEY: "re_test_fake", RESEND_FROM_EMAIL: "demo@caudals.test", NEXT_PUBLIC_APP_URL: "https://caudals.test", DEMO_APP_ORIGIN: "https://app.caudals.test",
      SIGNUP_TERMS_REQUIRED: "true", SELF_SERVE_DIRECT_SIGNUP: "true",
      // Product surfaces behind flags.
      INTAKE_V2_ENABLED: "true", READOUT_MODE_ENABLED: "true", REPORT_QUESTIONS_ENABLED: "true", INTEGRATIONS_V2_ENABLED: "true",
      EVALS_WEBHOOK_KEYRING_FILE: join(keyDir, "webhooks.json"), EVALS_WEBHOOK_KEY_VERSION: "test", EVALS_APP_URL: "https://app.caudals.test",
    };
    if (s3) Object.assign(env, { DO_SPACES_ENDPOINT: s3, DO_SPACES_REGION: "us-east-1", DO_SPACES_BUCKET: "evals-funnel-events-test", DO_SPACES_ACCESS_KEY_ID: "evals_test", DO_SPACES_SECRET_ACCESS_KEY: s3Secret, DO_SPACES_FORCE_PATH_STYLE: "true" });
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    for (const name of ["BRANDED_EMAILS_ENABLED", "ONBOARDING_AUTOSTART", "AI_DISCLOSURE_CHECK", "DEMO_BROWSER_ENABLED", "BILLING_CREDITS_ENABLED", "BILLING_ENFORCE"]) vi.stubEnv(name, "");
    // This database copy belongs to this suite: the whole table is this run's.
    await owner.query("DELETE FROM public.product_analytics_event");
    // The suite advances the demo engine itself (as tests/evals/demo-queue-db.test.ts does), so the
    // routes' ensureDemoRunner() must not also start the process loop in the background.
    globalThis.__caudalsDemoRunner = { owner: randomUUID(), active: new Set(), started: true, lastSweep: Date.now(), secrets: new Map() };
    const runner = await import("@/lib/demo/runner");
    runner.demoIo.readSite = fakeReadSite(10) as never;
    runner.demoIo.askApi = fakeAskApi(5) as never;
    if (s3) {
      const storage = new S3Client({ endpoint: s3, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: s3Secret } });
      try { await storage.send(new CreateBucketCommand({ Bucket: "evals-funnel-events-test" })); }
      catch (error) { if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((error as Error).name)) throw error; }
      finally { storage.destroy(); }
    }
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await Promise.all([owner.end(), workerPool.end(), getEvalsPool().end(), getPostgresPool().end()]);
  });

  /* ------------------------------------------------------------ public demo --- */

  const attributionCookie = `caudals_attribution_v2=${encodeURIComponent(JSON.stringify({ utm_source: "linkedin", utm_campaign: "demo-launch", partner: "agency-one", utm_content: DEMO_EMAIL }))}`;
  const visitor = { host: "localhost", origin: "http://localhost", "x-forwarded-for": VISITOR_IP, cookie: attributionCookie };

  /** The demo page: a fresh challenge, solved, then the start request. */
  async function startDemo() {
    const { GET } = await import("@/app/(app)/api/demo/challenge/route");
    const { challenge } = await (await GET(new Request("http://localhost/api/demo/challenge", { headers: visitor }))).json();
    const { POST } = await import("@/app/(app)/api/demo/runs/route");
    return POST(new Request("http://localhost/api/demo/runs", {
      method: "POST", headers: { ...visitor, "content-type": "application/json" },
      body: JSON.stringify({ target: `https://api.${SITE}/v1/chat/completions`, model: "fixture-model", apiKey: DEMO_API_KEY, docs: `https://help.${SITE}/guide`, locale: "en", challenge, nonce: solve(challenge) }),
    }));
  }
  /** A request from the visitor's browser for their own run (its cookie carries the capability token). */
  function demoRequest(path: string, body?: unknown) {
    return new Request(`http://localhost/api/demo/runs/${demo.id}${path}`, {
      method: "POST",
      headers: { ...visitor, cookie: `${attributionCookie}; caudals_demo=${demo.id}.${demo.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("runs the public demo from the challenge to a finished report, refuses a second one, shares it and asks for an account", async () => {
    const started = await startDemo();
    expect(started.status).toBe(201);
    demo = await started.json();
    remember(demo.id, demo.token);
    // The engine, with the site reader, the assistant and the model provider replaced.
    const runner = await import("@/lib/demo/runner");
    vi.stubGlobal("fetch", fakeModelFetch({ primary: PRIMARY, fallback: FALLBACK }).fetch);
    try {
      const deadline = Date.now() + 100_000;
      while ((await owner.query("SELECT phase FROM demo.run WHERE id=$1", [demo.id])).rows[0].phase !== "done") {
        if (Date.now() > deadline) throw new Error("demo did not finish");
        await runner.tick();
        await sleep(150);
      }
    } finally {
      vi.unstubAllGlobals();
    }
    // Both lifecycle events are written after the run's own transaction, without waiting.
    await eventually(async () => (await events("demo_started")).length === 1 && (await events("demo_finished")).length === 1);

    // One demo per visitor a day: the second start is refused and counted.
    const again = await startDemo();
    expect(again.status).toBe(429);
    expect((await again.json()).error.code).toBe("visitor_limit");

    // "Copy private link", twice: one share.
    const { POST: share } = await import("@/app/(app)/api/demo/runs/[id]/share/route");
    const params = { params: Promise.resolve({ id: demo.id }) };
    for (let attempt = 0; attempt < 2; attempt++) expect((await share(demoRequest("/share"), params)).status).toBe(200);
    // "Send to a colleague": refused without consent; one send key, retried, is one consent record.
    const key = randomUUID();
    expect((await share(demoRequest("/share", { email: COLLEAGUE_EMAIL, key }), params)).status).toBe(400);
    for (let attempt = 0; attempt < 2; attempt++) expect((await share(demoRequest("/share", { email: COLLEAGUE_EMAIL, consent: true, key }), params)).status).toBe(200);
    expect(mail.mock.calls.filter(([message]) => message.to === COLLEAGUE_EMAIL).length).toBeGreaterThan(0);

    // "Create a free account" from the report.
    const { POST: signup } = await import("@/app/(app)/api/demo/runs/[id]/signup/route");
    expect((await signup(demoRequest("/signup", { email: DEMO_EMAIL, company: "Acme Funnel" }), params)).status).toBe(200);
    remember(signupLink(DEMO_EMAIL));
  }, 180_000);

  /* ---------------------------------------------------------------- sign-up --- */

  async function completeSignup(token: string, name: string) {
    const { POST } = await import("@/app/api/evals/v1/signup/route");
    return data<{ orgId: string; evaluationId: string | null }>(await POST(new Request("http://localhost/api/evals/v1/signup", {
      method: "POST", headers: { ...JSON_HEADERS, "x-forwarded-for": VISITOR_IP }, body: JSON.stringify({ token, name, password: PASSWORD, acceptTerms: true, locale: "en" }),
    })));
  }

  it("creates the account from the demo link and imports the demo as the first evaluation", async () => {
    const created = await completeSignup(signupLink(DEMO_EMAIL), DEMO_NAME);
    expect(created.evaluationId).toEqual(expect.any(String));
    w1 = { orgId: created.orgId, evaluationId: created.evaluationId! };
    remember(w1.evaluationId);
  }, 60_000);

  it("refuses a personal address for direct sign-up and creates an account from a work address", async () => {
    const { POST } = await import("@/app/api/evals/v1/signup/request/route");
    const ask = (body: Record<string, unknown>) => POST(new Request("http://localhost/api/evals/v1/signup/request", {
      method: "POST", headers: { ...JSON_HEADERS, "x-forwarded-for": VISITOR_IP, cookie: attributionCookie }, body: JSON.stringify(body),
    }));
    const refused = await ask({ email: FREE_EMAIL });
    expect(refused.status).toBe(422);
    expect((await refused.json()).error.details.reason).toBe("free_mail");
    expect((await ask({ email: DIRECT_EMAIL, company: "Direct Funnel", locale: "en" })).status).toBe(200);
    const token = signupLink(DIRECT_EMAIL);
    remember(token);
    expect((await completeSignup(token, DIRECT_NAME)).evaluationId).toBeNull();
  }, 60_000);

  /* ----------------------------------------------------------------- intake --- */

  /** A workspace with one extracted source and generation models (copied from tests/evals/intake-v2-db.test.ts). */
  async function intakeFixture() {
    const actorId = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), artifactId = randomUUID();
    const accountId = randomUUID(), providerId = randomUUID(), priceId = randomUUID();
    const { source } = syntheticAccountingFixture(actorId);
    const anchor = source.anchors[0];
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Intake fixture", `${randomUUID()}@example.test`]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Intake fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title,description) VALUES($1,$2,'Intake fixture','Fee questions')", [projectId, orgId]);
      await db.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready',now()+interval '1 day')",
        [artifactId, orgId, projectId, source.artifact.path, "test/" + artifactId, source.artifact.sha256, source.artifact.size_bytes, source.artifact.media_type]);
      await db.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,'caudals_owned')", [source.source_id, orgId, projectId, source.title]);
      await db.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'utf8-text-v1')",
        [source.revision_id, orgId, source.source_id, artifactId, source.content_hash, source]);
      const [, start, end] = anchor.locator.split(":");
      await db.query("INSERT INTO evals.source_chunk(id,org_id,source_revision_id,ordinal,excerpt,anchor) VALUES($1,$2,$3,0,$4,$5)", [anchor.id, orgId, source.revision_id, anchor.excerpt, { start: Number(start), end: Number(end) }]);
      await db.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'intake fixture','EUR',100,true)", [accountId]);
      await db.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
        VALUES($1,$2,'dgx','http://dgx.invalid/v1','fixture-generator','fixture',ARRAY['context_analyzer','generator','judge'],'{"text":true,"boundedTokens":true,"jsonObject":true}',32768,8192,ARRAY['synthetic'],ARRAY['private'],1000,10000000,4)`, [providerId, accountId]);
      await db.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0,0,0,0,0,'fixture')", [priceId, providerId]);
      for (const role of ["context_analyzer", "generator"])
        await db.query("INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,'synthetic','private',0.0001,$5)", [orgId, role, providerId, priceId, actorId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const cite = (quote: string) => [{ sourceRevisionId: source.revision_id, anchorId: anchor.id, quote }];
    const profileOutput = {
      purpose: { value: "Explain policy A fees", confidence: 0.9, citations: cite("add a 10% service fee to the subtotal") },
      intendedUsers: { values: ["Accountants"], confidence: 0.4, citations: cite("Synthetic policy A") },
      tasks: { values: ["Fees"], confidence: 0.8, citations: cite("service fee") },
      languages: { values: ["en"], confidence: 0.9, citations: cite("round once to two decimals") },
      jurisdiction: { value: null, confidence: 0, citations: [] }, asOf: { value: null, confidence: 0, citations: [] },
      businessBoundaries: { values: ["Never round more than once"], confidence: 0.6, citations: cite("round once") },
      supportedCapabilities: { values: [], confidence: 0, citations: [] }, materialRisks: { values: [], confidence: 0, citations: [] },
      allowedActions: { values: [], confidence: 0, citations: [] }, tools: { values: [], confidence: 0, citations: [] }, criticalQuestions: [],
    };
    const draftOutput = { cases: [
      { question: "What service fee does policy A add to the subtotal?", expected: "Policy A adds a 10% service fee.", keyFacts: ["10% service fee"], sourceRevisionId: source.revision_id, anchorId: anchor.id, supportingQuote: anchor.excerpt, severity: "high", difficulty: "routine" },
      { question: "How many times is the total rounded under policy A?", expected: "It is rounded once, to two decimals.", keyFacts: ["round once to two decimals"], sourceRevisionId: source.revision_id, anchorId: anchor.id, supportingQuote: anchor.excerpt, severity: "medium", difficulty: "advanced" },
    ] };
    /** What the worker writes when the latest model step of a kind finishes (as in intake-v2-db). */
    const finish = async (jobId: string, kind: "profile" | "generate", body: unknown) => {
      const c = await owner.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
        const step = (await c.query("SELECT s.id FROM evals.workflow_step s JOIN evals.generation_job g ON g.org_id=s.org_id AND g.workflow_id=s.workflow_id WHERE g.org_id=$1 AND g.id=$2 AND s.step_kind=$3 ORDER BY s.version DESC LIMIT 1", [orgId, jobId, kind])).rows[0];
        await completeStep(c, orgId, step.id, providerId, priceId, body);
        await c.query("UPDATE evals.generation_job SET status=$3,updated_at=now()-interval '1 minute' WHERE org_id=$1 AND id=$2", [orgId, jobId, kind === "profile" ? "profile_ready" : "draft_ready"]);
        await c.query("COMMIT");
      } catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
    };
    return { actorId, orgId, projectId, source, profileOutput, draftOutput, finish, scope: { orgId, actorId } };
  }
  async function completeStep(db: PoolClient, orgId: string, stepId: string, providerId: string, priceId: string, body: unknown) {
    const attemptId = randomUUID();
    await db.query("INSERT INTO evals.execution_attempt(id,org_id,step_id,fence,ordinal,provider_revision_id,price_revision_id,status,token_bound) VALUES($1,$2,$3,0,1,$4,$5,'completed',100)", [attemptId, orgId, stepId, providerId, priceId]);
    const output = { text: JSON.stringify(body), complete: true };
    await db.query("INSERT INTO evals.execution_result(org_id,step_id,attempt_id,output,output_hash) VALUES($1,$2,$3,$4,$5)", [orgId, stepId, attemptId, output, digest(output)]);
    await db.query("UPDATE evals.workflow_step SET status='completed' WHERE org_id=$1 AND id=$2", [orgId, stepId]);
  }

  it("adds sources, confirms what we understood and prepares a test set ready for review", async () => {
    w2 = await intakeFixture();
    as(w2.actorId, w2.orgId, "owner");
    const { POST: evaluations } = await import("@/app/api/evals/v1/evaluations/route");
    const newEvaluation = { orgId: w2.orgId, projectId: w2.projectId, title: "Fee assistant", evidencePolicy: "source_grounded", commercialCap: "5", currency: "EUR" };
    const evaluationKey = randomUUID();
    const evaluation = await data<{ id: string }>(await evaluations(call("/evaluations", "POST", newEvaluation, { "idempotency-key": evaluationKey })));
    // A retried request returns the same evaluation.
    expect((await data<{ id: string }>(await evaluations(call("/evaluations", "POST", newEvaluation, { "idempotency-key": evaluationKey })))).id).toBe(evaluation.id);

    // Generation asks for "What we understood" before it writes a test.
    const started = await startAutomaticGeneration(w2.scope, evaluation.id, {
      sourceRevisionIds: [w2.source.revision_id], title: "Fee questions", executionMode: "imported_responses", promptRevision: "dgx-context-cases-v4", maxCases: 2, complexity: "balanced", locale: "en",
    }, randomUUID(), { confirmContext: true }) as { jobId: string };
    await w2.finish(started.jobId, "profile", w2.profileOutput);
    expect(await advanceAutomaticGeneration(w2.scope, evaluation.id, started.jobId, randomUUID())).toMatchObject({ status: "needs_input", reasonCode: "context_confirmation_required" });
    const { POST: confirmation } = await import("@/app/api/evals/v1/evaluations/[id]/context/confirmation/route");
    const decision = { orgId: w2.orgId, jobId: started.jobId, decision: "confirm", edits: { purpose: "Explain policy A fees to accountants", intendedUsers: ["Accountants", "Auditors"], tasks: ["Fees"] } };
    const confirmKey = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await data(await confirmation(call(`/evaluations/${evaluation.id}/context/confirmation`, "POST", decision, { "idempotency-key": confirmKey })))).toMatchObject({ decision: "confirmed", editedFields: ["purpose", "intended_users"] });
    }
    expect(await advanceAutomaticGeneration(w2.scope, evaluation.id, started.jobId, randomUUID())).toMatchObject({ status: "drafting" });
    await w2.finish(started.jobId, "generate", w2.draftOutput);
    expect(await advanceAutomaticGeneration(w2.scope, evaluation.id, started.jobId, randomUUID())).toMatchObject({ status: "needs_review" });

    // A second evaluation: a file (retried, then sent again under a new key) and an imported help centre.
    const help = await data<{ id: string }>(await evaluations(call("/evaluations", "POST", { ...newEvaluation, title: "Help centre assistant" }, { "idempotency-key": randomUUID() })));
    const { POST: uploads } = await import("@/app/api/evals/v1/sources/uploads/route");
    const bytes = Buffer.from("Refunds take 30 days. The Business plan includes phone support.");
    const file = { orgId: w2.orgId, projectId: w2.projectId, evaluationId: help.id, title: "refunds.txt", rights: "customer_owned", mediaType: "text/plain", byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    const uploadKey = randomUUID();
    const uploaded = await data<{ sourceId: string; duplicate?: boolean }>(await uploads(call("/sources/uploads", "POST", file, { "idempotency-key": uploadKey })));
    expect(uploaded.duplicate).toBeUndefined();
    expect((await data<{ sourceId: string }>(await uploads(call("/sources/uploads", "POST", file, { "idempotency-key": uploadKey })))).sourceId).toBe(uploaded.sourceId);
    expect(await data(await uploads(call("/sources/uploads", "POST", file, { "idempotency-key": randomUUID() })))).toMatchObject({ duplicate: true, sourceId: uploaded.sourceId });
    const preview = await createWebsitePreview(w2.scope, { evaluationId: help.id, url: "https://help.intake-funnel.example.com/help", sitemapUrl: null, pathPrefix: "help" }, randomUUID());
    const pages = Array.from({ length: 4 }, (_, index) => `https://help.intake-funnel.example.com/help/article-${index}`);
    // What the browser worker writes once the sitemap is read.
    await owner.query("UPDATE evals.website_page_preview SET status='ready',origin='https://help.intake-funnel.example.com',discovered_from='sitemap',pages=$2::jsonb,found_total=4,robots_excluded=0,outside_prefix=0 WHERE id=$1", [preview.previewId, JSON.stringify(pages)]);
    expect(await importWebsitePreview(w2.scope, { evaluationId: help.id, projectId: w2.projectId, previewId: preview.previewId, selectedUrls: pages.slice(0, 3) }, randomUUID())).toMatchObject({ pages: 3 });
    remember(evaluation.id, help.id, uploaded.sourceId, started.jobId);
  }, 60_000);

  /* ---------------------------------------------------------- report's life --- */

  it("runs, reports, shows, shares, downloads, presents and answers about a report, and cancels a run", async () => {
    w3 = await importedJudgeRunFixture(owner, runtimeUrl!);
    as(w3.actorId, w3.orgId, "operator");
    await scoreRun(w3.scope, w3.run.id, "customer-manual-deterministic-v1");
    report = await createReportForRun(w3.scope, { runId: w3.run.id, title: "Funnel report", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    await publishReport(w3.scope, report.reportId, report.revisionId);
    remember(w3.run.id, report.reportId, report.revisionId, w3.evaluationId, w3.suiteVersionId);
    const { orgId } = w3;

    // The workspace opens the report twice: one first view.
    const { GET: reportRoute } = await import("@/app/api/evals/v1/reports/[id]/route");
    for (let attempt = 0; attempt < 2; attempt++) await data(await reportRoute(call(`/reports/${report.reportId}?orgId=${orgId}`, "GET")));

    // A private link (retried under its key) and a link for a named recipient.
    const { POST: shares } = await import("@/app/api/evals/v1/reports/[id]/shares/route");
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const link = { orgId, reportRevisionId: report.revisionId, audience: "bearer", expiresAt, permittedFields: ["system", "metrics", "findings"] };
    const shareKey = randomUUID();
    const shared = await data<{ id: string; token: string }>(await shares(call(`/reports/${report.reportId}/shares`, "POST", link, { "idempotency-key": shareKey })));
    expect((await data<{ id: string; token: string | null }>(await shares(call(`/reports/${report.reportId}/shares`, "POST", link, { "idempotency-key": shareKey })))).id).toBe(shared.id);
    const named = await data<{ id: string; token: string }>(await shares(call(`/reports/${report.reportId}/shares`, "POST", { ...link, audience: "named_recipient", recipient: RECIPIENT_EMAIL }, { "idempotency-key": randomUUID() })));
    remember(shared.id, shared.token, named.id, named.token);

    // The recipient opens the link and downloads the Word file.
    const { POST: exchange } = await import("@/app/api/evals/v1/share/exchange/route");
    expect((await exchange(new Request("http://localhost/api/evals/v1/share/exchange", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ token: shared.token }) }))).status).toBe(200);
    const { POST: shareExport } = await import("@/app/api/evals/v1/share/export/route");
    const word = await shareExport(new Request("http://localhost/api/evals/v1/share/export", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ token: shared.token, kind: "docx", locale: "en" }) }));
    expect(word.status).toBe(200);

    // The workspace downloads its CSV through the report-artifact gateway, twice: one download.
    if (s3) {
      const { POST: exportsRoute } = await import("@/app/api/evals/v1/exports/route");
      const file = await data<{ artifactId: string }>(await exportsRoute(call("/exports", "POST", { orgId, reportRevisionId: report.revisionId, kind: "csv", locale: "en" })));
      remember(file.artifactId);
      const { GET: artifact } = await import("@/app/api/evals/v1/report-artifacts/[id]/route");
      for (let attempt = 0; attempt < 2; attempt++) expect((await artifact(call(`/report-artifacts/${file.artifactId}?orgId=${orgId}`, "GET"))).status).toBe(200);
    }

    // The readout: presented twice the same day, exported twice (one job).
    const { POST: presented } = await import("@/app/api/evals/v1/reports/[id]/readout/presented/route");
    for (let attempt = 0; attempt < 2; attempt++) expect(await data(await presented(call(`/reports/${report.reportId}/readout/presented`, "POST", { orgId, revisionId: report.revisionId, slideCount: 6 })))).toEqual({ recorded: true });
    const { POST: readoutExport } = await import("@/app/api/evals/v1/reports/[id]/readout/export/route");
    const job = await data<{ id: string }>(await readoutExport(call(`/reports/${report.reportId}/readout/export`, "POST", { orgId, revisionId: report.revisionId, locale: "en", nextStep: "pilot" })));
    expect((await data<{ id: string }>(await readoutExport(call(`/reports/${report.reportId}/readout/export`, "POST", { orgId, revisionId: report.revisionId, locale: "en", nextStep: "pilot" })))).id).toBe(job.id);
    remember(job.id);

    // "Ask your report": a compliance question is refused at once, without a model call.
    const { POST: questions } = await import("@/app/api/evals/v1/reports/[id]/questions/route");
    const asked = await data<{ id: string; status: string }>(await questions(call(`/reports/${report.reportId}/questions`, "POST", { orgId, revisionId: report.revisionId, question: "Are we compliant with the AI Act?", locale: "en" })));
    expect(asked.status).toBe("refused");
    remember(asked.id);

    // A second run of the same test set (retried under its key), then cancelled before any answer.
    const target = (await owner.query("SELECT target_revision_id FROM evals.run WHERE id=$1", [w3.run.id])).rows[0].target_revision_id as string;
    const { POST: runs } = await import("@/app/api/evals/v1/runs/route");
    const runInput = { orgId, evaluationId: w3.evaluationId, targetRevisionId: target, suiteVersionId: w3.suiteVersionId, executionMode: "imported_responses", plan: { purpose: "Funnel rerun" } };
    const runKey = randomUUID();
    const rerun = await data<{ id: string; status: string }>(await runs(call("/runs", "POST", runInput, { "idempotency-key": runKey })));
    expect(rerun.status).toBe("awaiting_answers");
    expect((await data<{ id: string }>(await runs(call("/runs", "POST", runInput, { "idempotency-key": runKey })))).id).toBe(rerun.id);
    const { POST: control } = await import("@/app/api/evals/v1/runs/[id]/control/route");
    expect(await data(await control(call(`/runs/${rerun.id}/control`, "POST", { orgId, action: "cancel" })))).toMatchObject({ status: "canceled" });
    remember(rerun.id, target);
  }, 120_000);

  /* ------------------------------------------------------------- monitoring --- */

  it("finds sources on the web, creates an API token and a destination, and schedules runs within the limits", async () => {
    const { orgId, actorId, evaluationId, providerId, priceId } = w3;
    as(actorId, orgId, "operator");

    // "Find sources on the web" (as tests/evals/web-discovery-db.test.ts): Settings turn web research on for
    // the context role, the worker answers the queued call, and the next read settles it.
    const contextProvider = randomUUID(), contextPrice = randomUUID();
    await owner.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
      SELECT $1,account_id,adapter,endpoint,'fixture-reader',owner_id,ARRAY['context_analyzer'],capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit FROM evals.provider_revision WHERE id=$2`, [contextProvider, providerId]);
    await owner.query(`INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source)
      SELECT $1,$2,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source FROM evals.price_revision WHERE id=$3`, [contextPrice, contextProvider, priceId]);
    await owner.query(`INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by,web_research)
      VALUES($1,'context_analyzer',$2,$3,'synthetic','private',0.0001,$4,true)`, [orgId, contextProvider, contextPrice, actorId]);
    const webSources = await import("@/app/api/evals/v1/evaluations/[id]/web-sources/route");
    expect(await data(await webSources.POST(call(`/evaluations/${evaluationId}/web-sources`, "POST", { orgId })))).toMatchObject({ status: "queued" });
    const step = await withTenant(w3.scope, async (c) => (await c.query("SELECT s.id,s.input_hash FROM evals.web_discovery_job j JOIN evals.workflow_step s ON (s.org_id,s.id)=(j.org_id,j.step_id) WHERE j.org_id=$1", [orgId])).rows[0]);
    const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, workerPool);
    const worker = new InvocationWorker({ tx, keys: new Map(), actorId: "discovery-worker", workerId: randomUUID(), leaseSeconds: 30,
      invoke: async () => ({ text: JSON.stringify({ pages: [{ url: "https://help.example.com/fees", title: "Fees", why: "Fee table" }] }), complete: true, finishReason: "stop", latencyMs: 10, citations: [{ url: "https://example.org/terms", title: "Terms" }] }) });
    await worker.handle({ orgId, stepId: step.id, inputHash: step.input_hash });
    for (let attempt = 0; attempt < 2; attempt++) expect(await data(await webSources.GET(call(`/evaluations/${evaluationId}/web-sources?orgId=${orgId}`, "GET")))).toMatchObject({ status: "completed" });

    // A read-only API token; its value is shown once.
    const { POST: tokens } = await import("@/app/api/evals/v1/tokens/route");
    const token = await data<{ id: string; token: string }>(await tokens(call("/tokens", "POST", { orgId, name: "Release pipeline", scopes: ["runs:read", "reports:read"], expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() })));
    remember(token.id, token.token);
    // A signed webhook (the route's own path, with the destination's DNS answer supplied).
    const hook = await createWebhookEndpoint(w3.scope, { label: "Release alerts", url: "https://hooks.example.com/caudals/funnel", events: ["run_completed", "regression"] }, { lookup: publicDns });
    remember(hook.id, "secret" in hook ? hook.secret : null);

    // Monitoring is enabled for the workspace, which now tests its live API with an approved
    // deployed-system version of the test set (imported answers cannot be scheduled; as in
    // tests/evals/stage-d-monitor-db.test.ts).
    const targetId = randomUUID(), targetRevisionId = randomUUID(), suiteVersionId = randomUUID();
    const config = { schema_version: "1.0", kind: "https_json", endpoint: "https://api.example.test/assistant" };
    const frozen = (await owner.query("SELECT suite_id,manifest FROM evals.suite_version WHERE id=$1", [w3.suiteVersionId])).rows[0];
    const { content_hash: _hash, ...base } = frozen.manifest;
    const manifest = withContentHash({ ...base, suite_version_id: suiteVersionId, execution_mode: "deployed_system" });
    const c = await owner.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await c.query("UPDATE evals.workspace_entitlement SET can_schedule=true,monthly_spend_limit=500 WHERE org_id=$1", [orgId]);
      await c.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Support API')", [targetId, orgId, w3.projectId]);
      await c.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [targetRevisionId, orgId, targetId, sha256(canonicalJson(config)), config]);
      await c.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, frozen.suite_id, manifest.content_hash, manifest]);
      for (const [ordinal, item] of w3.cases.entries()) await c.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,$4)", [orgId, suiteVersionId, item.revision_id, ordinal]);
      await c.query("UPDATE evals.evaluation SET preparation_status='ready',selected_suite_version_id=$3 WHERE org_id=$1 AND id=$2", [orgId, evaluationId, suiteVersionId]);
      await c.query("COMMIT");
    } catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
    const { POST: schedules } = await import("@/app/api/evals/v1/schedules/route");
    const schedule = { orgId, evaluationId, targetRevisionId, suiteVersionId, timezone: "Europe/Madrid", cadence: "weekly", localTime: "09:00", weekday: 1, dayOfMonth: null, maxRunSpend: "200", currency: "EUR", sourceMaxAgeDays: null };
    // Over the monthly spending limit: refused, and counted as a limit hit.
    const over = await schedules(call("/schedules", "POST", { ...schedule, maxRunSpend: "1000" }, { "idempotency-key": randomUUID() }));
    expect(over.status).toBe(409);
    expect((await over.json()).error.code).toBe("BUDGET_PAUSED");
    const scheduleKey = randomUUID();
    const created = await data<{ id: string }>(await schedules(call("/schedules", "POST", schedule, { "idempotency-key": scheduleKey })));
    expect((await data<{ id: string }>(await schedules(call("/schedules", "POST", schedule, { "idempotency-key": scheduleKey })))).id).toBe(created.id);
    remember(created.id, targetRevisionId, suiteVersionId);
  }, 60_000);

  /* ---------------------------------------------------------- client events --- */

  /** The body `trackProductEvent` (lib/analytics/funnel-events.ts) sends after consent, from `pathname`. */
  function clientBody(eventName: ClientEventName, payload: ProductEventPayload, pathname: string, sessionId: string) {
    return { eventName, payload: sanitizePayload(eventName, payload), attribution: sanitizeAttribution({ utm_source: "newsletter", utm_medium: "email", utm_campaign: "launch-week" }), path: analyticsPath(pathname), sessionId, consent: true };
  }
  async function track(body: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import("@/app/(app)/api/analytics/track/route");
    return POST(new Request("http://localhost/api/analytics/track", { method: "POST", headers: { ...JSON_HEADERS, "x-forwarded-for": VISITOR_IP, ...headers }, body: JSON.stringify(body) }));
  }

  it("ingests the six client events once the visitor has consented, and stores nothing without consent", async () => {
    const sessionId = randomUUID();
    const sent: Array<[ClientEventName, ProductEventPayload, string]> = [
      ["page_view", { locale: "en", referrer: "news.example.com" }, "/en"],
      ["demo_viewed", { locale: "es" }, "/es/demo"],
      ["pilot_requested", { surface: "public" }, "/en/sectors/insurance"],
      ["readout_link_clicked", { surface: "report" }, `/workspace/reports/${report.reportId}`],
      ["expert_review_requested", { surface: "report" }, `/workspace/reports/${report.reportId}`],
      ["example_viewed", { surface: "public" }, "/en/sample-report"],
      ["example_viewed", { surface: "workspace" }, "/workspace/example"],
      ["example_viewed", { surface: "pdf" }, "/en/sample-report"],
    ];
    for (const [name, payload, pathname] of sent) {
      const response = await track(clientBody(name, payload, pathname, sessionId));
      expect(response.status, name).toBe(200);
    }
    // A client that skips its own scrubbing is scrubbed on the server: unknown keys and addresses are dropped.
    expect((await track({ ...clientBody("page_view", { locale: "en" }, "/en/contact", sessionId), payload: { locale: "en", email: HOSTILE_EMAIL, referrer: HOSTILE_EMAIL }, attribution: { utm_source: "newsletter", utm_content: HOSTILE_EMAIL, gclid: "abc" } })).status).toBe(200);

    // Without consent (missing or false), from another site, or not a client event: refused, nothing stored.
    const before = (await events()).length;
    const { consent: _consent, ...withoutConsent } = clientBody("page_view", { locale: "en" }, "/en", sessionId);
    expect((await track(withoutConsent)).status).toBe(400);
    expect((await track({ ...withoutConsent, consent: false })).status).toBe(400);
    expect((await track(clientBody("page_view", { locale: "en" }, "/en", sessionId), { origin: "https://elsewhere.example.com" })).status).toBe(403);
    expect((await track({ ...clientBody("page_view", { locale: "en" }, "/en", sessionId), eventName: "account_created" })).status).toBe(400);
    expect((await events()).length).toBe(before);
  });

  /* --------------------------------------------------------------- the record --- */

  it("stores every non-billing §4.20 event with allowlisted properties and no personal data", async () => {
    const rows = await events();
    const expected = [
      ...CLIENT_EVENT_NAMES.map((name) => [name, "client"] as const),
      ...SERVER_EVENT_NAMES.filter((name) => !BILLING.has(name)).map((name) => [name, "server"] as const),
    ];
    expect(expected).toHaveLength(28);
    const count = (name: string, where: (row: Row) => boolean = () => true) => rows.filter((row) => row.event_name === name && where(row)).length;
    // The record for docs/launch: one line per event.
    for (const [name, source] of expected) console.log(`funnel_event ${name} source=${source} count=${count(name, (row) => row.source === source)}`);
    expect(expected.filter(([name, source]) => count(name, (row) => row.source === source) === 0).map(([name]) => name)).toEqual([]);
    expect(rows.filter((row) => BILLING.has(row.event_name))).toEqual([]);

    for (const row of rows) {
      const label = `${row.event_name} ${row.id}`;
      expect((CLIENT_EVENT_NAMES as readonly string[]).includes(row.event_name) ? "client" : (SERVER_EVENT_NAMES as readonly string[]).includes(row.event_name) ? "server" : "unknown", label).toBe(row.source);
      expect(row.event_category, label).toBe("product");
      // Metadata holds the event's allowlisted properties only, already in their sanitised form.
      expect(sanitizePayload(row.event_name as ProductEventName, row.metadata), label).toEqual(row.metadata);
      expect(Object.keys(row.attribution).filter((key) => !(ATTRIBUTION_KEYS as readonly string[]).includes(key)), label).toEqual([]);
      expect(sanitizeAttribution(row.attribution), label).toEqual(row.attribution);
      expect(row.user_id, label).toBeNull();
      expect(row.user_role, label).toBeNull();
      if (row.run_id !== null) expect(row.run_id, label).toMatch(/^[a-f0-9]{64}$/);
      if (row.path !== null) {
        expect(analyticsPath(row.path), label).toBe(row.path);
        expect(row.path, label).not.toMatch(/[?#=&@]/);
      }
      expect(JSON.stringify([row.metadata, row.attribution, row.path]), label).not.toMatch(UUID_PATTERN);
    }
    // No address, name, password, token, key, IP or raw run/report identifier anywhere in the stored rows.
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("@");
    expect([...secrets].filter((value) => dump.includes(value)).length).toBe(0);

    // First touch follows the visitor from the demo to the account; the address in a campaign label is dropped.
    const touch = { utm_source: "linkedin", utm_campaign: "demo-launch", partner: "agency-one" };
    expect(rows.find((row) => row.event_name === "demo_started")!.attribution).toEqual(touch);
    expect(rows.find((row) => row.event_name === "account_created" && row.metadata.acquisition === "demo")).toMatchObject({ org_id: w1.orgId, attribution: touch, metadata: { acquisition: "demo", plan: "free" } });
    expect(count("account_created", (row) => row.metadata.acquisition === "direct")).toBe(1);
    expect(rows.filter((row) => row.event_name === "limit_hit").map((row) => row.metadata.kind).sort()).toEqual(["BUDGET_PAUSED", "signup_free_mail", "visitor_limit"]);
    expect(rows.filter((row) => row.event_name === "sources_added").map((row) => row.metadata.source_kind).sort()).toEqual(["file", "help_centre", "website"]);
    expect(rows.filter((row) => row.event_name === "example_viewed").map((row) => row.metadata.surface).sort()).toEqual(["pdf", "public", "workspace"]);
    expect(rows.find((row) => row.event_name === "context_confirmed")!.metadata).toEqual({ count: 2, edited_fields: "purpose/intended_users" });
    expect(rows.find((row) => row.event_name === "test_set_ready")!.metadata).toMatchObject({ question_count: 2 });
    expect(rows.find((row) => row.event_name === "run_finished")!.metadata).toMatchObject({ outcome: "canceled" });
    expect(rows.find((row) => row.event_name === "report_question_asked")!.metadata).toEqual({ outcome: "refused", credits: 0 });
    expect(rows.find((row) => row.event_name === "scan_detected")!.metadata).toMatchObject({ source_kind: "website" });
    // The scrubbed client event kept only its allowlisted parts.
    expect(rows.find((row) => row.event_name === "page_view" && row.path === "/en/contact")).toMatchObject({ metadata: { locale: "en" }, attribution: { utm_source: "newsletter" } });

    // Replays and retries add nothing where the emitter deduplicates.
    expect(count("demo_started")).toBe(1);
    expect(count("demo_finished")).toBe(1);
    expect(count("demo_report_shared", (row) => row.metadata.channel === undefined)).toBe(1);
    expect(count("demo_report_shared", (row) => row.metadata.channel === "email")).toBe(1);
    expect(count("demo_signup_requested")).toBe(1);
    expect(count("evaluation_created", (row) => row.org_id === w1.orgId)).toBe(1);
    expect(count("evaluation_created", (row) => row.org_id === w2.orgId)).toBe(2);
    expect(count("sources_added", (row) => row.org_id === w2.orgId && row.metadata.source_kind === "file")).toBe(1);
    expect(count("context_confirmed")).toBe(1);
    expect(count("test_set_ready")).toBe(1);
    expect(count("run_started", (row) => row.org_id === w3.orgId)).toBe(2);
    expect(count("run_finished")).toBe(1);
    expect(count("report_viewed", (row) => row.org_id === w3.orgId)).toBe(1);
    expect(count("report_shared", (row) => row.org_id === w3.orgId)).toBe(2);
    expect(count("export_downloaded", (row) => row.metadata.format === "docx")).toBe(1);
    if (s3) expect(count("export_downloaded", (row) => row.metadata.format === "csv")).toBe(1);
    expect(count("readout_presented")).toBe(1);
    expect(count("readout_exported")).toBe(1);
    expect(count("scan_detected")).toBe(1);
    expect(count("schedule_created")).toBe(1);
  });
});
