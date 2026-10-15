import { afterEach, describe, expect, it, vi } from "vitest";
import { EvalRequestError, evalRequest, evalResponseError } from "@/components/evals/api";
import { setLocale } from "@/lib/evals/messages/en";

afterEach(() => {
  vi.unstubAllGlobals();
  setLocale("en");
});

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

describe("evaluation API client errors in Spanish (launch L-23b)", () => {
  const answer = (status: number, code: string, message: string) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code, message, request_id: "request-es" } }, { status })));

  it("shows the server's sentence in Spanish", async () => {
    setLocale("es");
    answer(409, "VERSION_CONFLICT", "The schedule changed. Reload it before saving.");
    await expect(evalRequest("/schedules/1", "PATCH", {})).rejects.toMatchObject({ message: "La programación ha cambiado. Vuelve a cargarla antes de guardar." });
    answer(402, "CREDITS_EXHAUSTED", "Not enough credits for this run. Add 25 credits to continue.");
    await expect(evalRequest("/evaluations/1/start", "POST", {})).rejects.toMatchObject({ code: "CREDITS_EXHAUSTED", message: "No hay créditos suficientes para esta ejecución. Añade 25 créditos para continuar." });
  });

  it("falls back to the code's message, never to an English sentence", async () => {
    setLocale("es");
    answer(422, "INPUT_INVALID", "A brand-new sentence without Spanish.");
    const error = (await evalRequest("/x", "POST", {}).catch((value: unknown) => value)) as EvalRequestError;
    expect(error.message).toBe("Revisa los datos que has introducido y vuelve a intentarlo.");
    answer(409, "SOMETHING_NEW", "Another new sentence.");
    const unknown = (await evalRequest("/x", "POST", {}).catch((value: unknown) => value)) as EvalRequestError;
    expect(unknown.message).toContain("SOMETHING_NEW");
    expect(unknown.message).not.toContain("Another new sentence");
  });

  it("localizes the support reference and a failed connection", async () => {
    setLocale("es");
    answer(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.");
    await expect(evalRequest("/x")).rejects.toMatchObject({ message: expect.stringContaining("Referencia: request-es.") });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const offline = (await evalRequest("/x").catch((value: unknown) => value)) as EvalRequestError;
    expect(offline).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
    expect(offline.message).toBe("No se ha podido conectar con Caudals. Comprueba tu conexión y vuelve a intentarlo.");
    setLocale("en");
    expect(new EvalRequestError(0, "NETWORK_ERROR").message).toBe("Could not reach Caudals. Check your connection and try again.");
  });

  it("reads an upload's error body like any other answer", () => {
    setLocale("es");
    const error = evalResponseError(422, { error: { code: "INPUT_INVALID", message: "Check the sheet: row 4: motivo_required." } });
    expect(error.message).toBe("Revisa la hoja: fila 4: motivo_required.");
    expect(evalResponseError(500, null).code).toBe("UNKNOWN");
  });
});
