/**
 * Partner accounts on the production schema (migration 103; launch L-28,
 * spec P-52, §6.5, §6.15, §7.8), on the disposable database
 * (scripts/evals/test-db.sh):
 *
 * - tenant isolation: a partner's people reach only that partner's live
 *   clients, with customer roles, never other workspaces, other partners'
 *   clients or platform-operator surfaces; RLS, every SECURITY DEFINER
 *   function and forged in-memory identities are checked;
 * - access follows the partner (people, suspension, closing, unlinking) in the
 *   same transaction, and a client's own members are never touched;
 * - referral codes attribute demo → sign-up → first payment through L-02's
 *   first touch and the real routes, with Stripe test-mode fixtures;
 * - the monthly statement equals the orders and the ledger;
 * - the allowance is granted through the ledger, capped and idempotent;
 * - the white-label logo reaches only the partner's clients' PDFs;
 * - the member cap ignores partner people; the rollback refuses.
 *
 * Stripe and email are never called. Run it on its own database (I-12).
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool, type PoolClient } from "pg";
import type Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPostgresPool } from "@/lib/db/client";
import { getEvalsPool, withTenant } from "@/lib/evals/repositories/db";
import { createPrefixedId } from "@/lib/operator/ids";
import { isPlatformStaff, requireWorkspace, type EvalIdentity } from "@/lib/evals/domain/identity";
import { EvalError } from "@/lib/evals/domain/errors";
import {
  addPartnerMember, createPartner, createPartnerClient, createReferralCode, grantPartnerAllowance, linkPartnerClient, partnerLogo,
  partnerOverview, partnerStatement, removePartnerLogo, removePartnerMember, revokeReferralCode, setPartnerAllowance, setPartnerLogo,
  unlinkPartnerClient, updatePartner,
} from "@/lib/evals/partners/repository";
import { partnerScopes } from "@/lib/evals/partners/scope";
import { pdfBrandFor, resolveJobBrand } from "@/lib/evals/partners/pdf-brand";
import { partnersMode } from "@/lib/evals/partners/flags";
import { renderStatementCsv, statementTotals } from "@/lib/evals/partners/statement";
import { requestAttribution } from "@/lib/analytics/attribution-request";
import { insertRun, getRun } from "@/lib/demo/store";
import { requestSignup } from "@/lib/evals/signup";
import { createTopUpOrder, saveProfile, type ProfileInput } from "@/lib/billing/payments";
import { settlePayment, WEBHOOK_ACTOR } from "@/lib/billing/settlement";
import { refundTopUp } from "@/lib/billing/refunds";
import { verifyAccounts } from "@/lib/billing/ledger";
import { queuePdfExport, createReportForRun } from "@/lib/evals/repositories/managed";
import { scoreRun } from "@/lib/evals/repositories/managed";
import { importedJudgeRunFixture } from "./judge-run-fixture";
import { pngBytes } from "./partner-fixtures";

const mail = vi.hoisted(() => vi.fn(async (_message: { to: string; subject: string; text: string }) => ({ data: { id: "fake" }, error: null })));
vi.mock("@/lib/resend/client", () => ({ getResendClient: () => ({ emails: { send: mail } }) }));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 0, resetAt: Date.now() + 1000 })),
}));
vi.mock("@/lib/demo/import", () => ({ importDemo: vi.fn(async () => ({ evaluationId: null })) }));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const endpoint = process.env.EVALS_TEST_S3_ENDPOINT;
const UCR = 1_000_000;
const rid = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const headers = { "content-type": "application/json", host: "localhost", origin: "http://localhost" };
const MADRID_MONTH = (() => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
})();

describe.skipIf(!ownerUrl || !runtimeUrl)("partner accounts on the production schema (L-28)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 8 });
  const rolePool = (role: string) => {
    const pool = new Pool({ connectionString: ownerUrl, max: 2 });
    pool.on("connect", (client) => { void client.query(`SET ROLE ${role}`); });
    return pool;
  };
  const documents = rolePool("evals_document");
  const worker = rolePool("evals_worker");

  beforeAll(() => {
    Object.assign(process.env, {
      EVALS_DATABASE_URL: runtimeUrl, DATABASE_URL: runtimeUrl, RESEND_FROM_EMAIL: "signup@example.test",
      SELF_SERVE_DIRECT_SIGNUP: "true", SIGNUP_TERMS_REQUIRED: "true", ANALYTICS_EVENTS_V2: "true",
    });
  });
  beforeEach(() => { vi.stubEnv("PARTNERS_ENABLED", "true"); mail.mockClear(); });
  afterAll(async () => {
    vi.unstubAllEnvs();
    for (const key of ["SELF_SERVE_DIRECT_SIGNUP", "SIGNUP_TERMS_REQUIRED", "ANALYTICS_EVENTS_V2"]) delete process.env[key];
    await Promise.all([owner.end(), runtime.end(), documents.end(), worker.end(), getEvalsPool().end(), getPostgresPool().end()]);
  });

  /* ------------------------------------------------------------ fixtures --- */

  type Person = { id: string; email: string; identity: EvalIdentity };
  async function person(options: { admin?: boolean; operator?: boolean } = {}): Promise<Person> {
    const id = createPrefixedId("au"), email = `${randomUUID()}@partner-fixture.test`;
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Partner fixture", email]);
    if (options.admin) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [id]);
    if (options.operator) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')", [id]);
    const identity: EvalIdentity = { user: { id, email, name: "Partner fixture" }, platformRole: options.admin ? "platform_admin" : options.operator ? "operator" : null, workspaces: [], sessionCreatedAt: new Date().toISOString() };
    return { id, email, identity };
  }
  /** A customer's own workspace with its owner (as an operator or sign-up would create it). */
  async function customerWorkspace(ownerId?: string) {
    const orgId = randomUUID(), creator = ownerId ?? (await person()).id;
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Customer workspace',$2)", [orgId, creator]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, creator]);
    return { orgId, ownerId: creator };
  }
  /** Runs SQL as the web runtime role, scoped like the app does. */
  const asRuntime = <T = Record<string, unknown>>(actorId: string, orgId: string, sql: string, params: unknown[] = []) =>
    withTenant({ orgId, actorId }, async (db) => (await db.query(sql, params)).rows as T[], runtime);
  const memberships = async (orgId: string) => (await owner.query("SELECT user_id, role, partner_id FROM evals.membership WHERE org_id=$1 ORDER BY role, user_id", [orgId])).rows;
  /** The workspaces a person sees, exactly as requireIdentity lists them. */
  const visible = async (actorId: string) => (await asRuntime<{ id: string; role: string }>(actorId, "",
    "SELECT w.id, COALESCE(m.role,'operator') AS role FROM evals.workspace w LEFT JOIN evals.membership m ON m.org_id=w.id AND m.user_id=$1 WHERE w.deleted_at IS NULL", [actorId]));
  const denied = async (promise: Promise<unknown>) => {
    try { await promise; } catch (error) { return error instanceof EvalError ? `${error.status} ${error.code}` : (error as Error).message; }
    return "allowed";
  };
  const audits = async (orgId: string, action: string) => (await owner.query(
    "SELECT actor_id, subject_id, details FROM evals.audit_event WHERE org_id=$1 AND action=$2 ORDER BY created_at", [orgId, action])).rows;

  let opsAdmin: Person;
  beforeAll(async () => { opsAdmin = await person({ admin: true }); });

  /** A partner with one admin and one member, created through the ops API functions. */
  async function partner(name = "Agencia Uno") {
    const { id } = await createPartner(opsAdmin.identity, { name, reason: "L-28 fixture agreement" }, randomUUID());
    const admin = await person(), member = await person();
    await addPartnerMember(opsAdmin.identity, id, { email: admin.email, role: "admin", reason: "Partner admin per agreement" });
    await addPartnerMember(opsAdmin.identity, id, { email: member.email, role: "member", reason: "Partner member per agreement" });
    return { id, admin, member };
  }
  const client = async (p: { id: string; admin: Person }, name = "Cliente Uno") => (await createPartnerClient(p.admin.identity, p.id, { name }, randomUUID())).orgId;

  /* ------------------------------------------------------- people, roles --- */

  it("ops create a partner and its people; partner admins create clients they own, members edit them; nobody becomes staff", async () => {
    const key = randomUUID();
    const first = await createPartner(opsAdmin.identity, { name: "Agencia Idempotente", reason: "L-28 fixture agreement" }, key);
    expect((await createPartner(opsAdmin.identity, { name: "Agencia Idempotente", reason: "L-28 fixture agreement" }, key)).id).toBe(first.id);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id IS NULL AND action='partner.created' AND subject_id=$1", [first.id])).rows[0].n).toBe(1);

    const p = await partner();
    expect(await denied(addPartnerMember(opsAdmin.identity, p.id, { email: "nobody@partner-fixture.test", role: "member", reason: "Unknown person" }))).toBe("422 USER_NOT_FOUND");
    const orgId = await client(p);
    const replay = await createPartnerClient(p.admin.identity, p.id, { name: "Cliente Uno" }, "same-request-key-1");
    expect((await createPartnerClient(p.admin.identity, p.id, { name: "Cliente Uno" }, "same-request-key-1")).orgId).toBe(replay.orgId);

    expect(await memberships(orgId)).toEqual(expect.arrayContaining([
      { user_id: p.admin.id, role: "owner", partner_id: p.id },
      { user_id: p.member.id, role: "editor", partner_id: p.id },
    ]));
    expect((await memberships(orgId)).some((row) => row.role === "operator")).toBe(false);
    // The partner plan: credits billing, PAYG-sized limits, no member cap.
    expect((await owner.query(`SELECT e.plan, e.max_systems, e.max_tests_per_set, e.max_runs_per_month, e.max_active_runs, e.max_members, e.can_schedule, a.billing_mode
      FROM evals.workspace_entitlement e JOIN billing.credit_account a ON a.org_id=e.org_id WHERE e.org_id=$1`, [orgId])).rows[0])
      .toEqual({ plan: "partner", max_systems: 10, max_tests_per_set: 500, max_runs_per_month: null, max_active_runs: 2, max_members: null, can_schedule: true, billing_mode: "credits" });
    expect((await audits(orgId, "membership.partner_granted")).map((row) => row.subject_id).sort()).toEqual([p.admin.id, p.member.id].sort());

    // Ordinary workspace access, with customer roles only.
    const adminWorkspaces = await visible(p.admin.id), memberWorkspaces = await visible(p.member.id);
    expect(adminWorkspaces).toEqual(expect.arrayContaining([{ id: orgId, role: "owner" }]));
    expect(memberWorkspaces).toEqual(expect.arrayContaining([{ id: orgId, role: "editor" }]));
    await expect(requireWorkspace(p.admin.identity, orgId, "manage")).resolves.toBeUndefined();
    await expect(requireWorkspace(p.member.identity, orgId, "write")).resolves.toBeUndefined();
    expect(await denied(requireWorkspace(p.member.identity, orgId, "manage"))).toBe("404 SCOPE_DENIED");
    for (const someone of [p.admin, p.member]) {
      expect(isPlatformStaff({ platformRole: null, workspaces: (await visible(someone.id)).map((w) => ({ id: w.id, name: "", role: w.role as "owner" })) })).toBe(false);
      expect((await asRuntime(someone.id, orgId, "SELECT evals.is_admin() AS admin, evals.is_readout_operator() AS operator"))[0]).toEqual({ admin: false, operator: false });
    }
    // Members read; only admins create clients and links.
    expect(await denied(createPartnerClient(p.member.identity, p.id, { name: "Not allowed" }, randomUUID()))).toBe("404 SCOPE_DENIED");
    expect(await denied(createReferralCode(p.member.identity, p.id, {}, randomUUID(), { marketing: "https://caudals.com", app: "https://app.caudals.com" }))).toBe("404 SCOPE_DENIED");
    const overview = await partnerOverview(p.member.identity, p.id, { livemode: false, marketingOrigin: "https://caudals.com", appOrigin: "https://app.caudals.com" });
    expect(overview.role).toBe("member");
    expect(overview.clients.map((row) => [row.orgId, row.myRole, row.access, row.origin])).toEqual(expect.arrayContaining([[orgId, "editor", "manage", "created"]]));
    expect(overview.revenue).toEqual({ netCents: null, shareCents: null });
    // The identity's partner scope lists only partners the flag opens.
    expect(await withTenant({ orgId: "", actorId: p.member.id }, (db) => partnerScopes(db, p.member.id), runtime)).toEqual([{ id: p.id, name: "Agencia Uno", role: "member" }]);
    expect(await withTenant({ orgId: "", actorId: p.member.id }, (db) => partnerScopes(db, p.member.id, partnersMode({ PARTNERS_ENABLED: "admins" })), runtime)).toEqual([]);
  });

  /* ------------------------------------------------------------ isolation --- */

  it("isolates partners: no other workspace, no other partner's clients, no platform surface, forged identities fail", async () => {
    const p = await partner("Agencia P"), q = await partner("Agencia Q");
    const pClient = await client(p, "Cliente de P"), qClient = await client(q, "Cliente de Q");
    const customer = await customerWorkspace();

    // Workspace access: only the partner's own clients.
    for (const someone of [p.admin, p.member]) {
      const ids = (await visible(someone.id)).map((row) => row.id);
      expect(ids).toContain(pClient);
      expect(ids).not.toContain(qClient);
      expect(ids).not.toContain(customer.orgId);
      expect(await denied(requireWorkspace(someone.identity, qClient, "read"))).toBe("404 SCOPE_DENIED");
      expect(await denied(requireWorkspace(someone.identity, customer.orgId, "read"))).toBe("404 SCOPE_DENIED");
    }
    // RLS on every partner table: P's people see only P's rows.
    const tables = ["partner", "partner_member", "partner_client", "partner_referral_code", "partner_referral", "partner_allowance", "partner_allowance_grant"];
    for (const table of tables) {
      const rows = await asRuntime<{ partner_id?: string; id?: string }>(p.admin.id, "", `SELECT * FROM evals.${table}`);
      for (const row of rows) expect(row.partner_id ?? row.id).toBe(p.id);
    }
    expect((await asRuntime(p.admin.id, "", "SELECT id FROM evals.partner")).map((row) => row.id)).toEqual([p.id]);
    // Customers of another workspace see nothing of partners.
    for (const table of tables) expect(await asRuntime(customer.ownerId, customer.orgId, `SELECT * FROM evals.${table}`)).toEqual([]);
    // The runtime cannot write the tables or memberships directly.
    expect(await denied(asRuntime(p.admin.id, "", "INSERT INTO evals.partner_member(partner_id,user_id,role,added_by) VALUES($1,$2,'admin',$2)", [q.id, p.admin.id]))).toMatch(/permission denied/);
    expect(await denied(asRuntime(p.admin.id, "", "UPDATE evals.partner_client SET partner_id=$1", [p.id]))).toMatch(/permission denied/);
    expect(await denied(asRuntime(p.admin.id, customer.orgId, "INSERT INTO evals.membership(org_id,user_id,role,partner_id) VALUES($1,$2,'owner',$3)", [customer.orgId, p.admin.id, p.id]))).toMatch(/permission denied/);

    // Every SECURITY DEFINER function refuses another partner's id.
    const qCalls: Array<[string, unknown[]]> = [
      ["SELECT * FROM evals.partner_clients($1)", [q.id]], ["SELECT * FROM evals.partner_members($1)", [q.id]],
      ["SELECT * FROM evals.partner_referrals($1,false)", [q.id]], ["SELECT * FROM evals.partner_statement($1,$2::date,false)", [q.id, `${MADRID_MONTH}-01`]],
      ["SELECT evals.partner_access($1,'member')", [q.id]], ["SELECT evals.partner_create_client($1,'Grab',$2)", [q.id, randomUUID()]],
      ["SELECT evals.partner_create_code($1,NULL)", [q.id]], ["SELECT evals.partner_set_logo($1,NULL,NULL,NULL,NULL)", [q.id]],
    ];
    for (const [sql, params] of qCalls) expect(await denied(asRuntime(p.admin.id, "", sql, params)), sql).toMatch(/SCOPE_DENIED/);
    // Ops-only functions, even on the person's own partner: no self-escalation, no grabbing a customer's workspace.
    const opsCalls: Array<[string, unknown[], string]> = [
      ["SELECT evals.partner_create('Mine',NULL,NULL,NULL,'Self-service attempt')", [], ""],
      ["SELECT evals.partner_add_member($1,$2,'admin','Self-escalation attempt')", [p.id, p.member.email], ""],
      ["SELECT evals.partner_link_client($1,$2,'manage','Grab attempt')", [p.id, customer.orgId], ""],
      ["SELECT evals.partner_unlink_client($1,$2,'Unlink attempt')", [p.id, pClient], ""],
      ["SELECT * FROM evals.partner_update($1,'active',10000,NULL,NULL,'Raise my share')", [p.id], ""],
      ["SELECT * FROM evals.partner_set_allowance($1,1000000,current_date,NULL,'Grant myself')", [p.id], ""],
      ["SELECT * FROM evals.partner_grant_allowance($1,$2,1000,'self-grant-1','Grant myself')", [p.id, pClient], pClient],
    ];
    for (const [sql, params, orgId] of opsCalls) expect(await denied(asRuntime(p.admin.id, orgId, sql, params)), sql).toMatch(/SCOPE_DENIED/);
    // The PDF brand of a workspace the person does not belong to.
    expect(await denied(asRuntime(p.admin.id, customer.orgId, "SELECT * FROM evals.partner_pdf_brand($1)", [customer.orgId]))).toMatch(/SCOPE_DENIED/);
    expect(await denied(asRuntime(p.admin.id, pClient, "SELECT * FROM evals.partner_pdf_brand($1)", [customer.orgId]))).toMatch(/SCOPE_DENIED/);
    // Platform-operator surfaces stay closed to partner people.
    expect(await denied(asRuntime(p.admin.id, "", "SELECT * FROM evals.ops_workspace_details()"))).toMatch(/SCOPE_DENIED/);
    expect(await asRuntime(p.admin.id, pClient, "SELECT * FROM evals.list_workspace_members($1)", [pClient])).toEqual([]);

    // The repository answers 404 for another partner, also to forged identities.
    const origins = { livemode: false, marketingOrigin: "https://caudals.com", appOrigin: "https://app.caudals.com" };
    expect(await denied(partnerOverview(p.admin.identity, q.id, origins))).toBe("404 SCOPE_DENIED");
    expect(await denied(partnerStatement(p.member.identity, q.id, MADRID_MONTH, false))).toBe("404 SCOPE_DENIED");
    expect(await denied(partnerLogo(p.admin.identity, q.id))).toBe("404 SCOPE_DENIED");
    const forgedPartner: EvalIdentity = { ...p.member.identity, partners: [{ id: q.id, name: "Agencia Q", role: "admin" }] };
    expect(await denied(partnerOverview(forgedPartner, q.id, origins))).toBe("404 SCOPE_DENIED");
    expect(await denied(createPartnerClient(forgedPartner, q.id, { name: "Forged" }, randomUUID()))).toBe("404 SCOPE_DENIED");
    const forgedAdmin: EvalIdentity = { ...p.admin.identity, platformRole: "platform_admin", workspaces: [{ id: qClient, name: "Cliente de Q", role: "owner" }] };
    expect(await denied(partnerOverview(forgedAdmin, q.id, origins))).toBe("404 SCOPE_DENIED");
    expect(await denied(createPartner(forgedAdmin, { name: "Forged", reason: "Forged platform admin" }, randomUUID()))).toBe("404 SCOPE_DENIED");
    expect(await denied(linkPartnerClient(forgedAdmin, p.id, { orgId: customer.orgId, access: "manage", reason: "Forged link" }))).toBe("404 SCOPE_DENIED");
    expect(await denied(requireWorkspace(forgedAdmin, qClient, "read"))).toBe("404 SCOPE_DENIED");
    // A real partner admin without a recent sign-in, or without the platform role, never reaches the ops functions.
    expect(await denied(addPartnerMember(p.admin.identity, p.id, { email: p.member.email, role: "admin", reason: "Escalate" }))).toBe("403 SCOPE_DENIED");
    expect(await denied(addPartnerMember({ ...opsAdmin.identity, sessionCreatedAt: new Date(Date.now() - 3_600_000).toISOString() }, p.id, { email: p.member.email, role: "admin", reason: "Old sign-in" }))).toBe("403 REAUTHENTICATION_REQUIRED");
    // Platform operators (not admins) cannot manage partners either.
    const operator = await person({ operator: true });
    expect(await denied(asRuntime(operator.id, "", "SELECT evals.partner_create('Ops',NULL,NULL,NULL,'Operator attempt')"))).toMatch(/SCOPE_DENIED/);
    expect(await denied(asRuntime(operator.id, "", "SELECT * FROM evals.partner_clients($1)", [p.id]))).toMatch(/SCOPE_DENIED/);
    // Worker roles have no access at all.
    expect(await denied(withTenant({ orgId: pClient, actorId: "service:evals-worker" }, (db) => db.query("SELECT * FROM evals.partner"), worker))).toMatch(/permission denied/);
    expect(await denied(withTenant({ orgId: pClient, actorId: "service:evals-documents" }, (db) => db.query("SELECT * FROM evals.partner_pdf_brand($1)", [pClient]), documents))).toMatch(/permission denied/);
    // A platform admin's read of a partner is audited as support.
    await partnerOverview(opsAdmin.identity, p.id, origins);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id IS NULL AND action='support.partner_read' AND subject_id=$1 AND actor_id=$2", [p.id, opsAdmin.id])).rows[0].n).toBeGreaterThan(0);
    // With the flag off (or the partner not listed) the surfaces answer 404 before the database.
    vi.stubEnv("PARTNERS_ENABLED", "false");
    expect(await denied(partnerOverview(p.admin.identity, p.id, origins))).toBe("404 NOT_FOUND");
    vi.stubEnv("PARTNERS_ENABLED", q.id);
    expect(await denied(partnerOverview(p.admin.identity, p.id, origins))).toBe("404 NOT_FOUND");
    expect((await partnerOverview(q.admin.identity, q.id, origins)).partner.id).toBe(q.id);
  });

  /* ------------------------------------------------- access follows partner --- */

  it("revokes access in the same transaction when a person leaves, the partner is suspended or closed, or a client is unlinked", async () => {
    const p = await partner("Agencia Cambios");
    const created = await client(p, "Cliente creado");
    const customer = await customerWorkspace();
    // A partner person who already belongs to the customer's workspace keeps that own membership.
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'viewer')", [customer.orgId, p.member.id]);
    await linkPartnerClient(opsAdmin.identity, p.id, { orgId: customer.orgId, access: "work", reason: "Client agreed in writing on 2026-10-13" });
    expect(await memberships(customer.orgId)).toEqual(expect.arrayContaining([
      { user_id: customer.ownerId, role: "owner", partner_id: null },
      { user_id: p.admin.id, role: "editor", partner_id: p.id },
      { user_id: p.member.id, role: "viewer", partner_id: null },
    ]));
    expect((await owner.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [customer.orgId])).rows[0].plan).toBe("managed");
    // The client's own members see who manages their workspace.
    expect((await asRuntime(customer.ownerId, customer.orgId, "SELECT partner_id, access FROM evals.partner_client WHERE org_id=$1 AND unlinked_at IS NULL", [customer.orgId]))).toEqual([{ partner_id: p.id, access: "work" }]);
    expect(await denied(linkPartnerClient(opsAdmin.identity, p.id, { orgId: customer.orgId, access: "work", reason: "Second link" }))).toBe("409 PARTNER_CLIENT_LINKED");

    // A person removed from the partner loses every client at once.
    const extra = await person();
    await addPartnerMember(opsAdmin.identity, p.id, { email: extra.email, role: "member", reason: "Temporary colleague" });
    expect((await visible(extra.id)).map((row) => row.id)).toEqual(expect.arrayContaining([created, customer.orgId]));
    await removePartnerMember(opsAdmin.identity, p.id, { userId: extra.id, reason: "Left the agency" });
    expect((await visible(extra.id)).map((row) => row.id)).not.toContain(created);
    expect(await denied(requireWorkspace(extra.identity, created, "read"))).toBe("404 SCOPE_DENIED");
    expect((await audits(created, "membership.partner_revoked")).map((row) => row.subject_id)).toContain(extra.id);

    // The last admin cannot leave while a managed client has no owner of its own.
    expect(await denied(removePartnerMember(opsAdmin.identity, p.id, { userId: p.admin.id, reason: "Leaving" }))).toBe("409 PARTNER_LAST_ADMIN");
    expect(await denied(addPartnerMember(opsAdmin.identity, p.id, { email: p.admin.email, role: "member", reason: "Demote" }))).toBe("409 PARTNER_LAST_ADMIN");

    // Suspension removes partner access everywhere and restores it on reactivation; own memberships stay.
    await updatePartner(opsAdmin.identity, p.id, { status: "suspended", reason: "Agreement paused" });
    expect((await memberships(created)).filter((row) => row.partner_id)).toEqual([]);
    expect(await memberships(customer.orgId)).toEqual(expect.arrayContaining([{ user_id: p.member.id, role: "viewer", partner_id: null }]));
    expect(await denied(partnerOverview(p.admin.identity, p.id, { livemode: false, marketingOrigin: "https://caudals.com", appOrigin: "https://app.caudals.com" }))).toBe("404 SCOPE_DENIED");
    expect(await denied(createPartnerClient(p.admin.identity, p.id, { name: "While suspended" }, randomUUID()))).toBe("404 SCOPE_DENIED");
    await updatePartner(opsAdmin.identity, p.id, { status: "active", reason: "Agreement resumed" });
    expect(await memberships(created)).toEqual(expect.arrayContaining([{ user_id: p.admin.id, role: "owner", partner_id: p.id }]));

    // Unlinking a client the partner created would orphan it; once it has an owner of its own it can go.
    expect(await denied(unlinkPartnerClient(opsAdmin.identity, p.id, { orgId: created, reason: "Client leaves" }))).toBe("409 PARTNER_CLIENT_ORPHAN");
    expect(await denied(updatePartner(opsAdmin.identity, p.id, { status: "closed", reason: "End of agreement" }))).toBe("409 PARTNER_CLIENTS_ACTIVE");
    const clientOwner = await person();
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [created, clientOwner.id]);
    await unlinkPartnerClient(opsAdmin.identity, p.id, { orgId: created, reason: "Client leaves, owner in place" });
    expect(await memberships(created)).toEqual([{ user_id: clientOwner.id, role: "owner", partner_id: null }]);

    // Closing ends everything: links, codes, people and their access; the customer's own rows stay.
    const code = await createReferralCode(p.admin.identity, p.id, { label: "Feria" }, randomUUID(), { marketing: "https://caudals.com", app: "https://app.caudals.com" });
    const closed = await updatePartner(opsAdmin.identity, p.id, { status: "closed", reason: "End of agreement" });
    expect(closed.status).toBe("closed");
    expect(await memberships(customer.orgId)).toEqual(expect.arrayContaining([{ user_id: customer.ownerId, role: "owner", partner_id: null }, { user_id: p.member.id, role: "viewer", partner_id: null }]));
    expect((await memberships(customer.orgId)).some((row) => row.partner_id)).toBe(false);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.partner_member WHERE partner_id=$1", [p.id])).rows[0].n).toBe(0);
    expect((await owner.query("SELECT revoked_at IS NOT NULL AS revoked FROM evals.partner_referral_code WHERE id=$1", [code.id])).rows[0].revoked).toBe(true);
    expect(await denied(updatePartner(opsAdmin.identity, p.id, { status: "active", reason: "Reopen" }))).toBe("409 PARTNER_CLOSED");
  });

  it("does not count partner people against a client's member cap", async () => {
    const p = await partner("Agencia Cupo");
    const customer = await customerWorkspace();
    await owner.query("UPDATE evals.workspace_entitlement SET plan='payg', max_members=2 WHERE org_id=$1", [customer.orgId]);
    await linkPartnerClient(opsAdmin.identity, p.id, { orgId: customer.orgId, access: "work", reason: "Client agreed in writing" });
    // Owner (1) + one invitation (2) fits; partner people are not counted.
    await withTenant({ orgId: customer.orgId, actorId: customer.ownerId }, (db) => db.query(
      "INSERT INTO evals.invitation(org_id,email,role,token_hash,expires_at,created_by) VALUES($1,$2,'editor',$3,now()+interval '1 day',$4)",
      [customer.orgId, `${randomUUID()}@example.test`, sha256(randomUUID()), customer.ownerId]), runtime);
    expect((await asRuntime(customer.ownerId, customer.orgId, "SELECT * FROM evals.plan_usage($1)", [customer.orgId]))[0]).toMatchObject({ members: 1, pending_invitations: 1 });
    await unlinkPartnerClient(opsAdmin.identity, p.id, { orgId: customer.orgId, reason: "Fixture done" });
  });

  /* ---------------------------------------------------------- attribution --- */

  const profile = (): ProfileInput => ({
    legalName: "Cliente Referido SL", country: "ES", taxId: `B${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}0`, taxIdKind: "es_nif",
    viesStatus: "not_required", viesConsultation: null, taxTreatment: "es_vat", taxReviewReason: null, addressLine1: "Calle Mayor 1",
    addressLine2: null, postalCode: "47001", city: "Valladolid", region: null, billingEmail: "billing@referido.test",
  });
  /** A Stripe test-mode payment of one pack, through the settlement path the webhook uses. */
  async function pay(orgId: string, ownerId: string, netCents = 2000, livemode = false) {
    const scope = { orgId, actorId: ownerId };
    await withTenant(scope, (db) => saveProfile(db, orgId, profile()), runtime).catch(() => undefined);
    const order = await withTenant(scope, (db) => createTopUpOrder(db, { orgId, key: `checkout:${randomUUID()}`, netCents, livemode, buyerDomain: null }), runtime);
    await settlePayment({ orgId, orderId: order.id, livemode, amountCents: order.grossCents, currency: "eur", paymentIntentId: rid("pi") }, WEBHOOK_ACTOR, runtime);
    return order.id;
  }
  const stripe = { refunds: { create: async () => ({ id: rid("re"), status: "succeeded" }) } } as unknown as Stripe;
  const signupRoute = async (body: Record<string, unknown>) => (await import("@/app/api/evals/v1/signup/route")).POST(new Request("http://localhost/api/evals/v1/signup", { method: "POST", headers, body: JSON.stringify(body) }));
  const requestRoute = async (body: Record<string, unknown>, cookie: string) => (await import("@/app/api/evals/v1/signup/request/route")).POST(new Request("http://localhost/api/evals/v1/signup/request", { method: "POST", headers: { ...headers, cookie }, body: JSON.stringify(body) }));
  const lastToken = () => /\/workspace\/signup#([A-Za-z0-9_-]{43})/.exec(mail.mock.calls.at(-1)?.[0].text ?? "")?.[1] ?? /signup#([A-Za-z0-9_-]{43})/.exec(mail.mock.calls.at(-1)?.[0].text ?? "")?.[1];
  const firstTouch = (touch: Record<string, string>) => `caudals_attribution_v2=${encodeURIComponent(JSON.stringify(touch))}`;

  /** The demo path: the first touch a demo saves → demo sign-up link → enrollment through the real route. */
  async function demoSignup(touch: Record<string, string>) {
    const attribution = requestAttribution(new Request("https://caudals.com/api/demo/runs", { headers: { cookie: firstTouch(touch) } }));
    const runId = await insertRun({ tokenHash: sha256(randomUUID()), locale: "es", spec: { kind: "openai_compatible", url: "https://example.test/v1/chat/completions", model: "fixture" },
      targetHost: "example.test", docsUrl: "https://example.test/docs", docsHost: "example.test", clientHash: sha256(randomUUID()), auth: false, attribution });
    await owner.query("UPDATE demo.run SET phase='done',finished_at=now(),summary=$2::jsonb WHERE id=$1", [runId, JSON.stringify({ scored: 8, correct: 5 })]);
    expect((await getRun(runId))?.attribution).toEqual(attribution);
    const email = `ana-${randomUUID().slice(0, 8)}@referido-demo.test`;
    await requestSignup({ email, runId, host: "example.test", locale: "es" });
    const response = await signupRoute({ token: lastToken(), name: "Ana Referida", password: "a-long-password-1", acceptTerms: true, locale: "es" });
    expect(response.status).toBe(200);
    const orgId = (await response.json()).data.orgId as string;
    const ownerId = (await owner.query("SELECT created_by FROM evals.workspace WHERE id=$1", [orgId])).rows[0].created_by as string;
    return { orgId, ownerId };
  }
  /** The direct path: /workspace/start with the first-touch cookie → emailed link → enrollment. */
  async function directSignup(touch: Record<string, string>) {
    const domain = `referido-${randomUUID().slice(0, 8)}.es`;
    expect((await requestRoute({ email: `luis@${domain}`, company: "Referido Directo", locale: "en" }, firstTouch(touch))).status).toBe(200);
    const response = await signupRoute({ token: lastToken(), name: "Luis Referido", password: "a-long-password-1", acceptTerms: true, locale: "en" });
    expect(response.status).toBe(200);
    const orgId = (await response.json()).data.orgId as string;
    return { orgId, ownerId: (await owner.query("SELECT created_by FROM evals.workspace WHERE id=$1", [orgId])).rows[0].created_by as string };
  }
  const referral = async (orgId: string) => (await owner.query("SELECT partner_id, code_id, matched_key, attributed_via, first_order_id, first_paid_net_cents, first_paid_livemode FROM evals.partner_referral WHERE org_id=$1", [orgId])).rows[0] ?? null;

  it("attributes referral codes demo → sign-up → first top-up, and keeps them unique and revocable", async () => {
    const p = await partner("Agencia Referidos");
    const origins = { marketing: "https://caudals.com", app: "https://app.caudals.com" };
    const code = await createReferralCode(p.admin.identity, p.id, { label: "LinkedIn" }, randomUUID(), origins);
    expect(code.code).toMatch(/^cp-[0-9a-f]{10}$/);
    expect(code.links.demo.es).toBe(`https://caudals.com/es/demo?utm_source=partner&utm_medium=referral&partner=${code.code}`);
    const other = await createReferralCode(p.admin.identity, p.id, {}, randomUUID(), origins);
    expect(other.code).not.toBe(code.code);
    expect(await denied(owner.query("INSERT INTO evals.partner_referral_code(partner_id,code,created_by) VALUES($1,$2,'fixture')", [p.id, code.code]))).toMatch(/duplicate key/);

    // Demo → sign-up: the code travels in the first touch (utm and partner labels, as the link sets them).
    const demo = await demoSignup({ utm_source: "partner", utm_medium: "referral", partner: code.code });
    expect((await owner.query("SELECT acquisition_attribution FROM evals.workspace WHERE id=$1", [demo.orgId])).rows[0].acquisition_attribution).toMatchObject({ partner: code.code });
    expect(await referral(demo.orgId)).toMatchObject({ partner_id: p.id, code_id: code.id, matched_key: "partner", attributed_via: "signup", first_order_id: null });
    expect((await audits(demo.orgId, "partner.referral_attributed"))).toHaveLength(1);

    // → first top-up (Stripe test mode, through settlement): the referral records the first paid order; a second does not replace it.
    const first = await pay(demo.orgId, demo.ownerId, 2000);
    expect(await referral(demo.orgId)).toMatchObject({ first_order_id: first, first_paid_net_cents: "2000", first_paid_livemode: false });
    expect((await owner.query("SELECT first_paid, attribution FROM billing.top_up_order WHERE id=$1", [first])).rows[0]).toMatchObject({ first_paid: true, attribution: { partner: code.code } });
    await pay(demo.orgId, demo.ownerId, 5000);
    expect((await referral(demo.orgId)).first_order_id).toBe(first);
    expect((await owner.query("SELECT event_name, attribution FROM public.product_analytics_event WHERE org_id=$1 AND event_name='top_up_paid' ORDER BY occurred_at LIMIT 1", [demo.orgId])).rows[0].attribution).toMatchObject({ partner: code.code });

    // Direct sign-up with `ref=` works too.
    const direct = await directSignup({ ref: other.code });
    expect(await referral(direct.orgId)).toMatchObject({ partner_id: p.id, code_id: other.id, matched_key: "ref", attributed_via: "signup" });

    // Revoked, unknown and look-alike codes never attribute; nor do share referrals (L-17).
    await revokeReferralCode(p.admin.identity, p.id, { codeId: other.id, reason: "Campaign ended" });
    expect((await directSignup({ partner: other.code })).orgId).toBeTruthy();
    expect(await referral((await directSignup({ partner: other.code })).orgId)).toBeNull();
    const lookAlikes: Array<Record<string, string>> = [{ partner: "cp-0000000000" }, { ref: "sr-0123456789ab" }, { partner: code.code.toUpperCase().replace("CP-", "xx-") }];
    for (const touch of lookAlikes) {
      const signed = await directSignup(touch);
      expect(await referral(signed.orgId)).toBeNull();
    }
    // The earlier attribution survives the revocation and the overview shows the revenue (test mode).
    const overview = await partnerOverview(p.admin.identity, p.id, { livemode: false, marketingOrigin: "https://caudals.com", appOrigin: "https://app.caudals.com" });
    const row = overview.referrals.find((item) => item.orgId === demo.orgId)!;
    expect(row).toMatchObject({ paidOrders: 2, revenueNetCents: 7000, revenueShareCents: 1400 });
    expect(overview.referrals.find((item) => item.orgId === direct.orgId)).toMatchObject({ revenueNetCents: null, revenueShareCents: null, firstPaidAt: null });
    // Live mode has no payments: revenue stays empty, never zero.
    expect((await partnerOverview(p.admin.identity, p.id, { livemode: true, marketingOrigin: "https://caudals.com", appOrigin: "https://app.caudals.com" })).revenue).toEqual({ netCents: null, shareCents: null });

    // A suspended partner's code does not attribute new sign-ups.
    const s = await partner("Agencia Suspendida");
    const sCode = await createReferralCode(s.admin.identity, s.id, {}, randomUUID(), origins);
    await updatePartner(opsAdmin.identity, s.id, { status: "suspended", reason: "Agreement paused" });
    expect(await referral((await directSignup({ partner: sCode.code })).orgId)).toBeNull();
  });

  it("attributes at the first payment when the code was issued after sign-up, once, without failing the payment", async () => {
    const p = await partner("Agencia Tardía");
    // The workspace signed up with a code that did not exist yet (e.g. shared before ops issued it).
    const late = `cp-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const signed = await directSignup({ partner: late });
    expect(await referral(signed.orgId)).toBeNull();
    const codeId = randomUUID();
    await owner.query("INSERT INTO evals.partner_referral_code(id,partner_id,code,created_by) VALUES($1,$2,$3,'fixture')", [codeId, p.id, late]);
    const orderId = await pay(signed.orgId, signed.ownerId, 2000);
    expect(await referral(signed.orgId)).toMatchObject({ partner_id: p.id, code_id: codeId, attributed_via: "payment", first_order_id: orderId });
    // A payment of an unreferred workspace is untouched.
    const plain = await directSignup({ utm_source: "linkedin" });
    expect(await pay(plain.orgId, plain.ownerId, 2000)).toBeTruthy();
    expect(await referral(plain.orgId)).toBeNull();
  });

  /* ------------------------------------------------------------ statement --- */

  it("builds the monthly statement from the orders and the ledger", async () => {
    const p = await partner("Agencia Extracto");
    const origins = { marketing: "https://caudals.com", app: "https://app.caudals.com" };
    const code = await createReferralCode(p.admin.identity, p.id, {}, randomUUID(), origins);
    const a = await directSignup({ partner: code.code }), b = await directSignup({ ref: code.code }), old = await directSignup({ partner: code.code });

    const a1 = await pay(a.orgId, a.ownerId, 2000), a2 = await pay(a.orgId, a.ownerId, 5000);
    await refundTopUp({ orgId: a.orgId, orderId: a2, reason: "Refund within 14 days", actorId: opsAdmin.id }, stripe, runtime);
    const b1 = await pay(b.orgId, b.ownerId, 10000);
    await withTenant({ orgId: b.orgId, actorId: WEBHOOK_ACTOR }, async (db) => {
      await db.query("SELECT billing.record_dispute($1,$2,'dp_fixture1','needs_response')", [b.orgId, b1]);
      await db.query("SELECT billing.record_dispute($1,$2,'dp_fixture1','lost')", [b.orgId, b1]);
    }, runtime);
    // Outside the first year: the workspace first paid fourteen months ago.
    const o1 = await pay(old.orgId, old.ownerId, 2000);
    await owner.query("UPDATE billing.top_up_order SET paid_at = now() - interval '14 months' WHERE id=$1", [o1]);
    const o2 = await pay(old.orgId, old.ownerId, 5000);
    // Live mode is a different statement.
    await pay(a.orgId, a.ownerId, 2000, true);

    // Client usage: a partner client, and a linked workspace whose earlier use is not the partner's.
    const created = await client(p, "Cliente Uso");
    const linked = await customerWorkspace();
    const grantFixture = (orgId: string, credits: number) => withTenant({ orgId, actorId: "system:fixture" }, (db) => db.query(
      "SELECT billing.grant($1,$2,$3,'grant',NULL,'Fixture credits')", [orgId, `fixture-${randomUUID()}`, credits * UCR]), runtime);
    const charge = (orgId: string, credits: number, runId: string | null = null) => withTenant({ orgId, actorId: "service:evals-worker" }, (db) => db.query(
      "SELECT billing.charge_action($1,$2,'judge',$3,1,$4)", [orgId, `fixture-${randomUUID()}`, credits * UCR, runId]), runtime);
    await grantFixture(created, 1000); await grantFixture(linked.orgId, 1000);
    const run = randomUUID();
    await charge(created, 300, run); await charge(created, 50);
    await withTenant({ orgId: created, actorId: "system:fixture" }, (db) => db.query("SELECT * FROM billing.refund_run($1,$2,'Engine failure refund')", [created, run]), runtime);
    await charge(linked.orgId, 70);
    await linkPartnerClient(opsAdmin.identity, p.id, { orgId: linked.orgId, access: "work", reason: "Client agreed in writing" });
    await charge(linked.orgId, 20);
    // An allowance grant in the month.
    await setPartnerAllowance(opsAdmin.identity, p.id, { monthlyCredits: 5000, validFrom: "2026-01-01", reason: "Agreement: 5,000 credits a month" });
    const grant = await grantPartnerAllowance(opsAdmin.identity, p.id, { orgId: created, credits: 1500, reason: "October allowance" }, `grant-${randomUUID()}`);

    const statement = await partnerStatement(p.member.identity, p.id, MADRID_MONTH, false);
    const section = (name: string) => statement.rows.filter((row) => row.section === name);
    expect(section("referral_payment").map((row) => [row.reference, row.netCents, row.shareCents]).sort()).toEqual(
      [[a1, 2000, 400], [a2, 5000, 1000], [b1, 10000, 2000]].sort());
    expect(section("referral_reversal").map((row) => [row.reference, row.detail, row.netCents, row.shareCents]).sort()).toEqual(
      [[a2, "refunded", -5000, -1000], [b1, "charged_back", -10000, -2000]].sort());
    expect(statement.rows.some((row) => row.reference === o2 || row.reference === o1)).toBe(false);
    expect(section("allowance_grant")).toEqual([expect.objectContaining({ orgId: created, reference: grant.ledgerEntryId, creditsUcr: 1500 * UCR })]);
    expect(section("client_usage").map((row) => [row.orgId, row.creditsUcr, row.returnedUcr]).sort()).toEqual(
      [[created, 50 * UCR, 300 * UCR], [linked.orgId, 20 * UCR, 0]].sort());

    // The same figures straight from the orders and the ledger.
    const referred = [a.orgId, b.orgId, old.orgId];
    const sql = async (text: string, params: unknown[]) => Number((await owner.query(text, params)).rows[0].v);
    const window = `date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'`;
    const paidNet = await sql(`SELECT coalesce(sum(o.net_cents),0) AS v FROM billing.top_up_order o WHERE o.org_id = ANY($1) AND NOT o.livemode
      AND o.paid_at >= ${window} AND o.paid_at < (SELECT min(x.paid_at) FROM billing.top_up_order x WHERE x.org_id=o.org_id AND NOT x.livemode AND x.paid_at IS NOT NULL) + interval '1 year'`, [referred]);
    const reversedNet = await sql(`SELECT coalesce(sum(o.net_cents),0) AS v FROM billing.top_up_order o WHERE o.org_id = ANY($1) AND NOT o.livemode AND o.status IN ('refunded','charged_back')`, [referred]);
    const totals = statementTotals(statement.rows);
    expect(totals.referredNetCents).toBe(paidNet - reversedNet);
    expect(totals.revenueShareCents).toBe(Math.round((paidNet - reversedNet) * 0.2));
    expect(totals.allowanceCredits * UCR).toBe(await sql("SELECT sum(amount_ucr) AS v FROM billing.ledger_entry WHERE idempotency_key LIKE $1", [`grant:partner:${p.id}:%`]));
    const used = await sql(`SELECT -sum(l.amount_ucr) AS v FROM billing.ledger_entry l JOIN evals.partner_client c ON c.org_id=l.org_id AND c.partner_id=$1
      WHERE l.entry_type IN ('capture','action') AND l.created_at >= c.linked_at`, [p.id]);
    const returned = await sql(`SELECT coalesce(sum(l.amount_ucr),0) AS v FROM billing.ledger_entry l JOIN evals.partner_client c ON c.org_id=l.org_id AND c.partner_id=$1
      JOIN billing.ledger_entry t ON t.org_id=l.org_id AND t.id=l.reverses_entry_id AND t.entry_type IN ('capture','action') WHERE l.entry_type IN ('refund','reversal')`, [p.id]);
    expect(totals.usedCredits * UCR).toBe(used - returned);
    expect(totals.returnedCredits * UCR).toBe(returned);
    // And the CSV carries those totals.
    const csv = renderStatementCsv({ partner: statement.partner, month: MADRID_MONTH, mode: "test", revenueShareBps: statement.revenueShareBps, generatedAt: new Date().toISOString() }, statement.rows);
    expect(csv).toContain(`total_referred_revenue,,,,${MADRID_MONTH},,${((paidNet - reversedNet) / 100).toFixed(2)},${(Math.round((paidNet - reversedNet) * 0.2) / 100).toFixed(2)},,`);
    // Live mode: only the live order; another month: nothing from the referrals.
    expect((await partnerStatement(p.admin.identity, p.id, MADRID_MONTH, true)).rows.filter((row) => row.section.startsWith("referral_")).map((row) => row.netCents)).toEqual([2000]);
    expect((await partnerStatement(p.admin.identity, p.id, "2025-01", false)).rows).toEqual([]);
    // Every account still balances.
    for (const orgId of [...referred, created, linked.orgId]) {
      expect((await withTenant({ orgId, actorId: WEBHOOK_ACTOR }, (db) => verifyAccounts(db, orgId), runtime))[0].issues).toEqual([]);
    }
  });

  /* ------------------------------------------------------------ allowance --- */

  it("grants the allowance through the ledger, capped by the month, idempotent, to live clients only", async () => {
    const p = await partner("Agencia Asignación");
    const created = await client(p, "Cliente Asignación");
    const stranger = await customerWorkspace();
    const grant = (orgId: string, credits: number, key = `grant-${randomUUID()}`) => grantPartnerAllowance(opsAdmin.identity, p.id, { orgId, credits, reason: "Monthly partner allowance" }, key);
    expect(await denied(grant(created, 100))).toBe("409 PARTNER_ALLOWANCE_INACTIVE");
    await setPartnerAllowance(opsAdmin.identity, p.id, { monthlyCredits: 1000, validFrom: "2099-01-01", reason: "Starts later" });
    expect(await denied(grant(created, 100))).toBe("409 PARTNER_ALLOWANCE_INACTIVE");
    await setPartnerAllowance(opsAdmin.identity, p.id, { monthlyCredits: 1000, validFrom: "2026-01-01", reason: "Agreement: 1,000 credits a month" });
    const key = `grant-${randomUUID()}`;
    const first = await grant(created, 600, key);
    expect((await grant(created, 600, key)).id).toBe(first.id);
    expect(await denied(grant(created, 700, key))).toBe("409 IDEMPOTENCY_CONFLICT");
    expect(await denied(grant(created, 500))).toBe("409 PARTNER_ALLOWANCE_EXCEEDED");
    expect(await denied(grant(stranger.orgId, 100))).toBe("404 SCOPE_DENIED");
    await grant(created, 400);
    expect(await denied(grant(created, 1))).toBe("409 PARTNER_ALLOWANCE_EXCEEDED");
    const entry = (await owner.query("SELECT entry_type, amount_ucr::text, ref_kind, ref_id, l.reason, lot.source, lot.campaign, lot.expires_at > now() AS live FROM billing.ledger_entry l JOIN billing.credit_lot lot ON lot.org_id=l.org_id AND lot.id=(l.lot_allocations->0->>'lot')::uuid WHERE l.org_id=$1 AND l.id=$2", [created, first.ledgerEntryId])).rows[0];
    expect(entry).toEqual({ entry_type: "allowance", amount_ucr: String(600 * UCR), ref_kind: "partner", ref_id: p.id, reason: "Monthly partner allowance", source: "contract_allowance", campaign: "partner_allowance", live: true });
    expect((await owner.query("SELECT available_ucr::text FROM billing.credit_account WHERE org_id=$1", [created])).rows[0].available_ucr).toBe(String(1000 * UCR));
    expect((await audits(created, "partner.allowance_granted"))).toHaveLength(2);
    const overview = await partnerOverview(p.member.identity, p.id, { livemode: false, marketingOrigin: "https://caudals.com", appOrigin: "https://app.caudals.com" });
    expect(overview.allowance).toMatchObject({ monthlyCredits: 1000, grantedCredits: 1000, remainingCredits: 0 });
    expect(overview.clients.find((row) => row.orgId === created)?.availableCredits).toBe(1000);
    // Partner people cannot grant themselves credits.
    expect(await denied(grantPartnerAllowance(p.admin.identity, p.id, { orgId: created, credits: 1, reason: "Self grant" }, `grant-${randomUUID()}`))).toBe("403 SCOPE_DENIED");
  });

  /* ----------------------------------------------------------------- logo --- */

  (endpoint ? it : it.skip)("puts the logo only on the partner's clients' PDFs; forged or stale brands render none", async () => {
    for (const [name, value] of Object.entries({ DO_SPACES_ENDPOINT: endpoint!, DO_SPACES_REGION: "us-east-1", DO_SPACES_BUCKET: "evals-partners-test", DO_SPACES_ACCESS_KEY_ID: "evals_test", DO_SPACES_SECRET_ACCESS_KEY: "evals_test_password", DO_SPACES_FORCE_PATH_STYLE: "true" })) vi.stubEnv(name, value);
    const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: "evals_test_password" } });
    try { await s3.send(new CreateBucketCommand({ Bucket: "evals-partners-test" })); } catch (error) { if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((error as Error).name)) throw error; }

    const p = await partner("Agencia Marca"), q = await partner("Agencia Otra");
    expect(await denied(setPartnerLogo(p.admin.identity, p.id, { imageBase64: Buffer.from("<svg/>").toString("base64") }))).toBe("422 LOGO_TYPE");
    expect(await denied(setPartnerLogo(p.member.identity, p.id, { imageBase64: pngBytes().toString("base64") }))).toBe("404 SCOPE_DENIED");
    const png = pngBytes(120, 40);
    const saved = await setPartnerLogo(p.admin.identity, p.id, { imageBase64: png.toString("base64") });
    expect(saved).toMatchObject({ sha256: sha256(png), mediaType: "image/png", width: 120, height: 40 });
    expect((await partnerLogo(p.member.identity, p.id)).bytes.equals(png)).toBe(true);
    const key = (await owner.query("SELECT logo_object_key FROM evals.partner WHERE id=$1", [p.id])).rows[0].logo_object_key as string;
    expect(key).toMatch(new RegExp(`^evals/partners/${p.id}/logo/`));

    // A report in a workspace the partner works in.
    const { scope, orgId, run } = await importedJudgeRunFixture(owner, runtimeUrl!);
    await scoreRun(scope, run.id, "customer-manual-deterministic-v1");
    const report = await createReportForRun(scope, { runId: run.id, title: "Marca", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    // Not a client yet: no brand.
    const unbranded = await queuePdfExport(scope, report.revisionId, "en");
    expect((await owner.query("SELECT brand FROM evals.export_job WHERE id=$1", [unbranded.id])).rows[0].brand).toBeNull();
    await owner.query("UPDATE evals.export_job SET status='failed' WHERE id=$1", [unbranded.id]);
    await linkPartnerClient(opsAdmin.identity, p.id, { orgId, access: "work", reason: "Client agreed in writing" });
    const brand = await withTenant(scope, (db) => pdfBrandFor(db, orgId), runtime);
    expect(brand).toEqual({ partnerId: p.id, logoSha256: sha256(png) });
    // Off for this partner: no brand.
    vi.stubEnv("PARTNERS_ENABLED", q.id);
    expect(await withTenant(scope, (db) => pdfBrandFor(db, orgId), runtime)).toBeNull();
    vi.stubEnv("PARTNERS_ENABLED", "true");
    const branded = await queuePdfExport(scope, report.revisionId, "en");
    expect((await owner.query("SELECT brand FROM evals.export_job WHERE id=$1", [branded.id])).rows[0].brand).toEqual({ partner_id: p.id, logo_sha256: sha256(png) });

    // The documents worker's view: the real brand renders the logo; forged ones render none.
    const docScope = { orgId, actorId: "service:evals-documents" };
    const resolved = await resolveJobBrand(docScope, { partner_id: p.id, logo_sha256: sha256(png) }, documents);
    expect(resolved?.partner.name).toBe("Agencia Marca");
    expect(resolved?.partner.logoDataUri).toBe(`data:image/png;base64,${png.toString("base64")}`);
    expect(resolved?.suffix).toBe(`.b${sha256(png).slice(0, 8)}`);
    await setPartnerLogo(q.admin.identity, q.id, { imageBase64: pngBytes(64, 64).toString("base64") });
    const qSha = (await owner.query("SELECT logo_sha256 FROM evals.partner WHERE id=$1", [q.id])).rows[0].logo_sha256;
    expect(await resolveJobBrand(docScope, { partner_id: q.id, logo_sha256: qSha }, documents)).toBeNull();
    expect(await resolveJobBrand(docScope, { partner_id: p.id, logo_sha256: "0".repeat(64) }, documents)).toBeNull();
    expect(await resolveJobBrand(docScope, { partner_id: p.id, logo_sha256: sha256(png), extra: true }, documents)).toBeTruthy();
    expect(await resolveJobBrand(docScope, "not-a-brand", documents)).toBeNull();
    // Another workspace's scope cannot read this partner's logo through its own job.
    const other = await customerWorkspace();
    expect(await resolveJobBrand({ orgId: other.orgId, actorId: "service:evals-documents" }, { partner_id: p.id, logo_sha256: sha256(png) }, documents)).toBeNull();
    // A forged brand cannot be stored on a share job or with extra keys.
    expect(await denied(owner.query("UPDATE evals.export_job SET brand=$2 WHERE id=$1", [branded.id, { partner_id: p.id, logo_sha256: sha256(png), object_key: "x" }]))).toMatch(/export_job_brand/);

    // Replacing the logo deletes the old object and changes the expected file; removing it ends branding.
    const replaced = await setPartnerLogo(p.admin.identity, p.id, { imageBase64: pngBytes(200, 50).toString("base64") });
    expect(replaced.sha256).not.toBe(saved.sha256);
    expect(await resolveJobBrand(docScope, { partner_id: p.id, logo_sha256: sha256(png) }, documents)).toBeNull();
    expect(await withTenant(scope, (db) => pdfBrandFor(db, orgId), runtime)).toEqual({ partnerId: p.id, logoSha256: replaced.sha256 });
    expect(await removePartnerLogo(p.admin.identity, p.id)).toEqual({ removed: true });
    expect(await withTenant(scope, (db) => pdfBrandFor(db, orgId), runtime)).toBeNull();
    // Unlinked: no brand either.
    await setPartnerLogo(p.admin.identity, p.id, { imageBase64: png.toString("base64") });
    await unlinkPartnerClient(opsAdmin.identity, p.id, { orgId, reason: "Fixture done" });
    expect(await withTenant(scope, (db) => pdfBrandFor(db, orgId), runtime)).toBeNull();
    expect(await resolveJobBrand(docScope, { partner_id: p.id, logo_sha256: sha256(png) }, documents)).toBeNull();
  });

  /* ------------------------------------------------------------- rollback --- */

  it("refuses the rollback while a partner exists", async () => {
    const sql = await readFile(new URL("../../db/rollbacks/103_evals_partners_down.sql", import.meta.url), "utf8");
    const client: PoolClient = await owner.connect();
    try {
      await expect(client.query(sql)).rejects.toThrow(/partners rollback refused/);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    expect((await owner.query("SELECT count(*)::int AS n FROM public.evals_migration_history WHERE name='103_evals_partners.sql'")).rows[0].n).toBe(1);
  });
});
