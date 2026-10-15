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

  it("answers a link opened in the browser with a page in the reader's language (launch L-23b)", async () => {
    mocks.requireIdentity.mockResolvedValue({ user: { id: "fixture-user", name: "Fixture", email: "fixture@example.test" }, platformRole: null, workspaces: [] });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { EvalError } = await import("@/lib/evals/domain/errors");
    const handler = api(async () => { throw new EvalError("INPUT_INVALID", 422, "Approve the test set before downloading the grading sheet."); });
    const navigate = (extra: Record<string, string>) => new Request("https://evals.test/api/evals/v1/evaluations/1/graded-results", { headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", ...extra } });

    const spanish = await handler(navigate({ cookie: "caudals_locale=es" }));
    expect(spanish.status).toBe(422);
    expect(spanish.headers.get("content-type")).toContain("text/html");
    expect(spanish.headers.get("cache-control")).toContain("no-store");
    const page = await spanish.text();
    expect(page).toContain('lang="es"');
    expect(page).toContain("Aprueba el conjunto de pruebas antes de descargar la hoja de calificación.");
    expect(page).not.toContain("Approve the test set");

    const english = await (await handler(navigate({ "accept-language": "en-GB" }))).text();
    expect(english).toContain("Approve the test set before downloading the grading sheet.");

    // The app's own requests and integrations keep the JSON contract.
    const json = await handler(new Request("https://evals.test/api/evals/v1/evaluations/1/graded-results", { headers: { "sec-fetch-mode": "cors", cookie: "caudals_locale=es" } }));
    expect((await json.json()).error).toMatchObject({ code: "INPUT_INVALID", message: "Approve the test set before downloading the grading sheet." });
  });
});
