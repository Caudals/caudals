import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireIdentity: vi.fn(), requireWorkspace: vi.fn(), create: vi.fn(), list: vi.fn(), snapshotDraft: vi.fn(), accountDraft: vi.fn(), reviewedDraft: vi.fn(),
}));
vi.mock("@/lib/evals/domain/identity", () => ({ requireIdentity: mocks.requireIdentity, requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/evals/repositories/prospects", async (original) => ({
  ...(await original<typeof import("@/lib/evals/repositories/prospects")>()), createProspectSnapshot: mocks.create, listProspectSnapshots: mocks.list,
}));
vi.mock("@/lib/evals/monitoring/crm", () => ({ createSnapshotCrmDraft: mocks.snapshotDraft, createAccountCrmDraft: mocks.accountDraft, createCrmHandoffDraft: mocks.reviewedDraft, listCrmHandoffDrafts: vi.fn() }));

import { GET, POST } from "@/app/api/evals/v1/prospects/route";
import { POST as DRAFT } from "@/app/api/evals/v1/crm-handoff-drafts/route";

const operator = { user: { id: "operator" }, platformRole: "operator", workspaces: [] };
const customer = { user: { id: "customer" }, platformRole: null, workspaces: [] };
const body = { company: "Acme", chatUrl: "https://acme.es/chat", helpUrl: "https://acme.es/ayuda", locale: "es", basis: "public_information", confirmPolicy: true };
const request = (url: string, fields: object, method = "POST") => new Request(`https://app.test/api/evals/v1${url}`, {
  method, headers: { origin: "https://app.test", host: "app.test", "content-type": "application/json", "Idempotency-Key": "prospect-key-1" }, body: method === "GET" ? undefined : JSON.stringify(fields),
});

beforeEach(() => {
  vi.resetAllMocks();
  process.env.PROSPECT_SNAPSHOTS_ENABLED = "true";
  mocks.requireIdentity.mockResolvedValue(operator);
  mocks.create.mockResolvedValue({ id: "snapshot", orgId: "org", evaluationId: "evaluation" });
  mocks.list.mockResolvedValue({ snapshots: [] });
  mocks.snapshotDraft.mockResolvedValue({ id: "draft", created: true });
  mocks.accountDraft.mockResolvedValue({ id: "draft", created: true });
});

describe("prospect snapshot routes (launch L-21)", () => {
  it("answer 404 with the flag off or for anyone but platform staff", async () => {
    process.env.PROSPECT_SNAPSHOTS_ENABLED = "false";
    expect((await POST(request("/prospects", body))).status).toBe(404);
    expect((await GET(request("/prospects", {}, "GET"))).status).toBe(404);
    process.env.PROSPECT_SNAPSHOTS_ENABLED = "true";
    mocks.requireIdentity.mockResolvedValue(customer);
    expect((await POST(request("/prospects", body))).status).toBe(404);
    expect((await GET(request("/prospects", {}, "GET"))).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("requires the policy confirmation, a strict body and a note for owner permission", async () => {
    const { confirmPolicy: _confirmed, ...unconfirmed } = body;
    expect((await POST(request("/prospects", unconfirmed))).status).toBe(400);
    expect((await POST(request("/prospects", { ...body, confirmPolicy: false }))).status).toBe(400);
    expect((await POST(request("/prospects", { ...body, adversarial: true }))).status).toBe(400);
    expect((await POST(request("/prospects", { ...body, basis: "owner_permission" }))).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
    const response = await POST(request("/prospects", { ...body, basis: "owner_permission", basisNote: "Product lead, email 2026-10-10" }));
    expect(response.status).toBe(200);
    const { confirmPolicy: _c, ...expected } = { ...body, basis: "owner_permission", basisNote: "Product lead, email 2026-10-10" };
    expect(mocks.create).toHaveBeenCalledWith(operator, expected, "prospect-key-1");
  });

  it("refuses cross-origin writes", async () => {
    const response = await POST(new Request("https://app.test/api/evals/v1/prospects", { method: "POST", headers: { origin: "https://evil.test", host: "app.test", "content-type": "application/json" }, body: JSON.stringify(body) }));
    expect(response.status).toBe(403);
  });

  it("creates CRM drafts only through an explicit operator request", async () => {
    const outreach = { locale: "es", linkedin: "Hola", emailSubject: "Asunto", emailBody: "Cuerpo" };
    const snapshotId = "44444444-4444-4444-8444-444444444444";
    expect((await DRAFT(request("/crm-handoff-drafts", { prospectSnapshotId: snapshotId, outreach }))).status).toBe(200);
    expect(mocks.snapshotDraft).toHaveBeenCalledWith("operator", snapshotId, outreach);
    process.env.PROSPECT_SNAPSHOTS_ENABLED = "false";
    expect((await DRAFT(request("/crm-handoff-drafts", { prospectSnapshotId: snapshotId, outreach }))).status).toBe(404);
    const orgId = "55555555-5555-4555-8555-555555555555";
    expect((await DRAFT(request("/crm-handoff-drafts", { orgId, source: "growth" }))).status).toBe(200);
    expect(mocks.requireWorkspace).toHaveBeenCalledWith(operator, orgId, "manage");
    expect(mocks.accountDraft).toHaveBeenCalledWith({ orgId, actorId: "operator" });
    mocks.requireIdentity.mockResolvedValue(customer);
    expect((await DRAFT(request("/crm-handoff-drafts", { orgId, source: "growth" }))).status).toBe(404);
    expect(mocks.accountDraft).toHaveBeenCalledTimes(1);
  });
});
