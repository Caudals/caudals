import { NextRequest, NextResponse } from "next/server";
import type { QueryResultRow } from "pg";
import type Stripe from "stripe";
import { queryRows } from "@/lib/db/client";
import { getStripeServer } from "@/lib/stripe/server";
import { logError, logInfo } from "@/lib/security/structured-logger";

type QueryRowsFn = typeof queryRows;
type WebhookProcessingState = "processing" | "processed" | "failed";
const PROCESSING_RETRY_AFTER_SECONDS = 10 * 60;

type WebhookEventStateRow = QueryResultRow & {
  processing_state: WebhookProcessingState;
  received_at?: string | Date;
};

type WebhookEventUpdateRow = QueryResultRow & {
  stripe_event_id: string;
};

function ensureStripeConfigured() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    throw new Error("Stripe webhook secret or API key missing");
  }

  return webhookSecret;
}

export async function reserveStripeWebhookEvent(
  event: Stripe.Event,
  queryClient: QueryRowsFn = queryRows
): Promise<{ shouldProcess: boolean; deduplicated: boolean; retrying: boolean }> {
  const payload = JSON.stringify(event);

  const insertedRows = await queryClient<WebhookEventStateRow>(
    `
      INSERT INTO stripe_webhook_event (
        stripe_event_id,
        event_type,
        processing_state,
        payload,
        received_at,
        processed_at,
        last_error
      )
      VALUES ($1, $2, 'processing', $3::jsonb, now(), NULL, NULL)
      ON CONFLICT (stripe_event_id) DO NOTHING
      RETURNING processing_state
    `,
    [event.id, event.type, payload]
  );

  if (insertedRows[0]) {
    return { shouldProcess: true, deduplicated: false, retrying: false };
  }

  const existingRows = await queryClient<WebhookEventStateRow>(
    `
      SELECT processing_state, received_at
      FROM stripe_webhook_event
      WHERE stripe_event_id = $1
      LIMIT 1
    `,
    [event.id]
  );

  const state = existingRows[0]?.processing_state;
  if (!state) {
    throw new Error(`Stripe webhook event ${event.id} disappeared during reservation`);
  }

  if (state === "processed") {
    return { shouldProcess: false, deduplicated: true, retrying: false };
  }

  const retryRows = await queryClient<WebhookEventStateRow>(
    `
      UPDATE stripe_webhook_event
      SET
        processing_state = 'processing',
        event_type = $2,
        payload = $3::jsonb,
        received_at = now(),
        processed_at = NULL,
        last_error = NULL
      WHERE stripe_event_id = $1
        AND (
          processing_state = 'failed'
          OR (
            processing_state = 'processing'
            AND received_at < now() - ($4::int * interval '1 second')
          )
        )
      RETURNING processing_state
    `,
    [event.id, event.type, payload, PROCESSING_RETRY_AFTER_SECONDS]
  );

  if (!retryRows[0]) {
    return { shouldProcess: false, deduplicated: true, retrying: false };
  }

  return { shouldProcess: true, deduplicated: false, retrying: true };
}

export async function markStripeWebhookEventProcessed(
  eventId: string,
  queryClient: QueryRowsFn = queryRows
) {
  const rows = await queryClient<WebhookEventUpdateRow>(
    `
      UPDATE stripe_webhook_event
      SET
        processing_state = 'processed',
        processed_at = now(),
        last_error = NULL
      WHERE stripe_event_id = $1
      RETURNING stripe_event_id
    `,
    [eventId]
  );

  if (!rows[0]) {
    throw new Error(`Failed to mark Stripe webhook event ${eventId} as processed`);
  }
}

export async function markStripeWebhookEventFailed(
  eventId: string,
  message: string,
  queryClient: QueryRowsFn = queryRows
) {
  try {
    await queryClient(
      `
        UPDATE stripe_webhook_event
        SET
          processing_state = 'failed',
          last_error = $2
        WHERE stripe_event_id = $1
      `,
      [eventId, message]
    );
  } catch (error) {
    logError("stripe.webhook.mark_failed_error", { eventId, error });
  }
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
