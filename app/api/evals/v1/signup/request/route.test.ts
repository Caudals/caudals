import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Launch L-05: POST /api/evals/v1/signup/request with the database, email and
// limiter replaced. The real-database journey is tests/evals/direct-signup-db.test.ts.
const state = vi.hoisted(() => ({
  outcome: "link" as string | Error,
  queries: [] as { sql: string; values: unknown[] }[],
  sent: [] as { to: string; subject: string; text: string }[],
  limits: [] as string[],
  refuse: null as null | ((key: string) => boolean),
  events: [] as { eventName: string; payload?: Record<string, unknown> }[],
}));

vi.mock("@/lib/db/client", () => ({
  getPostgresPool: () => ({
    query: async (sql: string, values: unknown[]) => {
      state.queries.push({ sql, values });
      if (state.outcome instanceof Error) throw state.outcome;
      return { rows: [{ outcome: state.outcome }] };
    },
  }),
}));
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: async (message: { to: string; subject: string; text: string }) => { state.sent.push(message); return { data: { id: "fake" }, error: null }; } } }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async ({ key, limit }: { key: string; limit: number }) => {
    state.limits.push(key);
    const allowed = !state.refuse?.(key);
    return { allowed, limit, remaining: allowed ? limit - 1 : 0, retryAfterSeconds: allowed ? 0 : 60, resetAt: Date.now() + 60_000 };
  }),
}));
vi.mock("@/lib/analytics/funnel-events-server", () => ({
  analyticsV2Enabled: () => process.env.ANALYTICS_EVENTS_V2 === "true",
  recordProductEvent: vi.fn(async (event: { eventName: string; payload?: Record<string, unknown> }) => { state.events.push(event); return { ok: true }; }),
}));
vi.mock("@/lib/demo/store", () => ({ getRun: vi.fn(async () => null) }));

const { POST } = await import("./route");

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request("https://app.caudals.com/api/evals/v1/signup/request", {
    method: "POST",
    headers: { "content-type": "application/json", host: "app.caudals.com", origin: "https://app.caudals.com", "x-forwarded-for": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}
const work = { email: "Ana@Acme-Seguros.es", company: "Acme Seguros", locale: "es" };

describe("POST /api/evals/v1/signup/request (launch L-05)", () => {
  beforeEach(() => {
    process.env.SELF_SERVE_DIRECT_SIGNUP = "true";
    process.env.RESEND_FROM_EMAIL = "Caudals <hello@caudals.test>";
    process.env.BETTER_AUTH_URL = "https://app.caudals.com";
    Object.assign(state, { outcome: "link", queries: [], sent: [], limits: [], refuse: null, events: [] });
  });
  afterEach(() => {
    for (const key of ["SELF_SERVE_DIRECT_SIGNUP", "SELF_SERVE_SIGNUP_EXCEPTIONS", "SELF_SERVE_SIGNUP_BLOCKED_DOMAINS", "ANALYTICS_EVENTS_V2", "RESEND_FROM_EMAIL", "BETTER_AUTH_URL"]) delete process.env[key];
  });

  it("does not exist while SELF_SERVE_DIRECT_SIGNUP is off", async () => {
    delete process.env.SELF_SERVE_DIRECT_SIGNUP;
    const response = await post(work);
    expect(response.status).toBe(404);
    expect(state.limits).toEqual([]);
    expect(state.queries).toEqual([]);
    expect(state.sent).toEqual([]);
  });

  it("refuses another origin or host", async () => {
    expect((await post(work, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post(work, { host: "caudals.com", origin: "https://caudals.com" })).status).toBe(403);
    expect((await post(work, { origin: "" })).status).toBe(403);
    expect(state.queries).toEqual([]);
  });

  it("refuses free-mail addresses with a helpful code and sends nothing", async () => {
    const response = await post({ ...work, email: "ana.perez@gmail.com" });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: "WORK_EMAIL_REQUIRED", details: { reason: "free_mail" }, retryable: false });
    expect(body.error.message).toMatch(/demo/);
    expect(state.queries).toEqual([]);
    expect(state.sent).toEqual([]);
    expect(state.events).toEqual([expect.objectContaining({ eventName: "limit_hit", payload: { kind: "signup_free_mail" } })]);
  });

  it("refuses disposable and ops-blocked domains", async () => {
    expect((await (await post({ ...work, email: "x@mailinator.com" })).json()).error.details.reason).toBe("disposable");
    process.env.SELF_SERVE_SIGNUP_BLOCKED_DOMAINS = "fresh-burner.io";
    expect((await (await post({ ...work, email: "x@fresh-burner.io" })).json()).error.details.reason).toBe("disposable");
    expect(state.queries).toEqual([]);
  });

  it("rejects malformed input before any database work", async () => {
    for (const body of [{ ...work, email: "not-an-email" }, { ...work, email: "ana@acme.test" }, { ...work, admin: true }, { ...work, locale: "fr" }, { company: "Acme" }]) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect((await response.json()).error.code).toBe("INPUT_INVALID");
    }
    expect((await post("{")).status).toBe(400);
    expect(state.queries).toEqual([]);
  });

  it("stores a direct link for the registrable domain under the domain rule and emails it", async () => {
    const response = await post({ ...work, email: "Ana@ventas.Acme-Seguros.es" });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ sent: true });
    const [query] = state.queries;
    expect(query.sql).toContain("evals.request_self_serve_signup($1, $2, $3, NULL, $4, 'direct', $5, $6, $7::jsonb)");
    expect(query.values.slice(1)).toEqual(["ana@ventas.acme-seguros.es", "Acme Seguros", "es", "acme-seguros.es", true, "{}"]);
    expect(query.values[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]).toMatchObject({ to: "ana@ventas.acme-seguros.es", subject: "Termina de crear tu espacio de Caudals" });
    const token = /\/workspace\/signup#([A-Za-z0-9_-]{43})/.exec(state.sent[0].text)?.[1];
    expect(token).toBeTruthy();
    // Only the token's sha256 reaches the database.
    expect(JSON.stringify(state.queries)).not.toContain(token);
  });

  it("answers identically whether a link was sent, an account exists or the company has a workspace", async () => {
    const replies: string[] = [];
    for (const outcome of ["link", "account_exists", "domain_taken", new Error("SIGNUP_LIMIT")]) {
      state.outcome = outcome;
      const response = await post(work);
      const body = await response.json();
      delete body.meta.request_id;
      replies.push(`${response.status} ${JSON.stringify(body)} ${[...response.headers.entries()].filter(([key]) => key !== "date").sort().join(";")}`);
    }
    expect(new Set(replies).size).toBe(1);
    expect(replies[0]).toMatch(/^200 /);
    // The email says what happened, to the address's owner only. A fourth link in a day sends nothing.
    expect(state.sent.map((message) => message.subject)).toEqual([
      "Termina de crear tu espacio de Caudals",
      "Ya tienes una cuenta de Caudals",
      "Tu empresa ya tiene un espacio de Caudals",
    ]);
    expect(state.sent[1].text).toContain("https://app.caudals.com/workspace/sign-in");
    expect(state.sent[2].text).toContain("acme-seguros.es");
    expect(state.sent[2].text).toContain("Ajustes → Miembros");
    expect(state.sent.every((message) => message.to === "ana@acme-seguros.es")).toBe(true);
    expect(state.events.map((event) => event.payload?.kind)).toEqual(["signup_domain_taken"]);
  });

  it("writes English email by default", async () => {
    await post({ email: "ana@acme-seguros.es", company: "Acme" });
    expect(state.sent[0].subject).toBe("Finish creating your Caudals workspace");
    expect(state.sent[0].text).toContain("expires in two days");
  });

  it("lifts the free-mail refusal and the domain rule for an ops exception", async () => {
    process.env.SELF_SERVE_SIGNUP_EXCEPTIONS = "founder@gmail.com";
    const response = await post({ ...work, email: "Founder@Gmail.com" });
    expect(response.status).toBe(200);
    expect(state.queries[0].values.slice(1, 6)).toEqual(["founder@gmail.com", "Acme Seguros", "es", "gmail.com", false]);
  });

  it("rate-limits per hashed visitor, per domain and per address, without the raw address in any key", async () => {
    await post(work);
    expect(state.limits).toHaveLength(3);
    const [visitor, domain, address] = state.limits;
    expect(visitor).toMatch(/^signup-request:visitor:[0-9a-f]{64}$/);
    expect(visitor).not.toContain("203.0.113.9");
    expect(domain).toBe("signup-request:domain:acme-seguros.es");
    expect(address).toMatch(/^signup-request:address:[0-9a-f]{64}$/);
    expect(state.limits.join(" ")).not.toContain("ana@");

    for (const prefix of ["signup-request:visitor:", "signup-request:domain:", "signup-request:address:"]) {
      Object.assign(state, { queries: [], sent: [], limits: [], events: [] });
      state.refuse = (key) => key.startsWith(prefix);
      const response = await post(work);
      expect(response.status, prefix).toBe(429);
      expect((await response.json()).error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
      expect(state.queries).toEqual([]);
      expect(state.sent).toEqual([]);
      expect(state.events).toEqual([expect.objectContaining({ eventName: "limit_hit", payload: { kind: "signup_rate" } })]);
    }
  });

  it("counts the visitor limit before reading the body", async () => {
    state.refuse = (key) => key.startsWith("signup-request:visitor:");
    expect((await post("{")).status).toBe(429);
  });

  it("carries consented first-touch attribution to the link", async () => {
    process.env.ANALYTICS_EVENTS_V2 = "true";
    const cookie = `caudals_attribution_v2=${encodeURIComponent(JSON.stringify({ utm_source: "linkedin", utm_campaign: "launch", ref: "https://evil.example/x" }))}`;
    await post(work, { cookie });
    expect(JSON.parse(state.queries[0].values[6] as string)).toEqual({ utm_source: "linkedin", utm_campaign: "launch" });
  });

  it("answers 503 without logging the address when the database or email fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.outcome = new Error("connection refused for ana@acme-seguros.es");
    const response = await post(work);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SIGNUP_UNAVAILABLE");
    expect(JSON.stringify(log.mock.calls)).not.toContain("ana@");
    log.mockRestore();
  });
});
