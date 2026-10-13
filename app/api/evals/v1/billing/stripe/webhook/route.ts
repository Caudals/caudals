import { isEvaluationHost } from "@/lib/evals/domain/routing";
import { stripeMode, stripeWebhookSecret } from "@/lib/billing/payments-config";
import { getStripe, isLivemode, verifyWebhookEvent } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 1_048_576;
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers });

/**
 * Stripe → Caudals (spec §6.14–§6.16). No session: Stripe authenticates with
 * the endpoint's signing secret for the configured mode
 * (STRIPE_TEST_WEBHOOK_SECRET or STRIPE_LIVE_WEBHOOK_SECRET). Processing is
 * idempotent through billing.stripe_event; 503 asks Stripe to retry.
 */
export async function POST(request: Request) {
  if (!isEvaluationHost(request.headers.get("host"))) return new Response("Not Found", { status: 404, headers });
  let secret: string;
  try {
    secret = stripeWebhookSecret();
    getStripe();
  } catch {
    // Health signal: a misconfigured endpoint must be noticed (spec L-12 risks).
    console.error(JSON.stringify({ event: "billing_webhook_unconfigured", mode: stripeMode() }));
    return reply(503, { error: "unavailable" });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) return reply(413, { error: "too_large" });
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return reply(413, { error: "too_large" });
  let event;
  try {
    event = verifyWebhookEvent(raw, request.headers.get("stripe-signature"), secret);
  } catch {
    console.error(JSON.stringify({ event: "billing_webhook_signature_failed", mode: stripeMode() }));
    return reply(400, { error: "invalid_signature" });
  }
  try {
    const result = await handleStripeEvent(event, raw, { stripe: getStripe(), livemode: isLivemode() });
    return reply(result.status, { received: result.status === 200, outcome: result.outcome });
  } catch {
    console.error(JSON.stringify({ event: "billing_webhook_unavailable", type: event.type }));
    return reply(503, { error: "unavailable" });
  }
}
