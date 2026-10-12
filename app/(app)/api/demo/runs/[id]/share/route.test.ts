import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Launch L-04: "Send to a colleague" (and the L-02 copy acknowledgement) with
// the run store, email, limiter and event recorder replaced.
const RUN_ID = "00000000-0000-4000-8000-00000000d001";
const TOKEN = "b".repeat(32);
const KEY = "11111111-2222-4333-8444-555555555555";

const state = vi.hoisted(() => ({
  run: null as null | Record<string, unknown>,
  sent: [] as { message: { from: string; to: string; subject: string; text: string }; options?: { idempotencyKey?: string } }[],
  sendError: null as null | { message: string },
  limits: [] as { key: string; limit: number; windowMs: number }[],
  refuse: null as null | ((key: string) => boolean),
  events: [] as { eventName: string; eventKey?: string; payload?: Record<string, unknown> }[],
  eventResult: { ok: true } as Record<string, unknown>,
  order: [] as string[],
}));

vi.mock("@/lib/demo/store", () => ({
  getRun: vi.fn(async (id: string, tokenHash?: string) => {
    const { sha256 } = await import("@/lib/demo/client");
    return state.run && id === state.run.id && tokenHash === sha256(TOKEN) ? state.run : null;
  }),
}));
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({
    emails: {
      send: async (message: { from: string; to: string; subject: string; text: string }, options?: { idempotencyKey?: string }) => {
        state.order.push("send");
        if (state.sendError) return { data: null, error: state.sendError };
        state.sent.push({ message, options });
        return { data: { id: "fake" }, error: null };
      },
    },
  }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async ({ key, limit, windowMs }: { key: string; limit: number; windowMs: number }) => {
    state.limits.push({ key, limit, windowMs });
    const allowed = !state.refuse?.(key);
    return { allowed, limit, remaining: allowed ? limit - 1 : 0, retryAfterSeconds: allowed ? 0 : 60, resetAt: Date.now() + 60_000 };
  }),
}));
vi.mock("@/lib/analytics/funnel-events-server", () => ({
  recordProductEvent: vi.fn(async (event: { eventName: string; eventKey?: string; payload?: Record<string, unknown> }) => {
    state.order.push("consent");
    state.events.push(event);
    return state.eventResult;
  }),
}));

const { POST } = await import("./route");

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID, locale: "en", phase: "done", target_host: "help.acme.test", docs_host: "acme.test",
    summary: { scored: 8, correct: 5, incorrect: 2, partial: 1, no_answer: 0, unscored: 0, causes: {} },
    expires_at: new Date("2026-10-19T10:00:00Z"), attribution: { utm_source: "newsletter" },
    ...overrides,
  };
}

function post(body?: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`https://caudals.com/api/demo/runs/${RUN_ID}/share`, {
      method: "POST",
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        host: "caudals.com", origin: "https://caudals.com", "x-forwarded-for": "203.0.113.9", "x-demo-token": TOKEN,
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: RUN_ID }) },
  );
}
const share = { email: "Colleague@Acme-Seguros.es", consent: true, key: KEY };
const ENV = ["DEMO_PUBLIC", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "NEXT_PUBLIC_APP_URL"];

describe("POST /api/demo/runs/:id/share (launch L-04)", () => {
  beforeEach(() => {
    process.env.DEMO_PUBLIC = "true";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Caudals <hello@caudals.test>";
    // Production bakes the app host here; the shared link must still be the public site.
    process.env.NEXT_PUBLIC_APP_URL = "https://app.caudals.com";
    Object.assign(state, { run: run(), sent: [], sendError: null, limits: [], refuse: null, events: [], eventResult: { ok: true }, order: [] });
  });
  afterEach(() => { for (const key of ENV) delete process.env[key]; });

  it("sends exactly one email with the private link after recording the sender's consent", async () => {
    const response = await post(share);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: true });
    expect(state.order).toEqual(["consent", "send"]);
    expect(state.sent).toHaveLength(1);
    const [{ message, options }] = state.sent;
    expect(message.to).toBe("colleague@acme-seguros.es");
    expect(message.subject).toBe("A colleague shared a Caudals test of help.acme.test");
    expect(message.text).toContain(`https://caudals.com/en/demo#r=${RUN_ID}.${TOKEN}`);
    expect(message.text).toContain("5 of 8 answers matched the website.");
    expect(message.text).toContain("works until 19 October 2026");
    expect(message.text).toContain("didn't keep your address");
    expect(options).toEqual({ idempotencyKey: `demo-share-${RUN_ID}-${KEY}` });
    expect(state.events).toEqual([expect.objectContaining({
      eventName: "demo_report_shared", source: "server", runId: RUN_ID, eventKey: `${RUN_ID}:email:${KEY}`,
      payload: { channel: "email", consent: true }, attribution: { utm_source: "newsletter" },
    })]);
    // Neither the address nor the IP reaches a limiter key or the event.
    expect(JSON.stringify([state.limits, state.events])).not.toMatch(/colleague|acme-seguros|203\.0\.113/i);
  });

  it("limits each visitor to five a day and each run to three over its life", async () => {
    await post(share);
    expect(state.limits.map(({ limit, windowMs }) => [limit, windowMs])).toEqual([[5, 86_400_000], [3, 604_800_000]]);
    expect(state.limits[1].key).toBe(`demo-share-run:${RUN_ID}`);

    state.sent = []; state.events = [];
    state.refuse = (key) => key.startsWith("demo-share-run:");
    const perRun = await post(share);
    expect(perRun.status).toBe(429);
    expect((await perRun.json()).error.code).toBe("share_limit");

    state.refuse = (key) => key.startsWith("demo-share-email:");
    expect((await post(share)).status).toBe(429);
    expect(state.sent).toEqual([]);
    expect(state.events).toEqual([]);
  });

  it("requires the consent box, a real address and a finished report", async () => {
    const noConsent = await post({ ...share, consent: false });
    expect(noConsent.status).toBe(400);
    expect((await noConsent.json()).error.code).toBe("consent_required");
    expect((await post({ email: share.email, key: KEY })).status).toBe(400);
    for (const email of ["not-an-email", "someone@mailinator.com", "someone@example.com", "a@b"]) {
      const response = await post({ ...share, email });
      expect(response.status, email).toBe(400);
      expect((await response.json()).error.code).toBe("email_invalid");
    }
    expect((await post({ ...share, key: "not-a-uuid" })).status).toBe(400);
    expect((await post({ ...share, cc: "other@acme.es" })).status).toBe(400);
    state.run = run({ phase: "asking" });
    expect((await post(share)).status).toBe(404);
    expect(state.sent).toEqual([]);
    expect(state.limits).toEqual([]);
  });

  it("needs the run's private token and the same origin", async () => {
    expect((await post(share, { "x-demo-token": "c".repeat(32) })).status).toBe(404);
    expect((await post(share, { origin: "https://evil.example" })).status).toBe(403);
    expect(state.sent).toEqual([]);
  });

  it("does not exist while DEMO_PUBLIC is off", async () => {
    delete process.env.DEMO_PUBLIC;
    expect((await post(share)).status).toBe(404);
    expect(state.sent).toEqual([]);
    expect(state.limits).toEqual([]);
  });

  it("sends nothing when the consent record cannot be written, and never logs the address", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    state.eventResult = { error: "analytics_write_failed" };
    const unrecorded = await post(share);
    expect(unrecorded.status).toBe(503);
    expect((await unrecorded.json()).error.code).toBe("share_unavailable");
    expect(state.sent).toEqual([]);

    state.eventResult = { ok: true };
    state.sendError = { message: "rejected for colleague@acme-seguros.es" };
    expect((await post(share)).status).toBe(503);
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/colleague|acme/i);
    expect(errors).toHaveBeenCalledWith("demo_share_failed", { run_id: RUN_ID, code: "email_rejected" });
    errors.mockRestore();
  });

  it("writes the email in the run's language", async () => {
    state.run = run({ locale: "es" });
    await post(share);
    const [{ message }] = state.sent;
    expect(message.subject).toBe("Un colega te ha enviado una prueba de Caudals de help.acme.test");
    expect(message.text).toContain(`https://caudals.com/es/demo#r=${RUN_ID}.${TOKEN}`);
    expect(message.text).toContain("5 de 8 respuestas coinciden con la web.");
    expect(message.text).toContain("funciona hasta el 19 de octubre de 2026");
  });

  it("still acknowledges a copied link without a body, flag or email (launch L-02)", async () => {
    delete process.env.DEMO_PUBLIC;
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(state.sent).toEqual([]);
    expect(state.events).toEqual([expect.objectContaining({ eventName: "demo_report_shared", eventKey: RUN_ID })]);
    expect(state.events[0].payload).toBeUndefined();
  });
});
