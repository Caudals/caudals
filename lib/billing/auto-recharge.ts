/**
 * Auto-recharge (launch spec v2 §6.6), run every minute by the evals
 * scheduler under its service identity. For each workspace with work to do,
 * billing.claim_auto_recharge decides under the account lock: re-arm, open
 * the next threshold crossing with an order, retry once 24 h after a failure,
 * or hand back an order in flight to resume. The saved card is charged
 * off-session with the idempotency key auto-recharge:<workspace>:<crossing>:
 * <attempt>, so a crash or a retry never charges twice, and only one
 * recharge is in flight per workspace. Outcomes go through the same
 * settlement as the webhook; the webhook then sends the receipt or the
 * failure email (with a payment link when the bank asks for authentication).
 *
 * No email and no React here: the scheduler imports this module.
 */
import type { Pool } from "pg";
import type Stripe from "stripe";
import { withTenant } from "@/lib/evals/repositories/db";
import { attachPaymentIntent, autoRechargeDue, claimAutoRecharge, getStripeCustomer, type TopUpOrder } from "./payments";
import { paymentsAccessFor } from "./payments-config";
import { settleFailure, settlePayment } from "./settlement";
import { chargeOffSession, getStripe, isLivemode, offSessionPaymentMethod, outcomeOf, type OffSessionOutcome } from "./stripe";

export interface AutoRechargeTick { workspaces: number; charged: number; succeeded: number; failed: number; pending: number }

export function autoRechargeKey(order: Pick<TopUpOrder, "orgId" | "autoRechargeCrossing" | "autoRechargeAttempt">) {
  return `auto-recharge:${order.orgId}:${order.autoRechargeCrossing}:${order.autoRechargeAttempt}`;
}

async function apply(order: TopUpOrder, outcome: OffSessionOutcome, customerId: string, actorId: string, pool: Pool | undefined, tick: AutoRechargeTick) {
  const scope = { orgId: order.orgId, actorId };
  if (outcome.status === "failed") {
    if (outcome.paymentIntentId && !order.paymentIntentId) await withTenant(scope, db => attachPaymentIntent(db, order.orgId, order.id, outcome.paymentIntentId!, customerId), pool);
    await settleFailure({ orgId: order.orgId, orderId: order.id, paymentIntentId: outcome.paymentIntentId, code: outcome.code }, actorId, pool);
    tick.failed++;
    return;
  }
  const intent = outcome.paymentIntent;
  if (!order.paymentIntentId) await withTenant(scope, db => attachPaymentIntent(db, order.orgId, order.id, intent.id, customerId), pool);
  if (outcome.status === "processing") { tick.pending++; return; }
  await settlePayment({
    orgId: order.orgId, orderId: order.id, livemode: intent.livemode, amountCents: intent.amount_received, currency: intent.currency,
    paymentIntentId: intent.id, customerId,
  }, actorId, pool);
  tick.succeeded++;
}

/** One pass over the workspaces whose auto-recharge has work to do. */
export async function runAutoRecharge(actorId: string, deps: { stripe?: Stripe; pool?: Pool; limit?: number; allowed?: (orgId: string) => boolean | Promise<boolean> } = {}): Promise<AutoRechargeTick> {
  const tick: AutoRechargeTick = { workspaces: 0, charged: 0, succeeded: 0, failed: 0, pending: 0 };
  let stripe: Stripe;
  try { stripe = deps.stripe ?? getStripe(); } catch { return tick; }
  const livemode = isLivemode();
  const due = await withTenant({ orgId: "", actorId }, db => autoRechargeDue(db, deps.limit ?? 50), deps.pool);
  for (const orgId of due) {
    // Defence in depth: a workspace taken off the test list (or payments closed) is never charged.
    if (!await (deps.allowed ?? (async id => await paymentsAccessFor(id, process.env, { requireEntity: false, actorId, pool: deps.pool }) !== "closed"))(orgId)) continue;
    tick.workspaces++;
    const scope = { orgId, actorId };
    try {
      const order = await withTenant(scope, db => claimAutoRecharge(db, orgId, livemode), deps.pool);
      if (!order) continue;
      const customer = await withTenant(scope, db => getStripeCustomer(db, orgId, livemode), deps.pool);
      if (!customer) { await settleFailure({ orgId, orderId: order.id, paymentIntentId: null, code: "no_payment_method" }, actorId, deps.pool); tick.failed++; continue; }
      if (order.paymentIntentId) {
        // In flight with a charge already made: reconcile instead of charging again.
        await apply(order, outcomeOf(await stripe.paymentIntents.retrieve(order.paymentIntentId)), customer.customerId, actorId, deps.pool, tick);
        continue;
      }
      const paymentMethodId = await offSessionPaymentMethod(stripe, customer.customerId, customer.paymentMethodId);
      if (!paymentMethodId) { await settleFailure({ orgId, orderId: order.id, paymentIntentId: null, code: "no_payment_method" }, actorId, deps.pool); tick.failed++; continue; }
      tick.charged++;
      const outcome = await chargeOffSession(stripe, {
        orgId, orderId: order.id, customerId: customer.customerId, paymentMethodId, grossCents: order.grossCents, idempotencyKey: autoRechargeKey(order),
      });
      await apply(order, outcome, customer.customerId, actorId, deps.pool, tick);
    } catch {
      // The order stays in flight; the next pass resumes it with the same idempotency key.
      console.error(JSON.stringify({ event: "billing_auto_recharge_failed", org: orgId }));
    }
  }
  return tick;
}
