/**
 * Opening Stripe Checkout for an order (launch spec v2 §6.6, §6.14): the
 * workspace's Stripe customer (kept in line with its billing profile), the
 * 21 % IVA Tax Rate when the treatment charges it, and one hosted session per
 * order. The session collects the billing address and tax ID, saves the card
 * for auto-recharge (setup_future_usage=off_session) while the workspace has
 * none, and returns to the order's status page.
 */
import "server-only";
import type { Pool } from "pg";
import type Stripe from "stripe";
import { withTenant } from "@/lib/evals/repositories/db";
import { attachCheckoutSession, getProfile, getStripeCustomer, saveStripeCustomer, type TopUpOrder } from "./payments";
import { appBaseUrl, stripeMode } from "./payments-config";
import { createCheckoutSession, ensureCustomer, ensureSpanishVatRate, isLivemode } from "./stripe";
import { UCR_PER_CREDIT } from "./units";

export class CheckoutError extends Error {
  constructor(readonly code: "CHECKOUT_CLOSED" | "BILLING_PROFILE_REQUIRED") { super(code); this.name = "CheckoutError"; }
}

/** Sessions last 45 minutes from the order, so a retried request computes the same parameters. */
export const CHECKOUT_MINUTES = 45;

/** The workspace's Stripe customer for the current mode, created once and updated from the profile. */
export async function ensureStripeCustomer(stripe: Stripe, orgId: string, actorId: string, pool?: Pool) {
  const mode = stripeMode();
  const livemode = isLivemode(mode);
  const { profile, existing } = await withTenant({ orgId, actorId }, async db => ({
    profile: await getProfile(db, orgId), existing: await getStripeCustomer(db, orgId, livemode),
  }), pool);
  if (!profile) throw new CheckoutError("BILLING_PROFILE_REQUIRED");
  const customerId = await ensureCustomer(stripe, orgId, profile, existing?.customerId ?? null, mode);
  if (!existing) await withTenant({ orgId, actorId }, db => saveStripeCustomer(db, orgId, livemode, customerId), pool);
  return { customerId, paymentMethodId: existing?.paymentMethodId ?? null };
}

const formatCredits = (ucr: bigint, locale: "en" | "es") => new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB").format(Number(ucr / UCR_PER_CREDIT));

/** Product text on the Checkout page, in the buyer's language. */
export function checkoutText(order: Pick<TopUpOrder, "baseUcr" | "packBonusUcr" | "firstBonusUcr" | "taxTreatment">, locale: "en" | "es") {
  const bonus = order.firstBonusUcr > order.packBonusUcr ? order.firstBonusUcr : order.packBonusUcr;
  const credits = formatCredits(order.baseUcr, locale);
  const productName = locale === "es" ? `${credits} créditos de Caudals` : `${credits} Caudals credits`;
  const validity = locale === "es" ? "Válidos durante 24 meses." : "Valid for 24 months.";
  const bonusText = bonus > BigInt(0)
    ? (locale === "es" ? `Incluye ${formatCredits(bonus, locale)} créditos de bonificación. ` : `Includes ${formatCredits(bonus, locale)} bonus credits. `) : "";
  const mention = order.taxTreatment === "eu_reverse_charge"
    ? (locale === "es" ? "Inversión del sujeto pasivo: no se aplica IVA español." : "Reverse charge (Inversión del sujeto pasivo): no Spanish VAT is charged.")
    : order.taxTreatment === "non_eu_not_subject"
      ? (locale === "es" ? "Operación no sujeta: no se aplica IVA español." : "Not subject to Spanish VAT (Operación no sujeta).")
      : null;
  return { productName, productDescription: `${bonusText}${validity}`, submitMessage: mention };
}

/** The status page Stripe returns to. */
export function orderPageUrl(order: Pick<TopUpOrder, "id" | "orgId">, state?: "success" | "canceled") {
  return `${appBaseUrl()}/workspace/billing/top-ups/${order.id}?orgId=${order.orgId}${state ? `&checkout=${state}` : ""}`;
}

/**
 * A Checkout session for a pending checkout order, or the open session it
 * already has. Throws CHECKOUT_CLOSED when that session is no longer open.
 */
export async function openCheckout(stripe: Stripe, order: TopUpOrder, input: { locale: "en" | "es"; actorId: string; pool?: Pool; minutes?: number }) {
  if (order.kind !== "checkout" || order.status !== "pending") throw new CheckoutError("CHECKOUT_CLOSED");
  if (order.checkoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
    if (session.status !== "open" || !session.url) throw new CheckoutError("CHECKOUT_CLOSED");
    return { sessionId: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000) };
  }
  // Stripe allows 30 minutes to 24 hours; counted from the order so retries send identical parameters.
  const expiresAt = new Date(order.createdAt.getTime() + (input.minutes ?? CHECKOUT_MINUTES) * 60_000);
  if (expiresAt.getTime() - Date.now() < 31 * 60_000) throw new CheckoutError("CHECKOUT_CLOSED");
  const customer = await ensureStripeCustomer(stripe, order.orgId, input.actorId, input.pool);
  const taxRateId = order.taxTreatment === "es_vat" ? await ensureSpanishVatRate(stripe) : null;
  const text = checkoutText(order, input.locale);
  const session = await createCheckoutSession(stripe, {
    orgId: order.orgId, orderId: order.id, customerId: customer.customerId, locale: input.locale, netCents: order.netCents,
    treatment: order.taxTreatment, ...text, saveCard: !customer.paymentMethodId,
    successUrl: orderPageUrl(order, "success"), cancelUrl: orderPageUrl(order, "canceled"), expiresAt, taxRateId,
  });
  await withTenant({ orgId: order.orgId, actorId: input.actorId }, db => attachCheckoutSession(db, order.orgId, order.id, session.id, session.expiresAt), input.pool);
  return { sessionId: session.id, url: session.url, expiresAt: session.expiresAt };
}
