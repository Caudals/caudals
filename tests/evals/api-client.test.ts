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

  it("shows the curated reason for a rejected request instead of a generic retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { code: "BUDGET_UNAVAILABLE", message: "Set a workspace budget before probing.", request_id: "request-9" } },
          { status: 409 },
        ),
      ),
    );
    await expect(evalRequest("/inference/probes", "POST", {})).rejects.toMatchObject({
      status: 409,
      message: "Set a workspace budget before probing.",
    });
  });

  it("keeps generic wording for schema failures and invitation codes", () => {
    expect(new EvalRequestError(400, "INPUT_INVALID", undefined, "Check the supplied fields.").message).not.toBe("Check the supplied fields.");
    expect(new EvalRequestError(404, "INVITATION_INVALID", undefined, "private detail").message).not.toContain("private detail");
  });
});
