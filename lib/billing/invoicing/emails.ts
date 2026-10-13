/**
 * "Invoice available" (launch L-13, L-07 template `invoice_available`): once a
 * document is issued, its billing contact gets one email in the invoice's
 * language with the PDF attached. Deduplicated per document through
 * billing.claim_alert, so a replayed issue sends one email. Test mode emails
 * only Caudals' own addresses (lib/billing/emails.ts billingEmailAllowed).
 * Best effort: never throws, never undoes the issue.
 */
import "server-only";
import type { Pool } from "pg";
import { emailAppUrl, senderAddress } from "@/lib/email/links";
import { renderEmail } from "@/lib/email/templates";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { withTenant } from "@/lib/evals/repositories/db";
import { getResendClient } from "@/lib/resend/client";
import { billingEmailAllowed, type SendResult } from "../emails";
import { claimAlert, markAlertSent } from "../payments";
import type { InvoiceDocument } from "./index";

type Env = Record<string, string | undefined>;
const SENDER = "system:billing-email";
const KIND = "invoice_available";

export async function sendInvoiceAvailable(document: InvoiceDocument, pdf: Uint8Array | null, pool?: Pool, env: Env = process.env): Promise<SendResult> {
  if (document.status !== "issued" || !document.number || !document.issueDate) return "skipped";
  const to = document.customer.billingEmail;
  if (!to || !billingEmailAllowed(to, env)) {
    console.info(JSON.stringify({ event: "billing_email_skipped", kind: KIND, document: document.id, reason: to ? "test_mode_recipient" : "no_recipient" }));
    return "skipped";
  }
  const scope = { orgId: document.orgId, actorId: SENDER };
  try {
    const workspace = await withTenant(scope, async db => {
      if (!(await claimAlert(db, document.orgId, KIND, document.id))) return null;
      return String((await db.query("SELECT billing.workspace_label($1) AS name", [document.orgId])).rows[0]?.name ?? "Caudals");
    }, pool);
    if (workspace === null) return "duplicate";
    const from = getSecretEnvValue("RESEND_FROM_EMAIL");
    if (!from) throw new Error("email_unconfigured");
    const email = renderEmail("invoice_available", document.locale, {
      workspace, kind: document.kind, number: document.number, issueDate: document.issueDate, totalCents: document.grossCents, currency: "EUR",
      originalNumber: document.original?.number ?? null,
      billingUrl: `${emailAppUrl(env)}/workspace/billing/top-ups/${document.orderId}?orgId=${document.orgId}`,
    });
    const { error } = await getResendClient().emails.send({
      from: senderAddress(from), to, subject: email.subject, text: email.text, html: email.html,
      tags: [{ name: "source", value: "billing-invoice-available" }],
      ...(pdf ? { attachments: [{ filename: `${document.number.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`, content: Buffer.from(pdf) }] } : {}),
    }, { idempotencyKey: `billing-${KIND}:${document.id}` });
    if (error) throw new Error("email_provider_rejected");
    await withTenant(scope, db => markAlertSent(db, document.orgId, KIND, document.id), pool);
    return "sent";
  } catch {
    console.error(JSON.stringify({ event: "billing_email_failed", kind: KIND, document: document.id }));
    return "failed";
  }
}
