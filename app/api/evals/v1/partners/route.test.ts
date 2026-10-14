import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Partner routes (launch L-28): the PARTNERS_ENABLED gate answers 404 before
 * any database work, writes need the app's own origin, ops changes need a
 * recent platform-admin sign-in, the client route tells creation from ops
 * linking, and the statement downloads as CSV. Database checks (RLS, forged
 * identities) are in tests/evals/partners-db.test.ts.
 */
const mocks = vi.hoisted(() => ({ requireIdentity: vi.fn(), statement: vi.fn(), create: vi.fn(), link: vi.fn(), withTenant: vi.fn() }));
vi.mock("@/lib/evals/domain/identity", async (original) => ({ ...(await original<typeof import("@/lib/evals/domain/identity")>()), requireIdentity: mocks.requireIdentity }));
vi.mock("@/lib/evals/repositories/db", () => ({ withTenant: mocks.withTenant, getEvalsPool: vi.fn() }));
vi.mock("@/lib/evals/partners/repository", async (original) => ({
  ...(await original<typeof import("@/lib/evals/partners/repository")>()), partnerStatement: mocks.statement, createPartnerClient: mocks.create, linkPartnerClient: mocks.link,
}));

import { GET as LIST, POST as CREATE } from "@/app/api/evals/v1/partners/route";
import { GET as OVERVIEW, PATCH } from "@/app/api/evals/v1/partners/[id]/route";
import { POST as CLIENTS } from "@/app/api/evals/v1/partners/[id]/clients/route";
import { POST as MEMBERS } from "@/app/api/evals/v1/partners/[id]/members/route";
import { PUT as LOGO } from "@/app/api/evals/v1/partners/[id]/logo/route";
import { GET as STATEMENT } from "@/app/api/evals/v1/partners/[id]/statement/route";
import { PUT as ALLOWANCE } from "@/app/api/evals/v1/partners/[id]/allowance/route";

const PARTNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const now = () => new Date().toISOString();
const admin = { user: { id: "admin" }, platformRole: "platform_admin", workspaces: [], sessionCreatedAt: now() };
const partnerAdmin = { user: { id: "pa" }, platformRole: null, workspaces: [], partners: [{ id: PARTNER, name: "Agencia", role: "admin" }], sessionCreatedAt: now() };
const request = (path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) => new Request(`https://app.test/api/evals/v1${path}`, {
  method, headers: { origin: "https://app.test", host: "app.test", "content-type": "application/json", "idempotency-key": "partner-request-1", ...extra },
  body: body === undefined ? undefined : JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("PARTNERS_ENABLED", "true");
  vi.stubEnv("BILLING_STRIPE_MODE", "test");
  mocks.requireIdentity.mockResolvedValue(partnerAdmin);
  mocks.withTenant.mockRejectedValue(new Error("database must not be reached"));
});

describe("partner routes (launch L-28)", () => {
  it("answer 404 with the flag off, before touching the database", async () => {
    vi.stubEnv("PARTNERS_ENABLED", "false");
    mocks.requireIdentity.mockResolvedValue(admin);
    const responses = await Promise.all([
      LIST(request("/partners")), CREATE(request("/partners", "POST", { name: "Agencia", reason: "Agreement" })),
      OVERVIEW(request(`/partners/${PARTNER}`)), PATCH(request(`/partners/${PARTNER}`, "PATCH", { status: "suspended", reason: "Pause" })),
      MEMBERS(request(`/partners/${PARTNER}/members`, "POST", { email: "a@b.test", role: "admin", reason: "Add" })),
      STATEMENT(request(`/partners/${PARTNER}/statement?month=2026-10`)),
    ]);
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(mocks.statement).not.toHaveBeenCalled();
  });

  it("open a partner's surfaces only for listed partners (the per-partner gate)", async () => {
    vi.stubEnv("PARTNERS_ENABLED", OTHER);
    expect((await OVERVIEW(request(`/partners/${PARTNER}`))).status).toBe(404);
    expect((await STATEMENT(request(`/partners/${PARTNER}/statement`))).status).toBe(404);
    expect(mocks.statement).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("keep ops changes for platform admins with a recent sign-in", async () => {
    const body = { email: "person@agency.test", role: "member", reason: "Per agreement" };
    expect((await MEMBERS(request(`/partners/${PARTNER}/members`, "POST", body))).status).toBe(403);
    expect((await ALLOWANCE(request(`/partners/${PARTNER}/allowance`, "PUT", { monthlyCredits: 1000, validFrom: "2026-10-01", reason: "Agreement" }))).status).toBe(403);
    expect((await CREATE(request("/partners", "POST", { name: "Mine", reason: "Self-service" }))).status).toBe(403);
    mocks.requireIdentity.mockResolvedValue({ ...admin, sessionCreatedAt: new Date(Date.now() - 3_600_000).toISOString() });
    const stale = await MEMBERS(request(`/partners/${PARTNER}/members`, "POST", body));
    expect([stale.status, (await stale.json()).error.code]).toEqual([403, "REAUTHENTICATION_REQUIRED"]);
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("refuse cross-origin writes and strict bodies", async () => {
    expect((await CLIENTS(request(`/partners/${PARTNER}/clients`, "POST", { name: "Cliente" }, { origin: "https://evil.test" }))).status).toBe(403);
    mocks.requireIdentity.mockResolvedValue(admin);
    expect((await CREATE(request("/partners", "POST", { name: "Agencia", reason: "Agreement", revenueShareBps: 2000, extra: true }))).status).toBe(400);
    expect((await PATCH(request(`/partners/${PARTNER}`, "PATCH", { status: "deleted", reason: "Nope" }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("create a client for partner admins and link an existing workspace for ops", async () => {
    mocks.create.mockResolvedValue({ orgId: OTHER, name: "Cliente" });
    const created = await CLIENTS(request(`/partners/${PARTNER}/clients`, "POST", { name: "Cliente" }));
    expect(created.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(partnerAdmin, PARTNER, { name: "Cliente" }, "partner-request-1");
    mocks.link.mockResolvedValue({ id: "link" });
    await CLIENTS(request(`/partners/${PARTNER}/clients`, "POST", { orgId: OTHER, access: "work", reason: "Client agreed" }));
    expect(mocks.link).toHaveBeenCalledWith(partnerAdmin, PARTNER, { orgId: OTHER, access: "work", reason: "Client agreed" });
  });

  it("bound the logo upload", async () => {
    const response = await LOGO(request(`/partners/${PARTNER}/logo`, "PUT", { imageBase64: "A".repeat(900_000) }));
    expect(response.status).toBe(413);
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("download the statement as CSV for the chosen month and mode", async () => {
    mocks.statement.mockResolvedValue({ partner: "Agencia Ñ", revenueShareBps: 2000, rows: [
      { section: "referral_payment", occurredAt: "2026-09-03T10:00:00.000Z", orgId: OTHER, workspace: "Cliente", reference: "o1", detail: "checkout", netCents: 2000, shareCents: 400, creditsUcr: null, returnedUcr: null },
    ] });
    const response = await STATEMENT(request(`/partners/${PARTNER}/statement?month=2026-09&mode=live`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Caudals-partner-statement-Agencia-N-2026-09.csv"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.statement).toHaveBeenCalledWith(partnerAdmin, PARTNER, "2026-09", true);
    const body = await response.text();
    expect(body).toContain("total_referred_revenue,,,,2026-09,,20.00,4.00,,");
    // Without parameters: the previous Madrid month in the running Stripe mode (test).
    await STATEMENT(request(`/partners/${PARTNER}/statement?month=bad`));
    expect(mocks.statement).toHaveBeenLastCalledWith(partnerAdmin, PARTNER, expect.stringMatching(/^[0-9]{4}-[0-9]{2}$/), false);
  });
});
