import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { getPostgresPool } from "@/lib/db/client";
import { getEvalsPool, withTenant } from "@/lib/evals/repositories/db";
import { createPrefixedId } from "@/lib/operator/ids";

// Everything outside the database is replaced: no email leaves, and the
// limiter (tested in the route's unit tests) always allows.
const mail = vi.hoisted(() => vi.fn(async (_message: { to: string; subject: string; text: string }) => ({ data: { id: "fake" }, error: null })));
vi.mock("@/lib/resend/client", () => ({ getResendClient: () => ({ emails: { send: mail } }) }));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 0, resetAt: Date.now() + 1000 })),
}));
vi.mock("@/lib/demo/import", () => ({ importDemo: vi.fn(async () => ({ evaluationId: null })) }));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const headers = { "content-type": "application/json", host: "localhost", origin: "http://localhost" };

/** Migration 085 on the disposable database: launch L-05 direct work-email sign-up. */
describe.skipIf(!ownerUrl || !runtimeUrl)("direct work-email sign-up (migration 085)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  beforeAll(() => {
    Object.assign(process.env, {
      EVALS_DATABASE_URL: runtimeUrl, DATABASE_URL: runtimeUrl, RESEND_FROM_EMAIL: "signup@example.test",
      SELF_SERVE_DIRECT_SIGNUP: "true", SIGNUP_TERMS_REQUIRED: "true", ANALYTICS_EVENTS_V2: "true",
    });
  });
  beforeEach(() => mail.mockClear());
  afterAll(async () => {
    for (const key of ["SELF_SERVE_DIRECT_SIGNUP", "SIGNUP_TERMS_REQUIRED", "ANALYTICS_EVENTS_V2", "SELF_SERVE_SIGNUP_EXCEPTIONS"]) delete process.env[key];
    await owner.end();
    await getEvalsPool().end();
    await getPostgresPool().end();
  });

  /** A fresh company domain per test, so tests never share the domain rule. */
  const company = () => `acme-${randomUUID().slice(0, 8)}.es`;
  const request = async (body: Record<string, unknown>, extra: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/evals/v1/signup/request/route");
    return POST(new Request("http://localhost/api/evals/v1/signup/request", { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body) }));
  };
  const complete = async (body: Record<string, unknown>) => {
    const { POST } = await import("@/app/api/evals/v1/signup/route");
    return POST(new Request("http://localhost/api/evals/v1/signup", { method: "POST", headers, body: JSON.stringify(body) }));
  };
  const lastToken = () => /\/workspace\/signup#([A-Za-z0-9_-]{43})/.exec(mail.mock.calls.at(-1)?.[0].text ?? "")?.[1];
  const finish = (token: string) => complete({ token, name: "Ana Pérez", password: "a-long-password-1", acceptTerms: true, locale: "es" });
  const rows = async (email: string) => (await owner.query(
    "SELECT signup_source, email_domain, domain_rule, attribution, demo_run_id, extract(epoch FROM expires_at - created_at)::int AS ttl_seconds, consumed_at, org_id FROM evals.self_serve_signup WHERE email=$1 ORDER BY created_at", [email])).rows;
  /** Runtime-role call of the request function, as lib/evals/signup.ts makes it. */
  const requestLink = (email: string, domain: string, rule = true, source = "direct", runId: string | null = null) =>
    withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query(
      "SELECT evals.request_self_serve_signup($1,$2,'Fixture',$3,'en',$4,$5,$6,'{}'::jsonb) AS outcome",
      [sha256(randomUUID()), email, runId, source, domain, rule])).rows[0].outcome as string);
  const enroll = (token: string) => withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query(
    "SELECT * FROM evals.enroll_self_serve($1,'Fixture',$2,$3,$4)", [sha256(token), "x".repeat(64), createPrefixedId("au"), createPrefixedId("aa")])).rows[0]);
  /** Stores a link with a known token through the runtime role and returns the token. */
  const knownLink = async (email: string, domain: string, rule = true) => {
    const token = randomUUID().replaceAll("-", "").padEnd(43, "x").slice(0, 43);
    const outcome = await withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query(
      "SELECT evals.request_self_serve_signup($1,$2,'Fixture',NULL,'en','direct',$3,$4,'{}'::jsonb) AS outcome", [sha256(token), email, domain, rule])).rows[0].outcome);
    expect(outcome).toBe("link");
    return token;
  };

  it("runs the whole path: request, single-use two-day link, free workspace, terms, direct acquisition with first touch", async () => {
    const domain = company();
    const email = `ana@ventas.${domain}`;
    const cookie = `caudals_attribution_v2=${encodeURIComponent(JSON.stringify({ utm_source: "linkedin", utm_campaign: "l05" }))}`;
    const response = await request({ email, company: "Acme Seguros", locale: "es" }, { cookie });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ sent: true });
    const [link] = await rows(email);
    expect(link).toMatchObject({ signup_source: "direct", email_domain: domain, domain_rule: true, attribution: { utm_source: "linkedin", utm_campaign: "l05" }, demo_run_id: null });
    expect(link.ttl_seconds).toBe(2 * 24 * 3600);
    expect(mail).toHaveBeenCalledTimes(1);
    const token = lastToken()!;

    const lookup = await complete({ token });
    expect((await lookup.json()).data).toEqual({ email, workspaceName: "Acme Seguros", locale: "es", source: "direct" });

    const created = await finish(token);
    expect(created.status).toBe(200);
    const { data, meta } = await created.json();
    expect(data).toMatchObject({ email, evaluationId: null });
    const workspace = (await owner.query(
      `SELECT w.name, w.acquisition_attribution, e.plan, e.max_systems, e.max_runs_per_month, m.role
       FROM evals.workspace w JOIN evals.workspace_entitlement e ON e.org_id=w.id JOIN evals.membership m ON m.org_id=w.id WHERE w.id=$1`, [data.orgId])).rows[0];
    expect(workspace).toEqual({ name: "Acme Seguros", acquisition_attribution: { utm_source: "linkedin", utm_campaign: "l05" }, plan: "free", max_systems: 1, max_runs_per_month: 3, role: "owner" });
    const terms = (await owner.query(
      "SELECT t.document, t.context, t.request_id FROM evals.terms_acceptance t JOIN public.auth_user u ON u.id=t.user_id WHERE u.email=$1 ORDER BY t.document", [email])).rows;
    expect(terms).toEqual([
      { document: "privacy", context: "signup", request_id: meta.request_id },
      { document: "terms", context: "signup", request_id: meta.request_id },
    ]);
    const event = (await owner.query("SELECT metadata, attribution FROM public.product_analytics_event WHERE event_name='account_created' AND org_id=$1", [data.orgId])).rows;
    expect(event).toEqual([{ metadata: { acquisition: "direct", plan: "free" }, attribution: { utm_source: "linkedin", utm_campaign: "l05" } }]);

    // Single use: the link is consumed and cannot be looked up or used again.
    expect((await rows(email))[0].consumed_at).not.toBeNull();
    expect((await complete({ token })).status).toBe(404);
    expect((await finish(token)).status).toBe(404);
  }, 30000);

  it("allows one self-serve workspace per registrable domain; a second request is emailed the invitation note", async () => {
    const domain = company();
    await request({ email: `first@${domain}`, company: "Acme" });
    expect((await finish(lastToken()!)).status).toBe(200);

    const replies = [];
    for (const email of [`second@${domain}`, `third@eu.${domain}`]) {
      const response = await request({ email, company: "Acme" });
      replies.push([response.status, (await response.json()).data]);
      expect(await rows(email)).toEqual([]);
      expect(mail.mock.calls.at(-1)?.[0]).toMatchObject({ to: email, subject: "Your company already has a Caudals workspace" });
    }
    expect(replies).toEqual([[200, { sent: true }], [200, { sent: true }]]);
  }, 30000);

  it("tells an existing account to sign in, stores nothing, and answers like a new link", async () => {
    const domain = company();
    const email = `owner@${domain}`;
    await owner.query(`INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,'Existing',$2,true)`, [createPrefixedId("au"), email]);
    const response = await request({ email, company: "Acme" });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ sent: true });
    expect(await rows(email)).toEqual([]);
    expect(mail.mock.calls.at(-1)?.[0]).toMatchObject({ to: email, subject: "You already have a Caudals account" });
  });

  it("refuses the second of two links for one company at enrollment, also when both finish at once", async () => {
    const domain = company();
    const first = await knownLink(`a@${domain}`, domain);
    const second = await knownLink(`b@${domain}`, domain);
    expect((await enroll(first)).signup_source).toBe("direct");
    await expect(enroll(second)).rejects.toThrow(/SIGNUP_DOMAIN_TAKEN/);
    // Through the API, the link holder learns why.
    const response = await finish(second);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SIGNUP_DOMAIN_TAKEN");

    const racing = company();
    const tokens = [await knownLink(`a@${racing}`, racing), await knownLink(`b@${racing}`, racing), await knownLink(`c@${racing}`, racing)];
    const results = await Promise.allSettled(tokens.map(enroll));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected").map((result) => String((result as PromiseRejectedResult).reason))).toEqual([
      expect.stringMatching(/SIGNUP_DOMAIN_TAKEN/), expect.stringMatching(/SIGNUP_DOMAIN_TAKEN/),
    ]);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.self_serve_signup WHERE email_domain=$1 AND org_id IS NOT NULL", [racing])).rows[0].n).toBe(1);
  }, 30000);

  it("frees the domain when the workspace is deleted, and exempts ops exceptions", async () => {
    const domain = company();
    expect((await enroll(await knownLink(`a@${domain}`, domain))).org_id).toBeTruthy();
    expect(await requestLink(`b@${domain}`, domain)).toBe("domain_taken");
    // An exception (domain rule off) may open another workspace.
    expect((await enroll(await knownLink(`partner@${domain}`, domain, false))).org_id).toBeTruthy();
    // The audited deletion workflow ends by tombstoning the workspace (deleted_at).
    await owner.query("UPDATE evals.workspace SET deleted_at=now() WHERE id IN (SELECT org_id FROM evals.self_serve_signup WHERE email_domain=$1 AND org_id IS NOT NULL)", [domain]);
    expect(await requestLink(`c@${domain}`, domain)).toBe("link");
  });

  it("keeps the demo path: same signature and answer, no domain rule, but its workspaces count for direct requests", async () => {
    const domain = company();
    const demoToken = randomUUID().replaceAll("-", "").padEnd(43, "y").slice(0, 43);
    const existing = await withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query(
      "SELECT evals.request_self_serve_signup($1,$2,'Demo fixture',NULL,'en') AS existing", [sha256(demoToken), `demo@${domain}`])).rows[0].existing);
    expect(existing).toBe(false);
    expect((await rows(`demo@${domain}`))[0]).toMatchObject({ signup_source: "demo", email_domain: domain, domain_rule: false });
    const lookup = await complete({ token: demoToken });
    expect((await lookup.json()).data.source).toBe("demo");
    expect((await enroll(demoToken)).signup_source).toBe("demo");
    // A second demo sign-up for the same company is still allowed…
    expect(await requestLink(`demo2@${domain}`, domain, false, "demo")).toBe("link");
    // …but a direct request now meets the existing workspace.
    expect(await requestLink(`direct@${domain}`, domain)).toBe("domain_taken");
    // The demo answer for an existing account is unchanged.
    expect(await withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query(
      "SELECT evals.request_self_serve_signup($1,$2,'Demo fixture',NULL,'en') AS existing", [sha256(randomUUID()), `demo@${domain}`])).rows[0].existing)).toBe(true);
  });

  it("validates the domain, the source and the per-address link limit in the function", async () => {
    const domain = company();
    await expect(requestLink(`a@${domain}`, "other-company.es")).rejects.toThrow(/INPUT_INVALID/);
    await expect(requestLink(`a@${domain}`, "es")).rejects.toThrow(/INPUT_INVALID/);
    await expect(requestLink(`a@${domain}`, domain, true, "partner")).rejects.toThrow(/INPUT_INVALID/);
    await expect(requestLink(`a@${domain}`, domain, true, "direct", randomUUID())).rejects.toThrow(/INPUT_INVALID/);
    for (let i = 0; i < 3; i++) expect(await requestLink(`a@${domain}`, domain)).toBe("link");
    await expect(requestLink(`a@${domain}`, domain)).rejects.toThrow(/SIGNUP_LIMIT/);
  });

  it("keeps links and the domain check out of the runtime's direct reach", async () => {
    await expect(withTenant({ orgId: "", actorId: "" }, (db) => db.query("SELECT evals.self_serve_domain_taken('acme.es')"))).rejects.toThrow(/permission denied/);
    const visible = await withTenant({ orgId: "", actorId: "" }, (db) => db.query("SELECT email FROM evals.self_serve_signup"))
      .then((result) => result.rows.length, (error) => (/permission denied/.test(String(error)) ? 0 : -1));
    expect(visible).toBe(0);
    const expired = randomUUID().replaceAll("-", "").padEnd(43, "z").slice(0, 43);
    const domain = company();
    await withTenant({ orgId: "", actorId: "" }, (db) => db.query(
      "SELECT evals.request_self_serve_signup($1,$2,'Fixture',NULL,'en','direct',$3,true,'{}'::jsonb)", [sha256(expired), `expired@${domain}`, domain]));
    await owner.query("UPDATE evals.self_serve_signup SET expires_at=now() - interval '1 second' WHERE token_hash=$1", [sha256(expired)]);
    expect((await complete({ token: expired })).status).toBe(404);
    await expect(enroll(expired)).rejects.toThrow(/SCOPE_DENIED/);
  });

  it("the rollback refuses while direct sign-ups exist", async () => {
    const sql = await readFile(new URL("../../db/rollbacks/085_evals_signup_domains_down.sql", import.meta.url), "utf8");
    const client = await owner.connect();
    try {
      await expect(client.query(sql)).rejects.toThrow(/Rollback blocked: \d+ direct sign-up records exist/);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect((await owner.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='evals' AND table_name='self_serve_signup' AND column_name='signup_source'")).rows[0].n).toBe(1);
  });

  it("the rollback restores the 075 functions once no direct sign-up exists (checked in a transaction, then undone)", async () => {
    const sql = (await readFile(new URL("../../db/rollbacks/085_evals_signup_domains_down.sql", import.meta.url), "utf8"))
      .replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM evals.self_serve_signup WHERE signup_source='direct'");
      await client.query(sql);
      const lookup = (await client.query("SELECT pg_get_function_result('evals.self_serve_signup_lookup(text)'::regprocedure) AS result")).rows[0].result;
      expect(lookup).toBe("TABLE(email text, workspace_name text, locale text)");
      expect((await client.query("SELECT to_regprocedure('evals.request_self_serve_signup(text,text,text,uuid,text,text,text,boolean,jsonb)') AS fn")).rows[0].fn).toBeNull();
      const token = randomUUID();
      expect((await client.query("SELECT evals.request_self_serve_signup($1,$2,'Rollback',NULL,'en') AS existing", [sha256(token), `rollback@${company()}`])).rows[0].existing).toBe(false);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect((await owner.query("SELECT to_regprocedure('evals.request_self_serve_signup(text,text,text,uuid,text,text,text,boolean,jsonb)') AS fn")).rows[0].fn).not.toBeNull();
  });
});
