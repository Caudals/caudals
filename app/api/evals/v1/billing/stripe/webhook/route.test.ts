import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Launch L-12: the signed Stripe webhook endpoint with processing replaced.
// Idempotency, replays and out-of-order events run against the real schema in
// tests/billing/payments-db.test.ts.
const state = vi.hoisted(() => ({ handled: [] as Array<{ id: string; livemode: boolean }>, result: { status: 200, outcome: "purchase_recorded" } as { status: number; outcome: string } }));
vi.mock("@/lib/billing/webhook", () => ({
  handleStripeEvent: vi.fn(async (event: { id: string }, _raw: string, ctx: { livemode: boolean }) => { state.handled.push({ id: event.id, livemode: ctx.livemode }); return state.result; }),
}));

const { POST } = await import("./route");
const SECRET = "whsec_test_fixture_secret";
const payload = JSON.stringify({ id: "evt_fixture123", object: "event", type: "checkout.session.completed", livemode: false, created: 1, data: { object: { id: "cs_test_fixture" } } });

function post(body: string, headers: Record<string, string>) {
  return POST(new Request("https://app.caudals.com/api/evals/v1/billing/stripe/webhook", {
    method: "POST", headers: { "content-type": "application/json", host: "app.caudals.com", ...headers }, body,
  }));
}
const sign = (body: string, secret = SECRET, timestamp?: number) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp });

describe("POST /api/evals/v1/billing/stripe/webhook (launch L-12)", () => {
  const env = { ...process.env };
  beforeEach(() => {
    state.handled = [];
    state.result = { status: 200, outcome: "purchase_recorded" };
    process.env.BILLING_STRIPE_MODE = "test";
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    process.env.STRIPE_TEST_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => { process.env = { ...env }; });

  it("verifies the signature and hands the event to processing in test mode", async () => {
    const response = await post(payload, { "stripe-signature": sign(payload) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, outcome: "purchase_recorded" });
    expect(state.handled).toEqual([{ id: "evt_fixture123", livemode: false }]);
  });

  it("rejects a missing, forged, tampered or stale signature without processing", async () => {
    expect((await post(payload, {})).status).toBe(400);
    expect((await post(payload, { "stripe-signature": sign(payload, "whsec_someone_else") })).status).toBe(400);
    expect((await post(payload.replace("cs_test_fixture", "cs_test_other"), { "stripe-signature": sign(payload) })).status).toBe(400);
    expect((await post(payload, { "stripe-signature": sign(payload, SECRET, Math.floor(Date.now() / 1000) - 600) })).status).toBe(400);
    expect(state.handled).toEqual([]);
  });

  it("answers 503 (Stripe retries) when processing defers or the endpoint is not configured", async () => {
    state.result = { status: 503, outcome: "order_not_paid" };
    expect((await post(payload, { "stripe-signature": sign(payload) })).status).toBe(503);
    delete process.env.STRIPE_TEST_WEBHOOK_SECRET;
    expect((await post(payload, { "stripe-signature": sign(payload) })).status).toBe(503);
  });

  it("never runs with a key of the other mode", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_fixture";
    expect((await post(payload, { "stripe-signature": sign(payload) })).status).toBe(503);
    expect(state.handled).toEqual([]);
  });

  it("uses the live signing secret in live mode", async () => {
    process.env.BILLING_STRIPE_MODE = "live";
    process.env.STRIPE_SECRET_KEY = "sk_live_fixture";
    process.env.STRIPE_LIVE_WEBHOOK_SECRET = "whsec_live_fixture";
    expect((await post(payload, { "stripe-signature": sign(payload) })).status).toBe(400);
    expect((await post(payload, { "stripe-signature": sign(payload, "whsec_live_fixture") })).status).toBe(200);
    expect(state.handled).toEqual([{ id: "evt_fixture123", livemode: true }]);
  });

  it("is served only on the app host", async () => {
    const response = await POST(new Request("https://caudals.com/api/evals/v1/billing/stripe/webhook", {
      method: "POST", headers: { host: "caudals.com", "stripe-signature": sign(payload) }, body: payload,
    }));
    expect(response.status).toBe(404);
  });
});
