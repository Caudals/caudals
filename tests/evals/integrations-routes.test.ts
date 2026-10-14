/**
 * Launch L-19 (spec v2 P-27): the CI trigger and gate routes. Behind
 * INTEGRATIONS_V2_ENABLED; `runs:write` to start a run, `runs:read` or
 * `runs:write` for the gate; 201 for a new run and 200 for a replayed key;
 * 429 with Retry-After from either limit. The database is replaced here; the
 * real run path, idempotency under concurrency and caps are in
 * tests/evals/integrations-v2-db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  token: { id: "11111111-1111-4111-8111-111111111111", scopes: ["runs:write"], expires_at: "2999-01-01T00:00:00Z", revoked_at: null as string | null },
  allowed: true,
  started: [] as Array<{ orgId: string; tokenId: string; body: unknown; key: string | null }>,
  replayed: false,
  startError: null as Error | null,
}));

vi.mock("@/lib/evals/repositories/db", () => ({
  withTenant: async (_scope: unknown, work: (db: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => unknown) =>
    work({ query: async (sql: string) => (sql.includes("FROM evals.customer_api_token") ? { rows: [state.token] } : { rows: [] }) }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async (input: { limit: number }) => ({ allowed: state.allowed, limit: input.limit, remaining: 0, retryAfterSeconds: state.allowed ? 0 : 17, resetAt: Date.now() + 17_000 })),
}));
vi.mock("@/lib/analytics/funnel-events-server", () => ({ recordProductEvent: vi.fn() }));
vi.mock("@/lib/evals/monitoring/ci-runs", async () => {
  const { EvalError } = await import("@/lib/evals/domain/errors");
  return {
    startApiRun: vi.fn(async (orgId: string, tokenId: string, body: unknown, key: string | null) => {
      if (state.startError) throw state.startError;
      if (!key) throw new EvalError("INPUT_INVALID", 400, "Send an Idempotency-Key header.");
      state.started.push({ orgId, tokenId, body, key });
      return { run_id: "22222222-2222-4222-8222-222222222222", status: "queued", replayed: state.replayed };
    }),
    runGate: vi.fn(async (_orgId: string, runId: string) => ({ run_id: runId, status: runId.startsWith("3") ? "pending" : "pass", reason_codes: [] })),
  };
});

const { POST } = await import("@/app/api/evals/v1/integrations/[resource]/route");
const { GET: GATE } = await import("@/app/api/evals/v1/integrations/[resource]/[id]/gate/route");
const orgId = "00000000-0000-4000-8000-000000000001";
const bearer = `Bearer evct_${"b".repeat(43)}`;
const body = { suiteVersionId: "44444444-4444-4444-8444-444444444444", targetRevisionId: "55555555-5555-4555-8555-555555555555" };
const start = (headers: Record<string, string> = { authorization: bearer, "idempotency-key": "release-abc12345" }, resource = "runs") =>
  POST(new Request(`https://app.caudals.com/api/evals/v1/integrations/${resource}?orgId=${orgId}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const gate = (runId = "66666666-6666-4666-8666-666666666666", authorization = bearer) =>
  GATE(new Request(`https://app.caudals.com/api/evals/v1/integrations/runs/${runId}/gate?orgId=${orgId}`, { headers: { authorization } }));

describe("CI trigger and gate routes (launch L-19)", () => {
  beforeEach(() => {
    process.env.INTEGRATIONS_V2_ENABLED = "true";
    state.token.scopes = ["runs:write"];
    state.token.revoked_at = null;
    state.allowed = true;
    state.started.length = 0;
    state.replayed = false;
    state.startError = null;
  });

  it("is closed while INTEGRATIONS_V2_ENABLED is off", async () => {
    process.env.INTEGRATIONS_V2_ENABLED = "false";
    expect((await start()).status).toBe(404);
    expect((await gate()).status).toBe(404);
    expect(state.started).toHaveLength(0);
  });

  it("starts a run with a runs:write token: 201 new, 200 replayed, key and token passed through", async () => {
    const created = await start();
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("private, no-store");
    expect((await created.json()).data).toMatchObject({ run_id: "22222222-2222-4222-8222-222222222222", replayed: false });
    expect(state.started[0]).toEqual({ orgId, tokenId: state.token.id, body, key: "release-abc12345" });
    state.replayed = true;
    expect((await start()).status).toBe(200);
  });

  it("refuses read-only, revoked or missing tokens, and only POSTs to runs", async () => {
    state.token.scopes = ["runs:read", "reports:read", "schedules:read"];
    expect((await start()).status).toBe(403);
    state.token.scopes = ["runs:write"];
    state.token.revoked_at = "2026-10-01T00:00:00Z";
    expect((await start()).status).toBe(403);
    state.token.revoked_at = null;
    expect((await start({ "idempotency-key": "release-abc12345" })).status).toBe(401);
    expect((await start(undefined, "reports")).status).toBe(404);
    expect(state.started).toHaveLength(0);
  });

  it("needs an Idempotency-Key and answers errors with code and message", async () => {
    const response = await start({ authorization: bearer });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "INPUT_INVALID", message: expect.stringContaining("Idempotency-Key") });
    const { EvalError } = await import("@/lib/evals/domain/errors");
    state.startError = new EvalError("CREDITS_EXHAUSTED", 402, "Add credits to start this run.");
    const short = await start();
    expect(short.status).toBe(402);
    expect((await short.json()).error.code).toBe("CREDITS_EXHAUSTED");
    state.startError = new Error("PLAN_LIMIT_RUNS");
    expect((await (await start()).json()).error.code).toBe("PLAN_LIMIT");
    state.startError = new Error("connection reset with secret details");
    const broken = await start();
    expect(broken.status).toBe(503);
    expect(JSON.stringify(await broken.json())).not.toContain("secret");
  });

  it("is rate limited per token with Retry-After", async () => {
    state.allowed = false;
    const limited = await start();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("17");
    expect((await limited.json()).error.code).toBe("RATE_LIMITED");
    expect(state.started).toHaveLength(0);
  });

  it("serves the gate to runs:read and runs:write tokens, with Retry-After while pending", async () => {
    for (const scopes of [["runs:read"], ["runs:write"]]) {
      state.token.scopes = scopes;
      const response = await gate();
      expect(response.status, scopes.join()).toBe(200);
      expect((await response.json()).data).toMatchObject({ status: "pass" });
    }
    const pending = await gate("33333333-3333-4333-8333-333333333333");
    expect(pending.headers.get("retry-after")).toBe("30");
    state.token.scopes = ["reports:read"];
    expect((await gate()).status).toBe(403);
    expect((await gate("not-a-uuid")).status).toBe(400);
  });
});
