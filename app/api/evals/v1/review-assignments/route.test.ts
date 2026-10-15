import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvalError } from "@/lib/evals/domain/errors";

const mocks = vi.hoisted(() => ({ requireIdentity: vi.fn(), list: vi.fn(), change: vi.fn() }));
vi.mock("@/lib/evals/domain/identity", () => ({ requireIdentity: mocks.requireIdentity, requireWorkspace: vi.fn() }));
vi.mock("@/lib/evals/repositories/review-assignments", () => ({ listReviewAssignments: mocks.list, changeReviewAssignment: mocks.change }));

import { GET, POST } from "@/app/api/evals/v1/review-assignments/route";

const ORG = "00000000-0000-4000-8000-000000000001";
const ITEM = "00000000-0000-4000-8000-000000000401";
const operator = { user: { id: "operator" }, platformRole: "operator", workspaces: [] };
const customer = { user: { id: "customer" }, platformRole: null, workspaces: [{ id: ORG, name: "Acme", role: "owner" }] };
const request = (fields: object | null, origin = "https://app.test") => new Request(`https://app.test/api/evals/v1/review-assignments${fields ? "" : `?orgId=${ORG}`}`, {
  method: fields ? "POST" : "GET", headers: { origin, host: "app.test", "content-type": "application/json" }, body: fields ? JSON.stringify(fields) : undefined,
});
const assign = { orgId: ORG, subjectKind: "assessment", subjectId: ITEM, action: "assign" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireIdentity.mockResolvedValue(operator);
  mocks.list.mockResolvedValue([]);
  mocks.change.mockResolvedValue({ subjectKind: "assessment", subjectId: ITEM, assigneeId: "operator", assigneeName: "Ana", assignedAt: "2026-10-15T10:00:00.000Z", mine: true });
});

describe("review queue assignments (launch G1)", () => {
  it("answer 404 to anyone but platform staff, before touching the database", async () => {
    mocks.requireIdentity.mockResolvedValue(customer);
    expect((await GET(request(null))).status).toBe(404);
    expect((await POST(request(assign))).status).toBe(404);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.change).not.toHaveBeenCalled();
  });

  it("act as the signed-in operator in the named workspace, with a strict body", async () => {
    expect((await GET(request(null))).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ orgId: ORG, actorId: "operator" });
    const response = await POST(request({ ...assign, takeOver: true }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.assignment).toMatchObject({ mine: true });
    expect(mocks.change).toHaveBeenCalledWith({ orgId: ORG, actorId: "operator" }, { subjectKind: "assessment", subjectId: ITEM, action: "assign", takeOver: true });
    expect((await POST(request({ ...assign, assigneeId: "someone" }))).status).toBe(400);
    expect((await POST(request({ ...assign, subjectKind: "report" }))).status).toBe(400);
    expect((await POST(request({ ...assign, action: "delete" }))).status).toBe(400);
    expect((await POST(request(assign, "https://evil.test"))).status).toBe(403);
  });

  it("answer 409 when someone else holds the item", async () => {
    mocks.change.mockRejectedValue(new EvalError("REVIEW_ASSIGNED", 409, "Someone else is already reviewing this item. Refresh the queue, or take it over."));
    const response = await POST(request(assign));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: "REVIEW_ASSIGNED" });
  });
});
