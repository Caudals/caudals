import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { getStripeServer } from "@/lib/stripe/server";
import { logError, logInfo } from "@/lib/security/structured-logger";
import {
  markStripeWebhookEventFailed,
  markStripeWebhookEventProcessed,
  reserveStripeWebhookEvent,
} from "@/lib/stripe/webhook-replay-guard";

function ensureStripeConfigured() {
  const secretKey = getSecretEnvValue("STRIPE_SECRET_KEY");
  const webhookSecret = getSecretEnvValue("STRIPE_WEBHOOK_SECRET");

  if (!secretKey || !webhookSecret) {
    throw new Error("Stripe webhook secret or API key missing");
  }

  return webhookSecret;
}

export async function POST(request: NextRequest) {
  let secret: string;

  try {
    secret = ensureStripeConfigured();
  } catch (error) {
    logError("stripe.webhook.config_missing", { error });
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await request.text();
  const stripe = getStripeServer();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid webhook signature";
    logError("stripe.webhook.signature_invalid", { error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const reservation = await reserveStripeWebhookEvent(event);

    if (!reservation.shouldProcess) {
      return NextResponse.json({ received: true, deduplicated: true });
    }

    logInfo("stripe.webhook.accepted_phase_1", {
      eventId: event.id,
      eventType: event.type,
      retrying: reservation.retrying,
    });

    await markStripeWebhookEventProcessed(event.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    logError("stripe.webhook.processing_error", {
      eventId: event.id,
      eventType: event.type,
      error,
    });
    await markStripeWebhookEventFailed(event.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
