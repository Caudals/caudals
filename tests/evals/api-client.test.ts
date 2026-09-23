import { afterEach, describe, expect, it, vi } from "vitest";
import { EvalRequestError, evalRequest } from "@/components/evals/api";

afterEach(() => vi.unstubAllGlobals());

describe("evaluation API client errors", () => {
  it("does not display server exception details and includes a safe support reference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "postgres password=private SQLSTATE 42501",
              request_id: "request-123",
            },
          },
          { status: 503 },
        ),
      ),
    );

    await expect(evalRequest("/workspaces")).rejects.toMatchObject({
      status: 503,
      requestId: "request-123",
      message: expect.stringContaining("request-123"),
    });
    await expect(evalRequest("/workspaces")).rejects.not.toThrow(
      "postgres password=private",
    );
  });

  it("keeps authorization and missing-record failures understandable", () => {
    expect(new EvalRequestError(403, "SCOPE_DENIED").message).toContain("access");
    expect(new EvalRequestError(404, "SCOPE_DENIED").message).toContain("unavailable");
  });
});
