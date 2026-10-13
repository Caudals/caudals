/**
 * Money refunds of untouched purchases within 14 days (D-10, spec §6.10,
 * §6.13). Ledger first, then Stripe: billing.begin_top_up_refund checks the
 * policy and writes the `refund` entries that remove the order's credits
 * (audited), then the Stripe refund is created with the key refund:<order>,
 * then the order is marked refunded. If Stripe fails, the order stays
 * refund_pending with its credits removed and a retry completes it; the
 * charge.refunded webhook also completes it. Platform admins (reason
 * required, recent sign-in at the route) and service identities only.
 *
 * Refunds above €100 net need a second admin's approval (two-person rule),
 * which arrives with the ops console (L-16); until then they are refused here.
 */
import "server-only";
import type { Pool } from "pg";
import type Stripe from "stripe";
import { withTenant } from "@/lib/evals/repositories/db";
import { PaymentError, beginTopUpRefund, finishTopUpRefund, getOrder } from "./payments";
import { refundPayment } from "./stripe";

export const SINGLE_APPROVER_REFUND_MAX_NET_CENTS = 10_000;

export class RefundError extends Error {
  constructor(readonly code: "SECOND_APPROVER_REQUIRED" | "REFUND_PENDING") { super(code); this.name = "RefundError"; }
}

export async function refundTopUp(input: { orgId: string; orderId: string; reason: string; actorId: string; requestId?: string }, stripe: Stripe, pool?: Pool) {
  const scope = { orgId: input.orgId, actorId: input.actorId };
  const current = await withTenant(scope, db => getOrder(db, input.orgId, input.orderId), pool);
  if (!current) throw new PaymentError("ORDER_NOT_FOUND");
  if (current.netCents > SINGLE_APPROVER_REFUND_MAX_NET_CENTS) throw new RefundError("SECOND_APPROVER_REQUIRED");
  const pending = await withTenant(scope, db => beginTopUpRefund(db, { orgId: input.orgId, orderId: input.orderId, reason: input.reason, requestId: input.requestId }), pool);
  if (pending.status === "refunded") return pending;
  if (!pending.paymentIntentId) throw new PaymentError("ORDER_NOT_PAID");
  let refund: Stripe.Refund;
  try {
    refund = await refundPayment(stripe, pending.paymentIntentId, pending.id);
  } catch {
    console.error(JSON.stringify({ event: "billing_refund_stripe_failed", order: pending.id }));
    throw new RefundError("REFUND_PENDING");
  }
  if (refund.status === "failed" || refund.status === "canceled") {
    console.error(JSON.stringify({ event: "billing_refund_not_completed", order: pending.id, status: refund.status }));
    throw new RefundError("REFUND_PENDING");
  }
  return withTenant(scope, db => finishTopUpRefund(db, input.orgId, input.orderId, refund.id), pool);
}
