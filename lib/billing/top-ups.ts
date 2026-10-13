/**
 * Owner flows behind /api/evals/v1/billing/{packs,profile,top-ups,portal,
 * auto-recharge} (launch spec v2 §6.6, §6.12, §6.14, §6.16). Roles are
 * checked here, server-side: workspace owners act; platform admins may read
 * (audited support access). Every route answers 404 while payments are
 * closed for the workspace (lib/billing/payments-config.ts).
 */
import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { requireWorkspace } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import { checkSignupEmail } from "@/lib/evals/signup-domains";
import { recordTermsAcceptance } from "@/lib/legal/acceptance";
import { signupAcceptance } from "@/lib/legal/versions";
import { localizePathname } from "@/lib/i18n/routing";
import { buildMarketingUrl } from "@/lib/seo";
import { CheckoutError, ensureStripeCustomer, openCheckout } from "./checkout";
import { afterPayment } from "./follow-up";
import { AUTO_RECHARGE_DEFAULTS, PACKS, findPack, packCredits, purchaseBlock } from "./packs";
import {
  PaymentError, closeCheckout, createTopUpOrder, firstBonusAvailable, getAutoRecharge, getOrder, getProfile, getStripeCustomer,
  purchaseLimits, saveProfile, setAutoRecharge, type AutoRecharge, type BillingProfile, type TopUpOrder,
} from "./payments";
import { appBaseUrl, paymentsAccessFor, stripeMode, type PaymentsAccess } from "./payments-config";
import { packLabel, settlePayment, SYNC_ACTOR } from "./settlement";
import { createPortalSession, ensurePortalConfiguration, getStripe, isLivemode } from "./stripe";
import { checkTaxId, checkVies, decideTaxTreatment, grossCents, taxMention, vatCents, type ViesResult } from "./tax";
import { UCR_PER_CREDIT } from "./units";

/* ------------------------------------------------------------- access --- */

const MESSAGES: Record<string, [number, string]> = {
  BILLING_PROFILE_REQUIRED: [409, "Add your billing details before buying credits."],
  TAX_REVIEW_REQUIRED: [409, "We could not confirm your VAT number with VIES yet. Save your billing details again in a few minutes, or write to hello@caudals.com."],
  TAX_REVIEW_TERRITORY: [409, "Billing addresses in the Canary Islands, Ceuta and Melilla need a manual review. Write to hello@caudals.com."],
  PURCHASE_LIMIT: [409, "New accounts can buy up to €100 of credits in their first 30 days. Write to hello@caudals.com to raise the limit."],
  PURCHASE_RATE_LIMIT: [429, "New accounts can start up to 3 top-ups a day. Try again tomorrow."],
  ACCOUNT_FROZEN: [409, "Payments are paused for this workspace. Write to hello@caudals.com."],
  IDEMPOTENCY_CONFLICT: [409, "This request was already used for a different top-up. Start again."],
  CHECKOUT_CLOSED: [409, "This checkout has ended. Start a new top-up."],
  TAX_ID_INVALID: [422, "Check the tax ID: a Spanish NIF, an EU VAT number or your company's tax registration number."],
  COUNTRY_INVALID: [422, "Choose the country of your billing address."],
  CARD_REQUIRED: [409, "Buy credits once with a card first. Auto-recharge uses the card saved at that purchase."],
  REFUND_NOT_ALLOWED: [409, "Only an unused purchase can be refunded, within 14 days of payment."],
};

export function paymentApiError(error: unknown): never {
  const code = error instanceof PaymentError || error instanceof CheckoutError ? error.code : null;
  if (code && MESSAGES[code]) { const [status, message] = MESSAGES[code]; throw new EvalError(code, status, message); }
  if (code === "SCOPE_DENIED") throw new EvalError("SCOPE_DENIED", 404);
  if (code === "INPUT_INVALID") throw new EvalError("INPUT_INVALID", 422, "Check the supplied fields.");
  throw error;
}

/** The workspace's owner (or, to read, a platform admin), while payments are open for it. */
export async function requireBillingOwner(identity: EvalIdentity, orgId: string, intent: "read" | "write" = "write"): Promise<PaymentsAccess> {
  const access = await paymentsAccessFor(orgId, process.env, { actorId: identity.user.id });
  if (access === "closed") throw new EvalError("SCOPE_DENIED", 404);
  const role = identity.workspaces.find(workspace => workspace.id === orgId)?.role;
  const admin = identity.platformRole === "platform_admin";
  if (role !== "owner" && !(admin && intent === "read")) throw new EvalError("SCOPE_DENIED", 404);
  await requireWorkspace(identity, orgId, intent === "read" ? "read" : "manage");
  return access;
}

export function idempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!key || key.length > 200) throw new EvalError("INPUT_INVALID", 400, "Idempotency-Key required.");
  return key;
}

/** The buyer's company domain for the once-per-company first bonus: work addresses only. */
export function buyerDomain(email: string) {
  const check = checkSignupEmail(email);
  return check.kind === "work" && !check.exception ? check.domain : null;
}

const whole = (ucr: bigint) => Number(ucr / UCR_PER_CREDIT);

/* -------------------------------------------------------------- views --- */

export function profileView(profile: BillingProfile | null) {
  if (!profile) return null;
  return {
    legalName: profile.legalName, country: profile.country, taxId: profile.taxId, taxIdKind: profile.taxIdKind, viesStatus: profile.viesStatus,
    viesCheckedAt: profile.viesCheckedAt, taxTreatment: profile.taxTreatment, taxReviewReason: profile.taxReviewReason,
    taxMention: profile.taxTreatment ? taxMention(profile.taxTreatment) : null, addressLine1: profile.addressLine1, addressLine2: profile.addressLine2,
    postalCode: profile.postalCode, city: profile.city, region: profile.region, billingEmail: profile.billingEmail, updatedAt: profile.updatedAt,
  };
}

export function orderView(order: TopUpOrder) {
  const bonus = order.bonusUcr ?? (order.firstBonusUcr > order.packBonusUcr ? order.firstBonusUcr : order.packBonusUcr);
  return {
    id: order.id, kind: order.kind, status: order.status, pack: packLabel(order), netCents: order.netCents, vatCents: order.vatCents,
    grossCents: order.grossCents, taxTreatment: order.taxTreatment, taxMention: taxMention(order.taxTreatment),
    credits: whole(order.baseUcr), bonusCredits: whole(bonus), bonusKind: order.bonusKind ?? (order.firstBonusUcr > order.packBonusUcr ? "first_top_up" : order.packBonusUcr > BigInt(0) ? "pack" : null),
    failureCode: order.failureCode, createdAt: order.createdAt, paidAt: order.paidAt, refundedAt: order.refundedAt, livemode: order.livemode,
  };
}

function autoRechargeView(settings: AutoRecharge | null) {
  return settings ? {
    enabled: settings.enabled, thresholdCredits: whole(settings.thresholdUcr), pack: findPack(settings.packCents)?.id ?? null,
    monthlyMaxCount: settings.monthlyMaxCount, monthlyMaxCents: settings.monthlyMaxCents, failures: settings.failures,
    lastFailureCode: settings.lastFailureCode, disabledReason: settings.disabledReason, retryAfter: settings.retryAfter,
  } : { enabled: false, thresholdCredits: AUTO_RECHARGE_DEFAULTS.thresholdCredits, pack: findPack(AUTO_RECHARGE_DEFAULTS.packCents)?.id ?? null,
    monthlyMaxCount: AUTO_RECHARGE_DEFAULTS.monthlyMaxCount, monthlyMaxCents: AUTO_RECHARGE_DEFAULTS.monthlyMaxCents, failures: 0,
    lastFailureCode: null, disabledReason: null, retryAfter: null };
}

export function legalLinks(locale: "en" | "es") {
  return { termsUrl: buildMarketingUrl(localizePathname("/legal/terms", locale)), privacyUrl: buildMarketingUrl(localizePathname("/legal/privacy", locale)) };
}

/** GET /packs: packs with the VAT preview for the profile, the first top-up bonus, limits and settings. */
export async function billingOverview(identity: EvalIdentity, orgId: string, locale: "en" | "es") {
  const access = await requireBillingOwner(identity, orgId, "read");
  const livemode = isLivemode();
  const domain = buyerDomain(identity.user.email);
  const data = await withTenant({ orgId, actorId: identity.user.id }, async db => ({
    profile: await getProfile(db, orgId), firstTopUp: await firstBonusAvailable(db, orgId, domain), limits: await purchaseLimits(db, orgId),
    autoRecharge: await getAutoRecharge(db, orgId), customer: await getStripeCustomer(db, orgId, livemode),
    account: (await db.query("SELECT available_ucr,held_ucr,frozen_reason IS NOT NULL AS frozen FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0],
  })).catch(paymentApiError);
  const treatment = data.profile?.taxTreatment ?? null;
  return {
    access, mode: stripeMode(), profile: profileView(data.profile), firstTopUp: data.firstTopUp, limits: data.limits,
    balance: data.account ? { availableCredits: whole(BigInt(data.account.available_ucr)), heldCredits: whole(BigInt(data.account.held_ucr)), frozen: Boolean(data.account.frozen) } : null,
    packs: PACKS.map(pack => {
      const credits = packCredits(pack, data.firstTopUp);
      return {
        id: pack.id, netCents: pack.netCents, bonusPercent: pack.bonusPercent,
        vatCents: treatment ? vatCents(pack.netCents, treatment) : null, grossCents: treatment ? grossCents(pack.netCents, treatment) : null,
        credits: whole(credits.baseUcr), bonusCredits: whole(credits.bonusUcr), bonusKind: credits.bonusKind,
        blocked: purchaseBlock(data.limits, pack.netCents),
      };
    }),
    autoRecharge: autoRechargeView(data.autoRecharge),
    card: data.customer?.paymentMethodId ? { brand: data.customer.cardBrand, last4: data.customer.cardLast4 } : null,
    legal: legalLinks(locale),
  };
}

/* ------------------------------------------------------------ profile --- */

export const profileInput = z.strictObject({
  orgId: z.uuid(),
  legalName: z.string().trim().min(2).max(200),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  taxId: z.string().trim().min(3).max(40),
  addressLine1: z.string().trim().min(2).max(200),
  addressLine2: z.string().trim().max(200).nullish(),
  postalCode: z.string().trim().min(2).max(20),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).nullish(),
  billingEmail: z.email().max(254),
  // D-05: businesses only. Consumers cannot buy credits.
  businessDeclaration: z.literal(true),
});
export type ProfileBody = z.infer<typeof profileInput>;

/** Validates the tax ID, checks VIES (with retries) for EU VAT IDs and stores the profile with its treatment. */
export async function saveBillingProfile(identity: EvalIdentity, body: ProfileBody, requestId: string, vies: typeof checkVies = checkVies) {
  await requireBillingOwner(identity, body.orgId);
  const tax = checkTaxId(body.country, body.taxId);
  if (!tax.ok) throw new EvalError(tax.error, ...MESSAGES[tax.error]);
  let viesResult: ViesResult | null = null;
  if (tax.kind === "eu_vat") viesResult = await vies(tax.viesCountry!, tax.viesNumber!);
  const viesStatus = tax.kind === "eu_vat" ? viesResult!.status : "not_required";
  const decision = decideTaxTreatment({ country: body.country, kind: tax.kind, vies: viesStatus, postalCode: body.postalCode });
  const saved = await withTenant({ orgId: body.orgId, actorId: identity.user.id }, db => saveProfile(db, body.orgId, {
    legalName: body.legalName, country: body.country, taxId: tax.taxId, taxIdKind: tax.kind, viesStatus, viesConsultation: viesResult?.consultation ?? null,
    taxTreatment: decision.treatment, taxReviewReason: decision.reviewReason, addressLine1: body.addressLine1, addressLine2: body.addressLine2 || null,
    postalCode: body.postalCode, city: body.city, region: body.region || null, billingEmail: body.billingEmail,
  }, requestId)).catch(paymentApiError);
  if (viesStatus === "unavailable") console.warn(JSON.stringify({ event: "billing_vies_unavailable", org: body.orgId }));
  return profileView(saved);
}

const VIES_MAX_AGE_MS = 30 * 86_400_000;

/**
 * Before a purchase, an EU VAT ID is checked again when the last VIES answer
 * is over 30 days old or VIES was unavailable. A fresh outage keeps the last
 * definite answer; a number that is no longer valid now pays Spanish IVA.
 */
async function refreshVies(identity: EvalIdentity, orgId: string, profile: BillingProfile | null, requestId: string, vies: typeof checkVies = checkVies) {
  if (!profile || profile.taxIdKind !== "eu_vat") return profile;
  const stale = profile.viesStatus === "unavailable" || !profile.viesCheckedAt || Date.now() - profile.viesCheckedAt.getTime() > VIES_MAX_AGE_MS;
  if (!stale) return profile;
  const result = await vies(profile.taxId.slice(0, 2), profile.taxId.slice(2));
  if (result.status === "unavailable" && profile.viesStatus !== "unavailable") return profile;
  const decision = decideTaxTreatment({ country: profile.country, kind: "eu_vat", vies: result.status, postalCode: profile.postalCode });
  return withTenant({ orgId, actorId: identity.user.id }, db => saveProfile(db, orgId, {
    legalName: profile.legalName, country: profile.country, taxId: profile.taxId, taxIdKind: "eu_vat", viesStatus: result.status,
    viesConsultation: result.consultation, taxTreatment: decision.treatment, taxReviewReason: decision.reviewReason, addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2, postalCode: profile.postalCode, city: profile.city, region: profile.region, billingEmail: profile.billingEmail,
  }, requestId)).catch(paymentApiError);
}

export async function getBillingProfile(identity: EvalIdentity, orgId: string) {
  await requireBillingOwner(identity, orgId, "read");
  return profileView(await withTenant({ orgId, actorId: identity.user.id }, db => getProfile(db, orgId)));
}

/* ------------------------------------------------------------ top-ups --- */

export const topUpInput = z.strictObject({
  orgId: z.uuid(),
  pack: z.enum(PACKS.map(pack => pack.id) as [string, ...string[]]),
  // Terms of Service and Privacy, recorded with context `checkout` (L-01).
  acceptTerms: z.literal(true),
  locale: z.enum(["en", "es"]).default("en"),
});

/**
 * POST /top-ups: creates the order (amounts from the pack and the profile),
 * records the acceptance of Terms and Privacy, and opens Stripe Checkout.
 * A retry with the same Idempotency-Key returns the same order and session.
 */
export async function startTopUp(request: Request, identity: EvalIdentity, body: z.infer<typeof topUpInput>, requestId: string) {
  await requireBillingOwner(identity, body.orgId);
  const key = idempotencyKey(request);
  const pack = findPack(body.pack)!;
  const scope = { orgId: body.orgId, actorId: identity.user.id };
  const livemode = isLivemode();
  const profile = await refreshVies(identity, body.orgId, await withTenant(scope, db => getProfile(db, body.orgId)), requestId);
  if (profile?.taxReviewReason === "es_special_territory") throw new EvalError("TAX_REVIEW_REQUIRED", ...MESSAGES.TAX_REVIEW_TERRITORY);
  const created = await withTenant(scope, db => idempotent(db, scope, "billing-top-ups", key, { pack: body.pack, livemode }, async () => {
    const order = await createTopUpOrder(db, {
      orgId: body.orgId, key: `checkout:${createHash("sha256").update(`${identity.user.id}:${key}`).digest("hex")}`, netCents: pack.netCents,
      livemode, buyerDomain: buyerDomain(identity.user.email), requestId,
    });
    await recordTermsAcceptance(db, { orgId: body.orgId, documents: signupAcceptance(), context: "checkout", locale: body.locale, requestId: `checkout:${order.id}` });
    await recordProductEvent({ eventName: "top_up_started", source: "server", orgId: body.orgId, eventKey: order.id, path: "/workspace/billing",
      payload: { pack: packLabel(order), net_amount: order.netCents / 100, first_purchase: order.firstBonusUcr > BigInt(0) } }, db);
    return { orderId: order.id };
  })).catch(paymentApiError) as { orderId: string };
  const order = await withTenant(scope, db => getOrder(db, body.orgId, created.orderId));
  if (!order) throw new EvalError("SCOPE_DENIED", 404);
  if (order.status !== "pending") return { order: orderView(order), checkoutUrl: null };
  try {
    const session = await openCheckout(getStripe(), order, { locale: body.locale, actorId: identity.user.id });
    return { order: orderView(order), checkoutUrl: session.url, expiresAt: session.expiresAt };
  } catch (error) {
    if (error instanceof CheckoutError) paymentApiError(error);
    console.error(JSON.stringify({ event: "billing_checkout_failed", order: order.id, type: (error as { type?: string })?.type ?? "unknown" }));
    if (!order.checkoutSessionId) await withTenant(scope, db => closeCheckout(db, body.orgId, order.id, "canceled")).catch(() => undefined);
    throw new EvalError("SERVICE_UNAVAILABLE", 503, "Payments are temporarily unavailable. Nothing was charged. Try again in a few minutes.");
  }
}

const lastSync = new Map<string, number>();

/**
 * GET /top-ups/:id: the order's status for the return page. While a Checkout
 * order is pending it asks Stripe (at most every 3 s) and records a completed
 * payment itself, so credits arrive within seconds even if the webhook is late.
 */
export async function topUpStatus(identity: EvalIdentity, orgId: string, orderId: string) {
  await requireBillingOwner(identity, orgId, "read");
  const scope = { orgId, actorId: identity.user.id };
  let order = await withTenant(scope, db => getOrder(db, orgId, orderId));
  if (!order) throw new EvalError("SCOPE_DENIED", 404);
  const now = Date.now();
  if (order.kind === "checkout" && order.status === "pending" && order.checkoutSessionId && now - (lastSync.get(order.id) ?? 0) > 3000) {
    lastSync.set(order.id, now);
    if (lastSync.size > 1000) lastSync.clear();
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
      if (session.status === "complete" && session.payment_status === "paid" && session.payment_intent && session.amount_total !== null) {
        const { order: paid, newlyPaid } = await settlePayment({
          orgId, orderId, livemode: session.livemode, amountCents: session.amount_total, currency: session.currency ?? "",
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id, sessionId: session.id,
          customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        }, SYNC_ACTOR);
        // The webhook should have done this: a health signal for its configuration.
        if (newlyPaid) console.warn(JSON.stringify({ event: "billing_webhook_lagging", order: orderId, seconds: Math.round((now - order.createdAt.getTime()) / 1000) }));
        order = await afterPayment(paid, { stripe, actorId: SYNC_ACTOR, session });
      } else if (session.status === "expired") {
        order = await withTenant({ orgId, actorId: SYNC_ACTOR }, db => closeCheckout(db, orgId, orderId, "expired"));
      }
    } catch {
      console.error(JSON.stringify({ event: "billing_status_sync_failed", order: orderId }));
    }
  }
  return orderView(order);
}

/** POST /top-ups/:id {action: "cancel"}: the person left Checkout; the session is expired and the order closed. */
export async function cancelTopUp(identity: EvalIdentity, orgId: string, orderId: string) {
  await requireBillingOwner(identity, orgId);
  const scope = { orgId, actorId: identity.user.id };
  const order = await withTenant(scope, db => getOrder(db, orgId, orderId));
  if (!order) throw new EvalError("SCOPE_DENIED", 404);
  if (order.kind !== "checkout" || order.status !== "pending") return orderView(order);
  if (order.checkoutSessionId) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
      if (session.status === "open") await stripe.checkout.sessions.expire(order.checkoutSessionId);
      else if (session.status === "complete") return topUpStatus(identity, orgId, orderId);
    } catch {
      console.error(JSON.stringify({ event: "billing_checkout_expire_failed", order: orderId }));
      return orderView(order);
    }
  }
  return orderView(await withTenant(scope, db => closeCheckout(db, orgId, orderId, "canceled")));
}

/* ------------------------------------------------------------- portal --- */

export async function openBillingPortal(identity: EvalIdentity, orgId: string, locale: "en" | "es") {
  await requireBillingOwner(identity, orgId);
  const stripe = getStripe();
  try {
    const { customerId } = await ensureStripeCustomer(stripe, orgId, identity.user.id);
    const legal = legalLinks(locale);
    const configuration = await ensurePortalConfiguration(stripe, legal.termsUrl, legal.privacyUrl);
    return { url: await createPortalSession(stripe, customerId, `${appBaseUrl()}/workspace/billing/top-up?orgId=${orgId}`, configuration, locale) };
  } catch (error) {
    if (error instanceof CheckoutError) paymentApiError(error);
    console.error(JSON.stringify({ event: "billing_portal_failed", org: orgId }));
    throw new EvalError("SERVICE_UNAVAILABLE", 503, "Payments are temporarily unavailable. Try again in a few minutes.");
  }
}

/* ------------------------------------------------------ auto-recharge --- */

export const autoRechargeInput = z.strictObject({
  orgId: z.uuid(),
  enabled: z.boolean(),
  thresholdCredits: z.number().int().min(100).max(100_000).default(AUTO_RECHARGE_DEFAULTS.thresholdCredits),
  pack: z.enum(PACKS.map(pack => pack.id) as [string, ...string[]]).default("eur_50"),
  monthlyMaxCount: z.number().int().min(1).max(31).default(AUTO_RECHARGE_DEFAULTS.monthlyMaxCount),
  monthlyMaxEuros: z.number().int().min(20).max(10_000).default(AUTO_RECHARGE_DEFAULTS.monthlyMaxCents / 100),
});

export async function saveAutoRecharge(identity: EvalIdentity, body: z.infer<typeof autoRechargeInput>, requestId: string) {
  await requireBillingOwner(identity, body.orgId);
  const pack = findPack(body.pack)!;
  if (body.monthlyMaxEuros * 100 < pack.netCents) throw new EvalError("INPUT_INVALID", 422, "The monthly limit must cover at least one recharge.");
  const scope = { orgId: body.orgId, actorId: identity.user.id };
  return withTenant(scope, async db => {
    if (body.enabled && !(await getStripeCustomer(db, body.orgId, isLivemode()))?.paymentMethodId) throw new EvalError("CARD_REQUIRED", ...MESSAGES.CARD_REQUIRED);
    return autoRechargeView(await setAutoRecharge(db, body.orgId, {
      enabled: body.enabled, thresholdUcr: BigInt(body.thresholdCredits) * UCR_PER_CREDIT, packCents: pack.netCents,
      monthlyMaxCount: body.monthlyMaxCount, monthlyMaxCents: body.monthlyMaxEuros * 100,
    }, requestId));
  }).catch(paymentApiError);
}

export async function getAutoRechargeSettings(identity: EvalIdentity, orgId: string) {
  await requireBillingOwner(identity, orgId, "read");
  return autoRechargeView(await withTenant({ orgId, actorId: identity.user.id }, db => getAutoRecharge(db, orgId)));
}
