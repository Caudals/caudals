/**
 * Stripe for credit top-ups (launch spec v2 §6.14): hosted Checkout, saved
 * cards for auto-recharge, the Customer Portal for payment methods, refunds
 * and signed webhooks. Card data never reaches our servers: Checkout and the
 * Portal are Stripe-hosted pages, and auto-recharge charges a saved
 * PaymentMethod by id. No Stripe Billing or Stripe Tax: our ledger holds the
 * credits and our B2B rules set the VAT (lib/billing/tax.ts), applied with a
 * plain Tax Rate.
 *
 * Every write takes an idempotency key derived from our own ids, so a retried
 * request never creates a second customer, session, charge or refund.
 */
import Stripe from "stripe";
import { stripeSecretKey, stripeMode, stripeWebhookSecret, type StripeMode } from "./payments-config";
import type { TaxTreatment } from "./tax";

export const STRIPE_API_VERSION = "2025-09-30.clover" as const;
/** The events the webhook endpoint subscribes to (§6.16). */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
] as const;

let cached: { key: string; client: Stripe } | null = null;

/** A Stripe client for the configured mode. Throws when the key is missing or of the other mode. */
export function getStripe(env: Record<string, string | undefined> = process.env): Stripe {
  const key = stripeSecretKey(env);
  if (!cached || cached.key !== key) {
    cached = { key, client: new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "caudals-billing" } }) };
  }
  return cached.client;
}

export function isLivemode(mode: StripeMode = stripeMode()) {
  return mode === "live";
}

/** Verifies the signature and parses an event (5-minute tolerance). Throws on a bad signature. */
export function verifyWebhookEvent(rawBody: string, signature: string | null, secret = stripeWebhookSecret()): Stripe.Event {
  if (!signature) throw new Error("signature_missing");
  return Stripe.webhooks.constructEvent(rawBody, signature, secret, 300);
}

export interface CustomerProfile {
  legalName: string; billingEmail: string; country: string; taxId: string; taxIdKind: "es_nif" | "eu_vat" | "non_eu_business";
  addressLine1: string; addressLine2: string | null; postalCode: string; city: string; region: string | null; version: number;
}

function customerFields(orgId: string, profile: CustomerProfile): Stripe.CustomerCreateParams {
  return {
    name: profile.legalName,
    email: profile.billingEmail,
    address: { line1: profile.addressLine1, line2: profile.addressLine2 ?? undefined, postal_code: profile.postalCode, city: profile.city, state: profile.region ?? undefined, country: profile.country },
    metadata: { org_id: orgId },
    preferred_locales: [profile.country === "ES" ? "es" : "en"],
  };
}

/** Stripe's tax ID type for our profile, when Stripe supports adding it directly. */
function stripeTaxId(profile: CustomerProfile): { type: Stripe.TaxIdCreateParams.Type; value: string } | null {
  if (profile.taxIdKind === "es_nif") return { type: "es_cif", value: profile.taxId };
  if (profile.taxIdKind === "eu_vat") return { type: "eu_vat", value: profile.taxId };
  return null;
}

/**
 * Creates the workspace's customer for this mode, or brings an existing one
 * in line with the billing profile (name, email, address, tax ID) so the
 * Checkout page and Stripe receipts show the right details.
 */
export async function ensureCustomer(stripe: Stripe, orgId: string, profile: CustomerProfile, existingId: string | null, mode: StripeMode): Promise<string> {
  const fields = customerFields(orgId, profile);
  let id = existingId;
  if (!id) {
    const customer = await stripe.customers.create(fields, { idempotencyKey: `customer:${orgId}:${mode}` });
    id = customer.id;
  } else {
    await stripe.customers.update(id, fields, { idempotencyKey: `customer-update:${orgId}:${mode}:${profile.version}` });
  }
  const taxId = stripeTaxId(profile);
  if (taxId) {
    try {
      const existing = await stripe.customers.listTaxIds(id, { limit: 20 });
      if (!existing.data.some(item => item.value?.replace(/\s/g, "").toUpperCase() === taxId.value)) {
        await stripe.customers.createTaxId(id, taxId, { idempotencyKey: `customer-tax-id:${orgId}:${mode}:${taxId.value}` });
      }
    } catch {
      // Stripe may reject a format it does not know; Checkout still collects the tax ID.
    }
  }
  return id;
}

/** The 21 % IVA Tax Rate (exclusive), created once per mode and found again by its metadata. */
export async function ensureSpanishVatRate(stripe: Stripe): Promise<string> {
  for await (const rate of stripe.taxRates.list({ active: true, limit: 100 })) {
    if (rate.metadata?.caudals_key === "es_iva_21" && rate.percentage === 21 && !rate.inclusive) return rate.id;
  }
  const rate = await stripe.taxRates.create({
    display_name: "IVA", description: "IVA 21 % (España)", percentage: 21, inclusive: false, country: "ES", jurisdiction: "ES",
    tax_type: "vat", metadata: { caudals_key: "es_iva_21" },
  }, { idempotencyKey: "tax-rate:es_iva_21:v1" });
  return rate.id;
}

/** A Customer Portal configuration limited to payment methods (fiscal details stay in Caudals). */
export async function ensurePortalConfiguration(stripe: Stripe, termsUrl: string, privacyUrl: string): Promise<string> {
  for await (const configuration of stripe.billingPortal.configurations.list({ active: true, limit: 100 })) {
    if (configuration.metadata?.caudals_key === "payment_methods_v1") return configuration.id;
  }
  const configuration = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Caudals: payment methods for credit top-ups", terms_of_service_url: termsUrl, privacy_policy_url: privacyUrl },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: false },
      customer_update: { enabled: false },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    metadata: { caudals_key: "payment_methods_v1" },
  }, { idempotencyKey: "portal-configuration:payment_methods_v1" });
  return configuration.id;
}

export interface CheckoutInput {
  orgId: string; orderId: string; customerId: string; locale: "en" | "es"; netCents: number; treatment: TaxTreatment;
  productName: string; productDescription: string | null; submitMessage: string | null; saveCard: boolean;
  successUrl: string; cancelUrl: string; expiresAt: Date; taxRateId: string | null;
}

/** A hosted Checkout session for one order (one idempotency key per order). */
export async function createCheckoutSession(stripe: Stripe, input: CheckoutInput) {
  const metadata = { org_id: input.orgId, order_id: input.orderId, kind: "top_up" };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: input.customerId,
    client_reference_id: input.orderId,
    payment_method_types: ["card"],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: input.netCents,
        product_data: { name: input.productName, ...(input.productDescription ? { description: input.productDescription } : {}), metadata: { kind: "credits" } },
      },
      ...(input.taxRateId ? { tax_rates: [input.taxRateId] } : {}),
    }],
    payment_intent_data: {
      metadata,
      description: `Caudals credits (${input.orderId})`,
      ...(input.saveCard ? { setup_future_usage: "off_session" as const } : {}),
    },
    metadata,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    locale: input.locale,
    expires_at: Math.floor(input.expiresAt.getTime() / 1000),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    ...(input.submitMessage ? { custom_text: { submit: { message: input.submitMessage } } } : {}),
  }, { idempotencyKey: `checkout-session:${input.orderId}` });
  if (!session.url) throw new Error("checkout_url_missing");
  return { id: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000) };
}

/** A Customer Portal session to manage saved cards. */
export async function createPortalSession(stripe: Stripe, customerId: string, returnUrl: string, configuration: string, locale: "en" | "es") {
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl, configuration, locale });
  return session.url;
}

/** The card to charge off-session: the customer's default, else the one saved at purchase if still attached. */
export async function offSessionPaymentMethod(stripe: Stripe, customerId: string, saved: string | null): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  const preferred = customer.invoice_settings?.default_payment_method;
  if (typeof preferred === "string") return preferred;
  if (preferred && typeof preferred === "object") return preferred.id;
  const cards = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 10 });
  if (saved && cards.data.some(card => card.id === saved)) return saved;
  return cards.data[0]?.id ?? null;
}

export type OffSessionOutcome =
  | { status: "succeeded"; paymentIntent: Stripe.PaymentIntent }
  | { status: "processing"; paymentIntent: Stripe.PaymentIntent }
  | { status: "failed"; code: string; paymentIntentId: string | null };

/** Charges the saved card for an auto-recharge order. The idempotency key is the workspace plus the threshold crossing. */
export async function chargeOffSession(stripe: Stripe, input: {
  orgId: string; orderId: string; customerId: string; paymentMethodId: string; grossCents: number; idempotencyKey: string;
}): Promise<OffSessionOutcome> {
  try {
    const intent = await stripe.paymentIntents.create({
      amount: input.grossCents, currency: "eur", customer: input.customerId, payment_method: input.paymentMethodId,
      off_session: true, confirm: true, payment_method_types: ["card"],
      description: `Caudals credits, auto-recharge (${input.orderId})`,
      metadata: { org_id: input.orgId, order_id: input.orderId, kind: "auto_recharge" },
    }, { idempotencyKey: input.idempotencyKey });
    return outcomeOf(intent);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeCardError) {
      const intent = (error.raw as { payment_intent?: { id?: string } } | undefined)?.payment_intent;
      return { status: "failed", code: error.code ?? "card_declined", paymentIntentId: intent?.id ?? null };
    }
    throw error;
  }
}

export function outcomeOf(intent: Stripe.PaymentIntent): OffSessionOutcome {
  if (intent.status === "succeeded") return { status: "succeeded", paymentIntent: intent };
  if (intent.status === "processing") return { status: "processing", paymentIntent: intent };
  const code = intent.status === "requires_action" ? "authentication_required"
    : intent.last_payment_error?.decline_code ?? intent.last_payment_error?.code ?? `payment_${intent.status}`;
  return { status: "failed", code, paymentIntentId: intent.id };
}

/** A payment intent with its latest charge, for card details and reconciliation. */
export function retrievePaymentIntent(stripe: Stripe, id: string) {
  return stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
}

/** Refunds a payment in full, once per order. */
export function refundPayment(stripe: Stripe, paymentIntentId: string, orderId: string) {
  return stripe.refunds.create({ payment_intent: paymentIntentId, reason: "requested_by_customer", metadata: { order_id: orderId } },
    { idempotencyKey: `refund:${orderId}` });
}

/** Card details of a charge, if it was a card payment. */
export function chargeCard(charge: Stripe.Charge | string | null | undefined) {
  if (!charge || typeof charge === "string") return { chargeId: typeof charge === "string" ? charge : null, brand: null, last4: null, country: null };
  const card = charge.payment_method_details?.card;
  return {
    chargeId: charge.id,
    brand: card?.brand && /^[a-z_]{2,30}$/.test(card.brand) ? card.brand : null,
    last4: card?.last4 && /^[0-9]{4}$/.test(card.last4) ? card.last4 : null,
    country: card?.country && /^[A-Z]{2}$/.test(card.country) ? card.country : null,
  };
}
