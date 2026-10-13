/**
 * What happens after a payment is recorded (web app only): card details and
 * risk flags from Stripe, the saved card made the customer's default, and the
 * receipt; after an auto-recharge failure, the email to the owner with a
 * Checkout link when the bank asked for authentication (§6.6). Every step is
 * idempotent and best effort: it never undoes or blocks the ledger write.
 */
import "server-only";
import type { Pool } from "pg";
import type Stripe from "stripe";
import { withTenant } from "@/lib/evals/repositories/db";
import { CheckoutError, openCheckout } from "./checkout";
import { sendAutoRechargeFailure, sendReceipt, receiptLocale } from "./emails";
import { createTopUpOrder, recordPaymentDetails, type TopUpOrder } from "./payments";
import { chargeCard, isLivemode, retrievePaymentIntent } from "./stripe";
import { resumeAfterCredits } from "./settlement";
import { normalizeTaxId } from "./tax";

/** Tax IDs entered at Checkout, normalised, with and without an "ES" prefix. */
export function checkoutTaxIds(session: Stripe.Checkout.Session | null | undefined): string[] | null {
  const values = session?.customer_details?.tax_ids?.map(item => normalizeTaxId(item.value ?? "")).filter(Boolean) ?? [];
  if (!values.length) return null;
  return [...new Set(values.flatMap(value => (value.startsWith("ES") ? [value, value.slice(2)] : [value])))];
}

export async function afterPayment(order: TopUpOrder, context: { stripe: Stripe; actorId: string; pool?: Pool; session?: Stripe.Checkout.Session | null }) {
  let current = order;
  let card: { brand: string | null; last4: string | null } | null = null;
  try {
    if (order.paymentIntentId) {
      const intent = await retrievePaymentIntent(context.stripe, order.paymentIntentId);
      const details = chargeCard(intent.latest_charge);
      const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id ?? null;
      const saveCard = order.kind === "checkout" && intent.setup_future_usage === "off_session" && Boolean(paymentMethodId);
      current = await withTenant({ orgId: order.orgId, actorId: context.actorId }, db => recordPaymentDetails(db, {
        orgId: order.orgId, orderId: order.id, chargeId: details.chargeId, paymentMethodId, cardBrand: details.brand, cardLast4: details.last4,
        cardCountry: details.country, saveCard,
        checkoutCountry: context.session?.customer_details?.address?.country ?? null, checkoutTaxIds: checkoutTaxIds(context.session),
      }), context.pool);
      if (saveCard && order.customerId && paymentMethodId) {
        await context.stripe.customers.update(order.customerId, { invoice_settings: { default_payment_method: paymentMethodId } },
          { idempotencyKey: `default-payment-method:${order.id}` });
      }
      card = { brand: details.brand, last4: details.last4 };
    }
  } catch {
    console.error(JSON.stringify({ event: "billing_payment_details_failed", order: order.id }));
  }
  // Runs paused for credits continue (L-15); then the receipt.
  if (current.purchaseEntryId) await resumeAfterCredits(current.orgId, context.actorId, context.pool);
  await sendReceipt(current, card, context.pool);
  return current;
}

/** After an auto-recharge charge failed: a Checkout link when authentication is needed, and one email. */
export async function afterAutoRechargeFailure(order: TopUpOrder, context: { stripe: Stripe; actorId: string; pool?: Pool }) {
  if (order.kind !== "auto_recharge" || order.status !== "failed") return;
  let checkoutUrl: string | null = null;
  if (order.failureCode === "authentication_required") {
    try {
      const recovery = await withTenant({ orgId: order.orgId, actorId: context.actorId }, db => createTopUpOrder(db, {
        orgId: order.orgId, key: `auto-recharge-recovery:${order.id}`, netCents: order.netCents, livemode: isLivemode(), buyerDomain: null,
      }), context.pool);
      if (recovery.status === "pending") {
        checkoutUrl = (await openCheckout(context.stripe, recovery, { locale: receiptLocale(order), actorId: context.actorId, pool: context.pool, minutes: 24 * 60 })).url;
      }
    } catch (error) {
      if (!(error instanceof CheckoutError)) console.error(JSON.stringify({ event: "billing_recovery_checkout_failed", order: order.id }));
    }
  }
  await sendAutoRechargeFailure(order, { checkoutUrl }, context.pool);
}
