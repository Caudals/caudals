/**
 * Stripe webhook processing (launch spec v2 §6.14–§6.16). The route verifies
 * the signature; this module makes processing idempotent and order-safe:
 *
 * 1. billing.stripe_event records the delivery (event id primary key). A
 *    processed or ignored event answers 200 again without doing anything.
 * 2. The order is found by our metadata or its Stripe ids (never trusting
 *    the workspace in the metadata), falling back to the PaymentIntent's
 *    metadata from the Stripe API when the event outruns our own records.
 * 3. The change is applied by an idempotent database function in a
 *    transaction scoped to the order's workspace, and the event is marked
 *    processed in the same transaction.
 * 4. Follow-up (card details, receipt, failure email) runs after commit and
 *    is idempotent itself.
 *
 * Out of order: a refund or dispute that arrives before the payment event
 * first reconciles the payment from Stripe (the PaymentIntent is the source
 * of truth); if it is not paid yet the event fails with 503 and Stripe
 * retries it. A failure reported after a success changes nothing. A failed
 * event answers 503 so Stripe redelivers it.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type Stripe from "stripe";
import { withTenant } from "@/lib/evals/repositories/db";
import { captureServerError } from "@/lib/observability/capture";
import { afterAutoRechargeFailure, afterPayment } from "./follow-up";
import {
  PaymentError, closeCheckout, findTopUpOrder, getOrder, recordChargeRefunded, recordDispute, stripeEventBegin, stripeEventFinish,
  type TopUpOrder,
} from "./payments";
import { settleFailure, settlePayment, WEBHOOK_ACTOR } from "./settlement";
import { retrievePaymentIntent } from "./stripe";

export type WebhookOutcome = { status: 200 | 400 | 503; outcome: string };
export interface WebhookContext { stripe: Stripe; livemode: boolean; pool?: Pool }

type Target = { orgId: string; orderId: string; status: string; livemode: boolean };
const PAID = new Set(["paid", "refund_pending", "refunded", "disputed", "charged_back"]);
const id = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);
const scope = (orgId: string) => ({ orgId, actorId: WEBHOOK_ACTOR });

function outcomeCode(error: unknown) {
  if (error instanceof PaymentError) return error.code.toLowerCase();
  const code = (error as { code?: unknown; type?: unknown })?.type;
  return typeof code === "string" && /^Stripe[A-Za-z]+$/.test(code) ? code.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`).replace(/^_/, "") : "processing_error";
}

async function finish(ctx: WebhookContext, eventId: string, status: "processed" | "ignored" | "failed", outcome: string, target?: Target | null) {
  await withTenant({ orgId: target?.orgId ?? "", actorId: WEBHOOK_ACTOR }, db => stripeEventFinish(db, eventId, status, outcome, target?.orgId, target?.orderId), ctx.pool);
}

async function locate(ctx: WebhookContext, ids: { orderId?: string | null; sessionId?: string | null; paymentIntentId?: string | null; chargeId?: string | null }): Promise<Target | null> {
  const lookup = (input: typeof ids) => withTenant({ orgId: "", actorId: WEBHOOK_ACTOR }, db => findTopUpOrder(db, input), ctx.pool);
  const found = await lookup(ids);
  if (found || !ids.paymentIntentId || ids.orderId) return found;
  // The payment event may not have reached us yet: the PaymentIntent carries our order id.
  let intent: Stripe.PaymentIntent;
  try {
    intent = await ctx.stripe.paymentIntents.retrieve(ids.paymentIntentId);
  } catch (error) {
    // Not an object this account knows (another integration's event): nothing of ours.
    if ((error as { type?: string })?.type === "StripeInvalidRequestError") return null;
    throw error;
  }
  return intent.metadata?.order_id ? lookup({ orderId: intent.metadata.order_id }) : null;
}

async function loadOrder(ctx: WebhookContext, target: Target) {
  const order = await withTenant(scope(target.orgId), db => getOrder(db, target.orgId, target.orderId), ctx.pool);
  if (!order) throw new PaymentError("ORDER_NOT_FOUND");
  return order;
}

/** Makes sure a payment Stripe reports as succeeded is in the ledger before a refund or dispute is applied. */
async function ensurePaid(ctx: WebhookContext, target: Target, paymentIntentId: string | null): Promise<TopUpOrder> {
  const order = await loadOrder(ctx, target);
  if (PAID.has(order.status)) return order;
  const intentId = paymentIntentId ?? order.paymentIntentId;
  if (!intentId) throw new PaymentError("ORDER_NOT_PAID");
  const intent = await retrievePaymentIntent(ctx.stripe, intentId);
  if (intent.status !== "succeeded") throw new PaymentError("ORDER_NOT_PAID");
  const { order: paid } = await settlePayment({
    orgId: target.orgId, orderId: target.orderId, livemode: intent.livemode, amountCents: intent.amount_received, currency: intent.currency,
    paymentIntentId: intent.id, customerId: id(intent.customer),
  }, WEBHOOK_ACTOR, ctx.pool);
  await afterPayment(paid, { stripe: ctx.stripe, actorId: WEBHOOK_ACTOR, pool: ctx.pool });
  return paid;
}

export async function handleStripeEvent(event: Stripe.Event, rawBody: string, ctx: WebhookContext): Promise<WebhookOutcome> {
  if (event.livemode !== ctx.livemode) {
    console.error(JSON.stringify({ event: "billing_webhook_mode_mismatch", type: event.type }));
    return { status: 400, outcome: "mode_mismatch" };
  }
  const object = event.data.object as { id?: string };
  const begun = await withTenant({ orgId: "", actorId: WEBHOOK_ACTOR }, db => stripeEventBegin(db, {
    id: event.id, type: event.type, livemode: event.livemode, apiVersion: event.api_version ?? null, objectId: typeof object.id === "string" ? object.id : null,
    payloadSha256: createHash("sha256").update(rawBody).digest("hex"), created: new Date(event.created * 1000),
  }), ctx.pool);
  if (begun.status === "processed" || begun.status === "ignored") return { status: 200, outcome: "replay" };
  let target: Target | null = null;
  try {
    const result = await dispatch(event, ctx, found => { target = found; });
    return { status: 200, outcome: result };
  } catch (error) {
    const outcome = outcomeCode(error);
    try { await finish(ctx, event.id, "failed", outcome, target); } catch { /* the delivery stays 'received'; Stripe retries */ }
    // A permanent mismatch is recorded for ops (status failed) and acknowledged;
    // anything that can succeed later (not paid yet, database or Stripe errors) is retried by Stripe.
    const permanent = error instanceof PaymentError && ["PAYMENT_MISMATCH", "ORDER_NOT_FOUND", "INPUT_INVALID", "IDEMPOTENCY_CONFLICT"].includes(error.code);
    const databaseCode = typeof (error as { code?: unknown })?.code === "string" && /^[0-9A-Z]{5}$/.test((error as { code: string }).code) ? (error as { code: string }).code : undefined;
    console.error(JSON.stringify({ event: "billing_webhook_failed", type: event.type, outcome, permanent, database_code: databaseCode }));
    if (!(error instanceof PaymentError)) captureServerError(error, { route: "stripe_webhook", type: event.type, outcome, database_code: databaseCode });
    return { status: permanent ? 200 : 503, outcome };
  }
}

async function dispatch(event: Stripe.Event, ctx: WebhookContext, setTarget: (target: Target | null) => void): Promise<string> {
  const ignore = async (outcome: string, target?: Target | null) => { await finish(ctx, event.id, "ignored", outcome, target); return outcome; };
  const located = async (ids: Parameters<typeof locate>[1]) => {
    const target = await locate(ctx, ids);
    setTarget(target);
    return target && target.livemode === event.livemode ? target : null;
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "payment" || session.metadata?.kind !== "top_up") return ignore("not_a_top_up");
      const target = await located({ orderId: session.metadata?.order_id, sessionId: session.id });
      if (!target) return ignore("unknown_order");
      if (session.payment_status !== "paid" || !session.payment_intent || session.amount_total === null) return ignore("not_paid", target);
      const { order } = await settlePayment({
        orgId: target.orgId, orderId: target.orderId, livemode: session.livemode, amountCents: session.amount_total, currency: session.currency ?? "",
        paymentIntentId: id(session.payment_intent)!, sessionId: session.id, customerId: id(session.customer), eventId: event.id,
      }, WEBHOOK_ACTOR, ctx.pool);
      await afterPayment(order, { stripe: ctx.stripe, actorId: WEBHOOK_ACTOR, pool: ctx.pool, session });
      return "purchase_recorded";
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      const target = await located({ orderId: session.metadata?.order_id, sessionId: session.id });
      if (!target) return ignore("unknown_order");
      await withTenant(scope(target.orgId), async db => {
        await closeCheckout(db, target.orgId, target.orderId, "expired");
        await stripeEventFinish(db, event.id, "processed", "checkout_expired", target.orgId, target.orderId);
      }, ctx.pool);
      return "checkout_expired";
    }
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const target = await located({ orderId: intent.metadata?.order_id, paymentIntentId: intent.id });
      if (!target) return ignore("unknown_order");
      const { order } = await settlePayment({
        orgId: target.orgId, orderId: target.orderId, livemode: intent.livemode, amountCents: intent.amount_received, currency: intent.currency,
        paymentIntentId: intent.id, customerId: id(intent.customer), eventId: event.id,
      }, WEBHOOK_ACTOR, ctx.pool);
      await afterPayment(order, { stripe: ctx.stripe, actorId: WEBHOOK_ACTOR, pool: ctx.pool });
      return "purchase_recorded";
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      const target = await located({ orderId: intent.metadata?.order_id, paymentIntentId: intent.id });
      if (!target) return ignore("unknown_order");
      const error = intent.last_payment_error;
      const code = intent.status === "requires_action" ? "authentication_required" : error?.decline_code ?? error?.code ?? "payment_failed";
      const order = await settleFailure({ orgId: target.orgId, orderId: target.orderId, paymentIntentId: intent.id, code, eventId: event.id }, WEBHOOK_ACTOR, ctx.pool);
      await afterAutoRechargeFailure(order, { stripe: ctx.stripe, actorId: WEBHOOK_ACTOR, pool: ctx.pool });
      return "payment_failed";
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const target = await located({ paymentIntentId: id(charge.payment_intent), chargeId: charge.id });
      if (!target) return ignore("unknown_order");
      await ensurePaid(ctx, target, id(charge.payment_intent));
      const refundId = charge.refunds?.data?.[0]?.id ?? null;
      await withTenant(scope(target.orgId), async db => {
        await recordChargeRefunded(db, { orgId: target.orgId, orderId: target.orderId, refundId, amountRefundedCents: charge.amount_refunded, eventId: event.id });
        await stripeEventFinish(db, event.id, "processed", "refund_recorded", target.orgId, target.orderId);
      }, ctx.pool);
      return "refund_recorded";
    }
    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const dispute = event.data.object;
      const target = await located({ paymentIntentId: id(dispute.payment_intent), chargeId: id(dispute.charge) });
      if (!target) return ignore("unknown_order");
      await ensurePaid(ctx, target, id(dispute.payment_intent));
      await withTenant(scope(target.orgId), async db => {
        await recordDispute(db, { orgId: target.orgId, orderId: target.orderId, disputeId: dispute.id, status: dispute.status, eventId: event.id });
        await stripeEventFinish(db, event.id, "processed", event.type === "charge.dispute.created" ? "dispute_opened" : "dispute_closed", target.orgId, target.orderId);
      }, ctx.pool);
      console.error(JSON.stringify({ event: "billing_dispute", type: event.type, status: dispute.status, org: target.orgId, order: target.orderId }));
      return event.type === "charge.dispute.created" ? "dispute_opened" : "dispute_closed";
    }
    default:
      return ignore("unhandled_type");
  }
}
