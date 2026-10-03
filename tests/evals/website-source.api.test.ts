import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireIdentity: vi.fn(), requireWorkspace: vi.fn(),
  validatePublicDestination: vi.fn(), createWebsiteSource: vi.fn(),
}));
vi.mock("@/lib/evals/domain/identity", () => ({ requireIdentity: mocks.requireIdentity, requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/evals/connectors/egress", () => ({ validatePublicDestination: mocks.validatePublicDestination }));
vi.mock("@/lib/evals/repositories/evidence", () => ({ createWebsiteSource: mocks.createWebsiteSource }));

import { POST } from "@/app/api/evals/v1/sources/websites/route";
import { canonicalJson } from "@/lib/evals/contracts/hashing";

const orgId = "11111111-1111-4111-8111-111111111111";
const evaluationId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const input = { orgId, evaluationId, projectId, url: "https://indexacapital.com/", rights: "customer_owned" };

function request(fields: object) {
  return new Request("https://evals.test/api/evals/v1/sources/websites", {
    method: "POST",
    headers: { origin: "https://evals.test", host: "evals.test", "content-type": "application/json", "Idempotency-Key": "website-source-fixture" },
    body: JSON.stringify(fields),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireIdentity.mockResolvedValue({ user: { id: "actor" }, platformRole: null, workspaces: [] });
  mocks.requireWorkspace.mockResolvedValue(undefined);
  mocks.validatePublicDestination.mockResolvedValue({ url: new URL(input.url) });
  mocks.createWebsiteSource.mockImplementation(async (_scope, payload) => {
    // The repository hashes this exact payload, rejecting undefined fields.
    canonicalJson(payload);
    return { sourceId: "source-fixture", jobId: "job-fixture", status: "queued" };
  });
});

describe("adding public website context", () => {
  it("accepts the preparation form's request without optional fields", async () => {
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { sourceId: "source-fixture", status: "queued" } });
    expect(mocks.createWebsiteSource).toHaveBeenCalledWith({ orgId, actorId: "actor" }, {
      evaluationId, projectId, url: input.url, title: "indexacapital.com", rights: "customer_owned", pageLimit: 25,
    }, "website-source-fixture");
    expect(mocks.requireWorkspace).toHaveBeenCalledWith(expect.anything(), orgId, "write");
  });

  it("preserves an explicit page limit and title", async () => {
    const response = await POST(request({ ...input, pageLimit: 3, title: "Indexa policies" }));
    expect(response.status).toBe(200);
    expect(mocks.createWebsiteSource.mock.calls[0][1]).toMatchObject({ pageLimit: 3, title: "Indexa policies" });
  });

  it.each([0, 26, 1.5, null])("rejects the invalid page limit %s before queuing a source", async (pageLimit) => {
    const response = await POST(request({ ...input, pageLimit }));
    expect(response.status).toBe(400);
    expect(mocks.createWebsiteSource).not.toHaveBeenCalled();
  });
});
