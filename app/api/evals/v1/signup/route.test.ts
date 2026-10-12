import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { context: { orgId: string; actorId: string }; sql: string; values?: unknown[] };
const calls: Call[] = [];

vi.mock("@/lib/evals/repositories/db", () => ({
  withTenant: vi.fn(async (context: Call["context"], callback: (db: unknown) => Promise<unknown>) =>
    callback({
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ context, sql, values });
        if (sql.includes("self_serve_signup_lookup")) return { rows: [{ email: "ana@acme.example", workspace_name: "Acme", locale: "es" }] };
        if (sql.includes("enroll_self_serve")) return { rows: [{ org_id: "00000000-0000-4000-8000-000000000001", demo_run_id: null, email: "ana@acme.example" }] };
        if (sql.includes("record_terms_acceptance")) return { rows: [{ id: `acceptance-${calls.length}` }] };
        return { rows: [] };
      },
    }),
  ),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, resetAt: Date.now() + 1000 })),
}));
vi.mock("@/lib/demo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demo/client")>()),
  clientHash: () => "0".repeat(64),
}));
vi.mock("@/lib/demo/store", () => ({ getRun: vi.fn(async () => null) }));
vi.mock("@/lib/demo/import", () => ({ importDemo: vi.fn() }));

const { POST } = await import("./route");

const token = "a".repeat(43);
const signup = (body: Record<string, unknown>) =>
  POST(
    new Request("https://app.caudals.com/api/evals/v1/signup", {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.caudals.com", origin: "https://app.caudals.com" },
      body: JSON.stringify(body),
    }),
  );
const complete = { token, name: "Ana Pérez", password: "a-long-password-1" };
const recorded = () => calls.filter((call) => call.sql.includes("record_terms_acceptance"));

describe("POST /api/evals/v1/signup terms acceptance (launch L-01)", () => {
  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(() => {
    delete process.env.SIGNUP_TERMS_REQUIRED;
  });

  it("refuses to create the account without acceptance when SIGNUP_TERMS_REQUIRED=true", async () => {
    process.env.SIGNUP_TERMS_REQUIRED = "true";
    for (const body of [complete, { ...complete, acceptTerms: false }]) {
      const response = await signup(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("TERMS_REQUIRED");
    }
    expect(calls.some((call) => call.sql.includes("enroll_self_serve"))).toBe(false);
  });

  it("records the Terms and Privacy versions for the new person in the enrollment transaction", async () => {
    process.env.SIGNUP_TERMS_REQUIRED = "true";
    const response = await signup({ ...complete, acceptTerms: true, locale: "es" });
    expect(response.status).toBe(200);
    const enroll = calls.find((call) => call.sql.includes("enroll_self_serve"))!;
    const userId = enroll.values?.[3];
    expect(enroll.context).toEqual({ orgId: "", actorId: userId });
    const requestId = (await response.json()).meta.request_id;
    expect(recorded().map((call) => [call.context.actorId, ...(call.values ?? [])])).toEqual([
      [userId, "00000000-0000-4000-8000-000000000001", "terms", "2026-10-11", "signup", "es", requestId],
      [userId, "00000000-0000-4000-8000-000000000001", "privacy", "2026-10-11", "signup", "es", requestId],
    ]);
  });

  it("keeps the earlier behaviour while the flag is off", async () => {
    const response = await signup(complete);
    expect(response.status).toBe(200);
    expect(recorded()).toEqual([]);
  });

  it("still records an acceptance the form sent while the flag is off", async () => {
    const response = await signup({ ...complete, acceptTerms: true });
    expect(response.status).toBe(200);
    expect(recorded().map((call) => call.values?.[1])).toEqual(["terms", "privacy"]);
  });

  it("rejects unknown fields and a bad locale", async () => {
    process.env.SIGNUP_TERMS_REQUIRED = "true";
    expect((await signup({ ...complete, acceptTerms: true, locale: "fr" })).status).toBe(400);
    expect((await signup({ ...complete, acceptTerms: true, admin: true })).status).toBe(400);
  });
});
