/**
 * Billing emails sent by the web app (launch spec v2 §6.12), through the
 * branded EN/ES templates of L-07 (`lib/email/templates.tsx`): the receipt
 * (`payment_receipt`, essential mail, to the billing email) for every paid
 * top-up or auto-recharge, with its fiscal lines, and `auto_recharge_failed`
 * (a billing alert, to owners) with a Checkout link when the bank asked for
 * authentication. Each send is deduplicated per order
 * through billing.claim_alert, so replays and the webhook racing the
 * return-page sync send one email.
 *
 * Test mode never emails outside Caudals: recipients other than the internal
 * address (COLLABORATION_NOTIFICATION_EMAIL) or @caudals.com are skipped.
 * The receipt follows the billing country (Spain → Spanish, else English);
 * owner alerts follow each person's email language.
 */
import "server-only";
import type { Pool, PoolClient } from "pg";
import { emailAppUrl, senderAddress } from "@/lib/email/links";
import { renderEmail, type TemplateName, type TemplateProps } from "@/lib/email/templates";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { withTenant } from "@/lib/evals/repositories/db";
import { getResendClient } from "@/lib/resend/client";
import { claimAlert, markAlertSent, type TopUpOrder } from "./payments";
import { stripeMode } from "./payments-config";
import { taxMention } from "./tax";
import { UCR_PER_CREDIT } from "./units";

type Env = Record<string, string | undefined>;
type Locale = "en" | "es";
const SENDER = "system:billing-email";

/** Test mode: only Caudals' own addresses. Live mode: anyone. */
export function billingEmailAllowed(to: string, env: Env = process.env) {
  if (stripeMode(env) === "live") return true;
  const address = to.trim().toLowerCase();
  const internal = env.COLLABORATION_NOTIFICATION_EMAIL?.trim().toLowerCase();
  return (Boolean(internal) && address === internal) || /@caudals\.com$/.test(address);
}

export function receiptLocale(order: Pick<TopUpOrder, "taxSnapshot">): Locale {
  return order.taxSnapshot.country === "ES" ? "es" : "en";
}

const whole = (ucr: bigint) => Number(ucr / UCR_PER_CREDIT);

export interface ReceiptCard { brand: string | null; last4: string | null }
export type SendResult = "sent" | "skipped" | "duplicate" | "failed";

type Recipient = { email: string; locale: Locale };

/**
 * Claims the send for the order, renders it for each recipient in their
 * language and marks it sent. `recipients` null = the billing email in the
 * billing country's language. Never throws.
 */
async function sendOnce<T extends TemplateName>(order: TopUpOrder, kind: string, template: T, props: (workspace: string) => TemplateProps[T],
  recipients: ((db: PoolClient) => Promise<Recipient[]>) | null, pool?: Pool, env: Env = process.env): Promise<SendResult> {
  const scope = { orgId: order.orgId, actorId: SENDER };
  try {
    const claimed = await withTenant(scope, async db => {
      const list = recipients ? await recipients(db) : [{ email: String(order.taxSnapshot.billing_email ?? ""), locale: receiptLocale(order) }];
      const allowed = list.filter(recipient => recipient.email && billingEmailAllowed(recipient.email, env));
      if (allowed.length < list.length || !list.length) {
        console.info(JSON.stringify({ event: "billing_email_skipped", kind, order: order.id, skipped: list.length - allowed.length, reason: list.length ? "test_mode_recipient" : "no_recipient" }));
      }
      if (!allowed.length || !(await claimAlert(db, order.orgId, kind, order.id))) return null;
      return { list: allowed, workspace: String((await db.query("SELECT billing.workspace_label($1) AS name", [order.orgId])).rows[0]?.name ?? "Caudals") };
    }, pool);
    if (!claimed) return "skipped";
    const from = getSecretEnvValue("RESEND_FROM_EMAIL");
    if (!from) throw new Error("email_unconfigured");
    for (const [index, recipient] of claimed.list.entries()) {
      const email = renderEmail(template, recipient.locale, props(claimed.workspace));
      const { error } = await getResendClient().emails.send(
        { from: senderAddress(from), to: recipient.email, subject: email.subject, text: email.text, html: email.html, tags: [{ name: "source", value: `billing-${kind.replaceAll("_", "-")}` }] },
        { idempotencyKey: `billing-${kind}:${order.id}:${index}` },
      );
      if (error) throw new Error("email_provider_rejected");
    }
    await withTenant(scope, db => markAlertSent(db, order.orgId, kind, order.id), pool);
    return "sent";
  } catch {
    console.error(JSON.stringify({ event: "billing_email_failed", kind, order: order.id }));
    return "failed";
  }
}

/** The receipt for a paid order, once. */
export function sendReceipt(order: TopUpOrder, card: ReceiptCard | null, pool?: Pool, env: Env = process.env): Promise<SendResult> {
  if (!order.purchaseEntryId || !order.paidAt) return Promise.resolve("skipped");
  const bonus = whole(order.bonusUcr ?? BigInt(0));
  return sendOnce(order, "receipt", "payment_receipt", workspace => ({
    workspace, amountCents: order.grossCents, currency: "EUR", credits: whole(order.baseUcr) + bonus, paidAt: order.paidAt!.toISOString(),
    reference: order.id, billingUrl: `${emailAppUrl(env)}/workspace/billing/top-ups/${order.id}?orgId=${order.orgId}`,
    bonusCredits: bonus, netCents: order.netCents, vatCents: order.vatCents, taxMention: taxMention(order.taxTreatment),
    card: card?.brand && card.last4 ? { brand: card.brand.charAt(0).toUpperCase() + card.brand.slice(1), last4: card.last4 } : null,
  }), null, pool, env);
}

/**
 * The auto-recharge failure, once per order, to the workspace's owners who keep
 * billing email on (L-07's recipients for billing alerts), each in their
 * language, linking to Checkout when the bank asked for authentication.
 */
export function sendAutoRechargeFailure(order: TopUpOrder, input: { checkoutUrl: string | null }, pool?: Pool, env: Env = process.env): Promise<SendResult> {
  const base = emailAppUrl(env);
  return sendOnce(order, "auto_recharge_failed", "auto_recharge_failed", workspace => ({
    workspace, amountCents: order.grossCents, currency: "EUR",
    billingUrl: input.checkoutUrl ?? `${base}/workspace/billing/top-up?orgId=${order.orgId}`,
    settingsUrl: `${base}/workspace/settings?orgId=${order.orgId}`,
  }), async db => (await db.query<{ email: string; locale: string }>("SELECT email, locale FROM evals.notification_email_recipients($1,'auto_recharge_failed')", [order.orgId]))
    .rows.map(row => ({ email: row.email, locale: row.locale === "es" ? "es" : "en" })), pool, env);
}
