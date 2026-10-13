/**
 * Applying Stripe payments to the ledger (launch spec v2 §6.6, §6.16): one
 * code path for the webhook, the return-page sync and the auto-recharge job,
 * so the same payment reported twice (Checkout completion and
 * payment_intent.succeeded, a replayed event, a sync racing the webhook)
 * credits the order once. billing.record_purchase is idempotent under the
 * account lock; analytics events are deduplicated by the order id.
 *
 * Imported by the web app and by the evals scheduler; no email, no React.
 */
import type { Pool } from "pg";
import { withTenant } from "@/lib/evals/repositories/db";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { sanitizeAttribution } from "@/lib/analytics/events";
import { findPack } from "./packs";
import { getOrder, recordPaymentFailure, recordPurchase, stripeEventFinish, type TopUpOrder } from "./payments";

export const WEBHOOK_ACTOR = "system:stripe-webhook";
export const SYNC_ACTOR = "system:stripe-sync";

export interface PaymentFacts {
  orgId: string; orderId: string; livemode: boolean; amountCents: number; currency: string; paymentIntentId: string;
  sessionId?: string | null; customerId?: string | null;
  /** The Stripe event being processed: marked processed in the same transaction. */
  eventId?: string | null;
}

export function packLabel(order: Pick<TopUpOrder, "netCents">) {
  return findPack(order.netCents)?.id ?? `eur_${Math.round(order.netCents / 100)}`;
}

/** Credits a paid order once and records top_up_paid / auto_recharge_paid on the first time. */
export async function settlePayment(facts: PaymentFacts, actorId: string, pool?: Pool): Promise<{ order: TopUpOrder; newlyPaid: boolean }> {
  return withTenant({ orgId: facts.orgId, actorId }, async db => {
    const before = await getOrder(db, facts.orgId, facts.orderId);
    const order = await recordPurchase(db, { ...facts, sessionId: facts.sessionId ?? null, customerId: facts.customerId ?? null, eventId: facts.eventId ?? null });
    const newlyPaid = !before?.purchaseEntryId && Boolean(order.purchaseEntryId);
    if (newlyPaid) {
      await recordProductEvent({
        eventName: order.kind === "auto_recharge" ? "auto_recharge_paid" : "top_up_paid", source: "server", orgId: order.orgId,
        eventKey: order.id, payload: { pack: packLabel(order), net_amount: order.netCents / 100, first_purchase: Boolean(order.firstPaid) },
        // L-02: the first payment carries the workspace's saved first touch.
        attribution: order.firstPaid ? sanitizeAttribution(order.attribution) : undefined,
      }, db);
    }
    if (facts.eventId) await stripeEventFinish(db, facts.eventId, "processed", "purchase_recorded", facts.orgId, facts.orderId);
    return { order, newlyPaid };
  }, pool);
}

/** Records a failed payment attempt (auto-recharge: retry or switch off; checkout: stays open). */
export async function settleFailure(input: { orgId: string; orderId: string; paymentIntentId: string | null; code: string; eventId?: string | null }, actorId: string, pool?: Pool) {
  return withTenant({ orgId: input.orgId, actorId }, async db => {
    const before = await getOrder(db, input.orgId, input.orderId);
    const order = await recordPaymentFailure(db, input);
    if (order.kind === "auto_recharge" && before?.status === "pending" && order.status === "failed") {
      await recordProductEvent({
        eventName: "auto_recharge_failed", source: "server", orgId: order.orgId, eventKey: order.id,
        payload: { pack: packLabel(order), net_amount: order.netCents / 100, reason: order.failureCode ?? "payment_failed" },
      }, db);
    }
    if (input.eventId) await stripeEventFinish(db, input.eventId, "processed", "payment_failed", input.orgId, input.orderId);
    return order;
  }, pool);
}
