import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import { recordTermsAcceptance } from "../../lib/legal/acceptance";
import { signupAcceptance } from "../../lib/legal/versions";

// The sign-up route's own dependencies outside the database.
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, resetAt: Date.now() + 1000 })),
}));
vi.mock("@/lib/demo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demo/client")>()),
  clientHash: () => "0".repeat(64),
}));
vi.mock("@/lib/demo/store", () => ({ getRun: vi.fn(async () => null) }));
vi.mock("@/lib/demo/import", () => ({ importDemo: vi.fn() }));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Migration 081 on the disposable database: launch L-01 terms acceptance. */
(ownerUrl && runtimeUrl ? describe : describe.skip)("terms acceptance records (migration 081)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  beforeAll(() => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
  });
  afterAll(async () => {
    delete process.env.SIGNUP_TERMS_REQUIRED;
    await owner.end();
    await getEvalsPool().end();
  });

  async function person() {
    const userId = createPrefixedId("au");
    await owner.query(`INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,'Terms fixture',$2,true)`, [userId, `${randomUUID()}@example.test`]);
    return userId;
  }
  async function workspace(ownerId: string) {
    const orgId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Terms fixture',$2)", [orgId, ownerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, ownerId]);
    return orgId;
  }
  const record = (actorId: string, orgId: string | null, requestId: string = randomUUID(), document = "terms", context = "signup") =>
    withTenant({ orgId: orgId ?? "", actorId }, async (db) =>
      (await db.query("SELECT evals.record_terms_acceptance($1,$2,$3,$4,$5,$6) AS id", [orgId, document, "2026-10-11", context, "en", requestId])).rows[0].id as string);

  it("records an acceptance for the acting member and shows it to them", async () => {
    const userId = await person();
    const orgId = await workspace(userId);
    const ids = await withTenant({ orgId: "", actorId: userId }, (db) =>
      recordTermsAcceptance(db, { orgId, documents: signupAcceptance(), context: "signup", locale: "es", requestId: "req-1" }));
    expect(ids).toHaveLength(2);
    const rows = await withTenant({ orgId: "", actorId: userId }, async (db) =>
      (await db.query("SELECT user_id, org_id, document, version, context, locale, request_id FROM evals.terms_acceptance ORDER BY document")).rows);
    expect(rows).toEqual([
      { user_id: userId, org_id: orgId, document: "privacy", version: "2026-10-11", context: "signup", locale: "es", request_id: "req-1" },
      { user_id: userId, org_id: orgId, document: "terms", version: "2026-10-11", context: "signup", locale: "es", request_id: "req-1" },
    ]);
  });

  it("is idempotent per request id and refuses a replay for another workspace", async () => {
    const userId = await person();
    const orgId = await workspace(userId);
    const first = await record(userId, orgId, "same-request");
    expect(await record(userId, orgId, "same-request")).toBe(first);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.terms_acceptance WHERE user_id=$1", [userId])).rows[0].n).toBe(1);
    await expect(record(userId, null, "same-request")).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
    // A new request is a new acceptance, e.g. a later version or context.
    await record(userId, orgId, "other-request", "dpa", "dpa");
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.terms_acceptance WHERE user_id=$1", [userId])).rows[0].n).toBe(2);
  });

  it("requires an actor and membership of the named workspace", async () => {
    const userId = await person();
    const stranger = await person();
    const orgId = await workspace(userId);
    await expect(record("", orgId)).rejects.toThrow(/SESSION_REQUIRED/);
    await expect(record(stranger, orgId)).rejects.toThrow(/SCOPE_DENIED/);
    // Without a workspace (for example a future checkout before one exists) the actor alone is recorded.
    await expect(record(stranger, null)).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it("checks document, context and version formats", async () => {
    const userId = await person();
    await expect(record(userId, null, randomUUID(), "Terms of Service")).rejects.toThrow(/terms_acceptance_document_format/);
    await expect(record(userId, null, randomUUID(), "terms", "sign up")).rejects.toThrow(/terms_acceptance_context_format/);
    await expect(withTenant({ orgId: "", actorId: userId }, (db) =>
      db.query("SELECT evals.record_terms_acceptance(NULL,'terms','latest','signup',NULL,NULL)"))).rejects.toThrow(/terms_acceptance_version_format/);
  });

  it("is append-only: the runtime cannot write directly and nobody can change or delete a row", async () => {
    const userId = await person();
    const id = await record(userId, null);
    await expect(withTenant({ orgId: "", actorId: userId }, (db) =>
      db.query("INSERT INTO evals.terms_acceptance(user_id,document,version,context) VALUES($1,'terms','2026-10-11','signup')", [userId]))).rejects.toThrow(/permission denied/);
    await expect(withTenant({ orgId: "", actorId: userId }, (db) =>
      db.query("UPDATE evals.terms_acceptance SET version='2026-10-12' WHERE id=$1", [id]))).rejects.toThrow(/permission denied/);
    await expect(owner.query("UPDATE evals.terms_acceptance SET version='2026-10-12' WHERE id=$1", [id])).rejects.toThrow(/immutable terms acceptance/);
    await expect(owner.query("DELETE FROM evals.terms_acceptance WHERE id=$1", [id])).rejects.toThrow(/immutable terms acceptance/);
    await expect(owner.query("TRUNCATE evals.terms_acceptance")).rejects.toThrow(/immutable terms acceptance/);
  });

  it("shows a workspace's acceptances to its members and nobody else", async () => {
    const userId = await person();
    const member = await person();
    const stranger = await person();
    const orgId = await workspace(userId);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'viewer')", [orgId, member]);
    const id = await record(userId, orgId, randomUUID(), "dpa", "dpa");
    const visible = (actorId: string, scope: string) => withTenant({ orgId: scope, actorId }, async (db) =>
      (await db.query("SELECT id FROM evals.terms_acceptance WHERE id=$1", [id])).rowCount);
    expect(await visible(member, orgId)).toBe(1);
    expect(await visible(stranger, orgId)).toBe(0);
    expect(await visible(stranger, "")).toBe(0);
  });

  it("the rollback refuses while acceptance records exist", async () => {
    const sql = await readFile(new URL("../../db/rollbacks/081_evals_terms_acceptance_down.sql", import.meta.url), "utf8");
    const client = await owner.connect();
    try {
      await expect(client.query(sql)).rejects.toThrow(/Rollback blocked: \d+ terms acceptance records exist/);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect((await owner.query("SELECT to_regclass('evals.terms_acceptance') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });

  describe("sign-up API against the database", () => {
    async function link() {
      const token = randomUUID().replaceAll("-", "").padEnd(43, "x").slice(0, 43);
      const email = `${randomUUID()}@acme.example`;
      await withTenant({ orgId: "", actorId: "" }, (db) =>
        db.query("SELECT evals.request_self_serve_signup($1,$2,'Acme',NULL,'es')", [sha256(token), email]));
      return { token, email };
    }
    const post = async (body: Record<string, unknown>) => {
      const { POST } = await import("../../app/api/evals/v1/signup/route");
      return POST(new Request("https://app.caudals.com/api/evals/v1/signup", {
        method: "POST",
        headers: { "content-type": "application/json", host: "app.caudals.com", origin: "https://app.caudals.com" },
        body: JSON.stringify(body),
      }));
    };

    it("cannot finish without the checkbox when SIGNUP_TERMS_REQUIRED=true", async () => {
      process.env.SIGNUP_TERMS_REQUIRED = "true";
      const { token, email } = await link();
      const response = await post({ token, name: "Ana Pérez", password: "a-long-password-1" });
      expect(response.status).toBe(400);
      expect((await owner.query("SELECT count(*)::int AS n FROM public.auth_user WHERE email=$1", [email])).rows[0].n).toBe(0);
    });

    it("creates the account and stores the accepted versions in one transaction", async () => {
      process.env.SIGNUP_TERMS_REQUIRED = "true";
      const { token, email } = await link();
      const response = await post({ token, name: "Ana Pérez", password: "a-long-password-1", acceptTerms: true, locale: "es" });
      expect(response.status).toBe(200);
      const { data, meta } = await response.json();
      const rows = (await owner.query(
        `SELECT t.document, t.version, t.context, t.locale, t.org_id, t.request_id FROM evals.terms_acceptance t
         JOIN public.auth_user u ON u.id=t.user_id WHERE u.email=$1 ORDER BY t.document`, [email])).rows;
      expect(rows).toEqual([
        { document: "privacy", version: "2026-10-11", context: "signup", locale: "es", org_id: data.orgId, request_id: meta.request_id },
        { document: "terms", version: "2026-10-11", context: "signup", locale: "es", org_id: data.orgId, request_id: meta.request_id },
      ]);
    });
  });
});
