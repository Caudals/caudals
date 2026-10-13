/**
 * DPA click-through acceptance (launch L-30, spec P-42) on the real schema.
 * The acceptance is recorded through L-01's `evals.record_terms_acceptance`
 * (migration 081) with document and context `dpa`: version, date and signer,
 * plus an audit event that keeps the signer's name and email. Only owners
 * accept; every member sees the status.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { legalDocumentVersion } from "@/lib/legal/versions";
import { createPrefixedId } from "@/lib/operator/ids";

const identity = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => identity.current!,
}));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;

describe.skipIf(!ownerUrl || !runtimeUrl)("DPA acceptance (launch L-30)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  const version = legalDocumentVersion("dpa");
  const headers = { host: "localhost", origin: "http://localhost", "content-type": "application/json" };
  const call = (orgId: string, method: "GET" | "POST", body?: unknown) =>
    new Request(`http://localhost/api/evals/v1/workspaces/${orgId}/dpa`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const route = () => import("@/app/api/evals/v1/workspaces/[id]/dpa/route");

  async function person(name: string, platformRole?: "platform_admin") {
    const id = createPrefixedId("au");
    const email = `${randomUUID()}@example.test`;
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, name, email]);
    if (platformRole) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2)", [id, platformRole]);
    return { id, name, email };
  }
  async function workspace(members: Array<[{ id: string }, "owner" | "editor" | "viewer" | "operator"]>) {
    const orgId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'DPA fixture',$2)", [orgId, members[0][0].id]);
    for (const [member, role] of members) await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,$3)", [orgId, member.id, role]);
    return orgId;
  }
  function as(user: { id: string; name: string; email: string }, orgId: string, role: EvalIdentity["workspaces"][number]["role"], platformRole: EvalIdentity["platformRole"] = null) {
    identity.current = { user, platformRole, workspaces: [{ id: orgId, name: "DPA fixture", role }] };
  }
  async function json(response: Response) {
    return { status: response.status, body: await response.json() };
  }

  beforeAll(() => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    vi.stubEnv("DATABASE_URL", runtimeUrl!);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await owner.end();
    const { getEvalsPool } = await import("@/lib/evals/repositories/db");
    await getEvalsPool().end();
  });

  it("records an owner's acceptance once, with version, date and signer, and shows it to every member", async () => {
    const ana = await person("Ana Owner"), victor = await person("Víctor Viewer");
    const orgId = await workspace([[ana, "owner"], [victor, "viewer"]]);
    const { GET, POST } = await route();

    as(ana, orgId, "owner");
    const before = await json(await GET(call(orgId, "GET")));
    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject({ document: "dpa", currentVersion: version, canAccept: true, acceptance: null, you: { name: "Ana Owner", email: ana.email } });

    const requestId = `req-${randomUUID()}`;
    const accepted = await json(await POST(call(orgId, "POST", { version, locale: "es", requestId })));
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.acceptance).toMatchObject({ version, locale: "es", current: true, signer: { name: "Ana Owner", email: ana.email } });
    expect(Date.now() - Date.parse(accepted.body.data.acceptance.acceptedAt)).toBeLessThan(60_000);

    // A retry with the same request id, and a second click, record nothing new.
    expect((await json(await POST(call(orgId, "POST", { version, locale: "es", requestId })))).body.data.acceptance.id).toBe(accepted.body.data.acceptance.id);
    expect((await json(await POST(call(orgId, "POST", { version, locale: "en", requestId: `req-${randomUUID()}` })))).body.data.acceptance.id).toBe(accepted.body.data.acceptance.id);

    const rows = (await owner.query("SELECT user_id, org_id, document, version, context, locale, request_id FROM evals.terms_acceptance WHERE org_id=$1", [orgId])).rows;
    expect(rows).toEqual([{ user_id: ana.id, org_id: orgId, document: "dpa", version, context: "dpa", locale: "es", request_id: requestId }]);
    const audit = (await owner.query("SELECT actor_id, subject_id, details FROM evals.audit_event WHERE org_id=$1 AND action='legal.dpa_accepted'", [orgId])).rows;
    expect(audit).toEqual([{ actor_id: ana.id, subject_id: accepted.body.data.acceptance.id, details: { document: "dpa", version, locale: "es", request_id: requestId, signer: { name: "Ana Owner", email: ana.email } } }]);

    // A viewer sees that it is accepted, but not the signer's address, and cannot accept.
    as(victor, orgId, "viewer");
    const seen = await json(await GET(call(orgId, "GET")));
    expect(seen.body.data).toMatchObject({ canAccept: false, acceptance: { id: accepted.body.data.acceptance.id, current: true, signer: null } });
  });

  it("refuses anyone but an owner, and an outdated version", async () => {
    const olga = await person("Olga Owner"), eddie = await person("Eddie Editor"), admin = await person("Platform admin", "platform_admin");
    const stranger = await person("Stranger");
    const orgId = await workspace([[olga, "owner"], [eddie, "editor"]]);
    const { GET, POST } = await route();
    const body = () => ({ version, requestId: `req-${randomUUID()}` });

    as(eddie, orgId, "editor");
    expect(await json(await POST(call(orgId, "POST", body())))).toMatchObject({ status: 403, body: { error: { code: "OWNER_REQUIRED" } } });
    // A platform administrator reads the status but never accepts for a customer.
    as(admin, orgId, "operator", "platform_admin");
    expect((await json(await GET(call(orgId, "GET")))).body.data.canAccept).toBe(false);
    expect((await json(await POST(call(orgId, "POST", body())))).body.error.code).toBe("OWNER_REQUIRED");
    // Someone outside the workspace learns nothing.
    as(stranger, orgId, "viewer");
    expect((await GET(call(orgId, "GET"))).status).toBe(404);
    expect((await POST(call(orgId, "POST", body()))).status).toBe(404);
    // The owner can only accept the published version.
    as(olga, orgId, "owner");
    expect(await json(await POST(call(orgId, "POST", { version: "2026-01-01", requestId: `req-${randomUUID()}` })))).toMatchObject({ status: 409, body: { error: { code: "VERSION_CHANGED" } } });
    expect((await POST(call(orgId, "POST", { version, requestId: "short" }))).status).toBe(400);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.terms_acceptance WHERE org_id=$1", [orgId])).rows[0].n).toBe(0);
  });

  it("asks for the new version when only an older one was accepted", async () => {
    const otto = await person("Otto Owner");
    const orgId = await workspace([[otto, "owner"]]);
    const { withTenant } = await import("@/lib/evals/repositories/db");
    await withTenant({ orgId, actorId: otto.id }, (db) =>
      db.query("SELECT evals.record_terms_acceptance($1,'dpa','2026-01-01','dpa','en',$2)", [orgId, `req-${randomUUID()}`]));
    const { GET, POST } = await route();
    as(otto, orgId, "owner");
    const older = await json(await GET(call(orgId, "GET")));
    expect(older.body.data).toMatchObject({ canAccept: true, acceptance: { version: "2026-01-01", current: false } });
    const accepted = await json(await POST(call(orgId, "POST", { version, requestId: `req-${randomUUID()}` })));
    expect(accepted.body.data.acceptance).toMatchObject({ version, current: true, signer: { name: "Otto Owner" } });
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.terms_acceptance WHERE org_id=$1", [orgId])).rows[0].n).toBe(2);
  });
});
