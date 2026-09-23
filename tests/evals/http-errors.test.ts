import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireIdentity: vi.fn() }));
vi.mock("@/lib/evals/domain/identity", () => ({ requireIdentity: mocks.requireIdentity }));

import { api } from "@/lib/evals/domain/http";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("evaluation API failures", () => {
  it("keeps unexpected exception details out of responses and logs", async () => {
    mocks.requireIdentity.mockResolvedValue({
      user: { id: "fixture-user", name: "Fixture", email: "fixture@example.test" },
      platformRole: null,
      workspaces: [],
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = api(async () => {
      throw new Error("postgres password=private customer payload");
    });

    const response = await handler(new Request("https://evals.test/api/evals/v1/workspaces"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.message).toBe("The service is temporarily unavailable.");
    expect(JSON.stringify(body)).not.toContain("password=private");
    expect(log).toHaveBeenCalledWith("eval_api_request_failed", expect.objectContaining({
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      error_type: "Error",
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("password=private");
  });

  it("records a PostgreSQL error class without query details", async () => {
    mocks.requireIdentity.mockResolvedValue({
      user: { id: "fixture-user", name: "Fixture", email: "fixture@example.test" },
      platformRole: null,
      workspaces: [],
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = Object.assign(new Error("permission denied for customer table"), { code: "42501" });
    const handler = api(async () => { throw failure; });

    const response = await handler(new Request("https://evals.test/api/evals/v1/workspaces"));

    expect(response.status).toBe(503);
    expect(log).toHaveBeenCalledWith("eval_api_request_failed", expect.objectContaining({ database_code: "42501" }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("customer table");
  });
});
