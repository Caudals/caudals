import { beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOMER_API_FIELDS, CUSTOMER_API_LIMITS } from "@/lib/evals/monitoring/customer-api";

// Launch L-20: the customer read API selects exactly the documented fields and
// answers 429 with Retry-After once a token spends its per-minute budget. The
// database and the limiter are replaced; the real-database token checks are in
// tests/billing/price-book-db.test.ts.
const state = vi.hoisted(() => ({
  queries: [] as string[],
  token: { id: "11111111-1111-4111-8111-111111111111", scopes: ["runs:read"], expires_at: "2999-01-01T00:00:00Z", revoked_at: null as string | null },
  allowed: true,
  limits: [] as { key: string; limit: number; windowMs: number }[],
}));

vi.mock("@/lib/evals/repositories/db", () => ({
  withTenant: async (_scope: unknown, work: (db: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => unknown) =>
    work({
      query: async (sql: string) => {
        state.queries.push(sql);
        if (sql.includes("FROM evals.customer_api_token")) return { rows: [state.token] };
        return { rows: [{ id: "row" }] };
      },
    }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async (input: { key: string; limit: number; windowMs: number }) => {
    state.limits.push(input);
    return { allowed: state.allowed, limit: input.limit, remaining: 0, retryAfterSeconds: state.allowed ? 0 : 42, resetAt: Date.now() + 42_000 };
  }),
}));
vi.mock("@/lib/analytics/funnel-events-server", () => ({ recordProductEvent: vi.fn() }));

const { GET } = await import("./route");
const orgId = "00000000-0000-4000-8000-000000000001";
const bearer = `Bearer evct_${"a".repeat(43)}`;
const get = (resource: string, authorization: string | null = bearer) =>
  GET(new Request(`https://app.caudals.com/api/evals/v1/integrations/${resource}?orgId=${orgId}`, { headers: authorization ? { authorization } : {} }));

describe("GET /api/evals/v1/integrations/:resource (launch L-20)", () => {
  beforeEach(() => {
    state.queries.length = 0;
    state.limits.length = 0;
    state.allowed = true;
    state.token.scopes = ["runs:read", "reports:read", "schedules:read"];
    state.token.revoked_at = null;
  });

  it("selects exactly the fields the API reference documents, at most 100 rows", async () => {
    for (const resource of ["runs", "reports", "schedules"] as const) {
      state.queries.length = 0;
      const response = await get(resource);
      expect(response.status, resource).toBe(200);
      expect(await response.json()).toEqual({ data: [{ id: "row" }] });
      const select = state.queries.find((sql) => !sql.includes("customer_api_token"))!;
      const columns = select.slice(select.indexOf("SELECT") + 6, select.indexOf("FROM")).split(",").map((value) => value.trim().replace(/^r\./, ""));
      expect(columns, resource).toEqual([...CUSTOMER_API_FIELDS[resource]]);
      expect(select).toContain(`LIMIT ${CUSTOMER_API_LIMITS.listItems}`);
    }
  });

  it("counts one budget per token and answers 429 with Retry-After when it is spent", async () => {
    await get("runs");
    expect(state.limits).toEqual([{ key: `customer-api:${state.token.id}`, limit: 60, windowMs: 60_000 }]);
    state.allowed = false;
    const response = await get("runs");
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await response.json()).toEqual({ error: { code: "RATE_LIMITED" } });
  });

  it("refuses missing tokens, missing scopes, revoked tokens and unknown resources before counting", async () => {
    expect((await get("runs", null)).status).toBe(401);
    state.token.scopes = ["reports:read"];
    expect((await get("runs")).status).toBe(403);
    state.token.scopes = ["runs:read"];
    state.token.revoked_at = "2026-10-01T00:00:00Z";
    expect((await get("runs")).status).toBe(403);
    expect((await get("tokens")).status).toBe(404);
    expect(state.limits).toEqual([]);
  });
});
