import { emailCopy, fill, type EmailCopy, type EmailLocale } from "./copy";
import { EmailLayout, renderEmailText, type EmailBlock, type EmailCategory, type EmailContent } from "./layout";
import { renderEmailDocument } from "./render";

/**
 * Every Caudals email (launch L-07, spec v2 P-37/P-38) as one typed catalogue:
 * a template name, its props and its category. Categories decide the footer:
 * essential mail (sign-up, password reset, invitation, receipts) has none to
 * switch off; workspace notifications and billing alerts link to the email
 * settings; lifecycle mail carries an unsubscribe link and the RFC 8058
 * one-click headers. Callers pass absolute URLs.
 */

export type Unsubscribe = { pageUrl: string; oneClickUrl: string };
type Notice = { url: string; settingsUrl: string };

export type TemplateProps = {
  signup_link: { link: string; source: "demo" | "direct"; demo?: { host: string; correct?: number | null; scored?: number | null } };
  signup_existing: { signInUrl: string };
  signup_domain_taken: { domain: string };
  password_reset: { url: string; minutes: number };
  invitation: { url: string; workspace: string; inviter: string; role: "owner" | "editor" | "viewer"; hours: number };
  test_set_ready: Notice;
  report_published: Notice & { updated?: boolean };
  run_failed: Notice;
  input_required: Notice;
  export_failed: Notice;
  generation_failed: Notice;
  website_failed: Notice;
  document_failed: Notice;
  welcome: { name?: string | null; workspace: string; workspaceUrl: string; unsubscribe: Unsubscribe };
  d1_test_set: { workspaceUrl: string; callUrl: string; unsubscribe: Unsubscribe };
  d3_run: { workspaceUrl: string; hasTestSet: boolean; unsubscribe: Unsubscribe };
  d7_report: { workspaceUrl: string; callUrl: string; unsubscribe: Unsubscribe };
  first_report: { reportsUrl: string; callUrl: string; unsubscribe: Unsubscribe };
  d21_rerun: { workspaceUrl: string; unsubscribe: Unsubscribe };
  d30_winback: { workspace: string; workspaceUrl: string; callUrl: string; unsubscribe: Unsubscribe };
  payment_receipt: {
    workspace: string; amountCents: number; currency: string; credits: number; paidAt: string; reference?: string | null; billingUrl: string;
    /** Fiscal lines of a credit top-up (L-12): bonus included in `credits`, net, IVA or the legal mention, and the card. */
    bonusCredits?: number; netCents?: number; vatCents?: number; taxMention?: string | null; card?: { brand: string; last4: string } | null;
  };
  /** An issued invoice or rectifying invoice (L-13), sent to the billing contact with the PDF attached. */
  invoice_available: {
    workspace: string; kind: "invoice" | "credit_note"; number: string; issueDate: string; totalCents: number; currency: string;
    originalNumber?: string | null; billingUrl: string;
  };
  low_balance: { workspace: string; balance: number; threshold: number; topUpUrl: string; settingsUrl: string };
  auto_recharge_succeeded: { workspace: string; amountCents: number; currency: string; credits: number; threshold: number; balance: number; billingUrl: string; settingsUrl: string };
  auto_recharge_failed: { workspace: string; amountCents: number; currency: string; billingUrl: string; settingsUrl: string };
  credits_expiring: { workspace: string; credits: number; expiresAt: string; workspaceUrl: string; settingsUrl: string };
  cap_reached: { workspace: string; cap: number; percent: 50 | 80 | 100; scope: "monthly" | "run" | "schedule"; limitsUrl: string; settingsUrl: string };
  /** The public demo's report email (L-03), with its own localized lines. */
  demo_report: { subject: string; heading: string; lines: string[]; url: string; failed: boolean; footer: string };
};

export type TemplateName = keyof TemplateProps;

export const TEMPLATE_CATEGORY: Record<TemplateName, EmailCategory> = {
  signup_link: "essential", signup_existing: "essential", signup_domain_taken: "essential", password_reset: "essential",
  invitation: "essential", payment_receipt: "essential", invoice_available: "essential", demo_report: "essential",
  test_set_ready: "notification", report_published: "notification", run_failed: "notification", input_required: "notification",
  export_failed: "notification", generation_failed: "notification", website_failed: "notification", document_failed: "notification",
  low_balance: "billing", auto_recharge_succeeded: "billing", auto_recharge_failed: "billing", credits_expiring: "billing", cap_reached: "billing",
  welcome: "lifecycle", d1_test_set: "lifecycle", d3_run: "lifecycle", d7_report: "lifecycle", first_report: "lifecycle",
  d21_rerun: "lifecycle", d30_winback: "lifecycle",
};

const intlLocale = (locale: EmailLocale) => (locale === "es" ? "es-ES" : "en-GB");
const number = (locale: EmailLocale, value: number) => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
const money = (locale: EmailLocale, cents: number, currency: string) =>
  new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency }).format(cents / 100);
const date = (locale: EmailLocale, iso: string) =>
  new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(iso));

type Draft = { subject: string; preview: string; heading: string; blocks: EmailBlock[]; footer?: string[]; footerLink?: { label: string; url: string } };

function noticeDraft(c: EmailCopy, key: "testSetReady" | "runFailed" | "inputRequired" | "exportFailed" | "generationFailed" | "websiteFailed" | "documentFailed", props: Notice): Draft {
  const copy = c[key];
  return {
    subject: copy.subject, preview: copy.preview, heading: copy.heading,
    blocks: [{ kind: "text", text: copy.body }, { kind: "action", label: copy.action, url: props.url }],
    footer: [c.footer.notification], footerLink: { label: c.footer.notificationLink, url: props.settingsUrl },
  };
}

const lifecycleFooter = (c: EmailCopy, unsubscribe: Unsubscribe) => ({ footer: [c.footer.lifecycle], footerLink: { label: c.footer.unsubscribe, url: unsubscribe.pageUrl } });
const billingFooter = (c: EmailCopy, workspace: string, settingsUrl: string) => ({
  footer: [fill(c.footer.billing, { workspace })], footerLink: { label: c.footer.notificationLink, url: settingsUrl },
});

function draft<T extends TemplateName>(name: T, c: EmailCopy, locale: EmailLocale, p: TemplateProps[T]): Draft {
  switch (name) {
    case "signup_link": {
      const props = p as TemplateProps["signup_link"];
      const blocks: EmailBlock[] = [];
      if (props.source === "demo" && props.demo) {
        const { host, correct, scored } = props.demo;
        blocks.push({ kind: "text", tone: "lead", text: scored ? fill(c.signupLink.score, { host, correct: correct ?? 0, scored }) : fill(c.signupLink.scoreNone, { host }) });
      }
      blocks.push(
        { kind: "text", text: props.source === "demo" ? c.signupLink.bodyDemo : c.signupLink.bodyDirect },
        { kind: "action", label: c.signupLink.action, url: props.link, showUrl: true },
        { kind: "text", tone: "muted", text: c.signupLink.expiry },
      );
      return { subject: props.source === "demo" ? c.signupLink.subjectDemo : c.signupLink.subjectDirect, preview: c.signupLink.preview, heading: c.signupLink.heading, blocks };
    }
    case "signup_existing": {
      const props = p as TemplateProps["signup_existing"];
      return {
        subject: c.signupExisting.subject, preview: c.signupExisting.preview, heading: c.signupExisting.heading,
        blocks: [{ kind: "text", text: c.signupExisting.body }, { kind: "action", label: c.signupExisting.action, url: props.signInUrl }, { kind: "text", tone: "muted", text: c.common.ignore }],
      };
    }
    case "signup_domain_taken": {
      const props = p as TemplateProps["signup_domain_taken"];
      return {
        subject: c.signupDomainTaken.subject, preview: c.signupDomainTaken.preview, heading: c.signupDomainTaken.heading,
        blocks: [{ kind: "text", text: fill(c.signupDomainTaken.body, { domain: props.domain }) }, { kind: "text", text: c.signupDomainTaken.next }, { kind: "text", tone: "muted", text: c.common.ignore }],
      };
    }
    case "password_reset": {
      const props = p as TemplateProps["password_reset"];
      return {
        subject: c.passwordReset.subject, preview: c.passwordReset.preview, heading: c.passwordReset.heading,
        blocks: [
          { kind: "text", text: c.passwordReset.body },
          { kind: "action", label: c.passwordReset.action, url: props.url, showUrl: true },
          { kind: "text", tone: "muted", text: fill(c.passwordReset.expiry, { minutes: props.minutes }) },
        ],
      };
    }
    case "invitation": {
      const props = p as TemplateProps["invitation"];
      const role = props.role === "owner" ? c.invitation.roleOwner : props.role === "editor" ? c.invitation.roleEditor : c.invitation.roleViewer;
      const values = { inviter: props.inviter, workspace: props.workspace, role };
      return {
        subject: fill(c.invitation.subject, values), preview: c.invitation.preview, heading: fill(c.invitation.heading, values),
        blocks: [
          { kind: "text", text: fill(c.invitation.body, values) },
          { kind: "action", label: c.invitation.action, url: props.url, showUrl: true },
          { kind: "text", tone: "muted", text: fill(c.invitation.expiry, { hours: props.hours }) },
        ],
      };
    }
    case "test_set_ready": return noticeDraft(c, "testSetReady", p as Notice);
    case "run_failed": return noticeDraft(c, "runFailed", p as Notice);
    case "input_required": return noticeDraft(c, "inputRequired", p as Notice);
    case "export_failed": return noticeDraft(c, "exportFailed", p as Notice);
    case "generation_failed": return noticeDraft(c, "generationFailed", p as Notice);
    case "website_failed": return noticeDraft(c, "websiteFailed", p as Notice);
    case "document_failed": return noticeDraft(c, "documentFailed", p as Notice);
    case "report_published": {
      const props = p as TemplateProps["report_published"];
      const r = c.resultsReady;
      return {
        subject: props.updated ? r.subjectUpdated : r.subject, preview: r.preview, heading: props.updated ? r.headingUpdated : r.heading,
        blocks: [{ kind: "text", text: props.updated ? r.bodyUpdated : r.body }, { kind: "action", label: r.action, url: props.url }],
        footer: [c.footer.notification], footerLink: { label: c.footer.notificationLink, url: props.settingsUrl },
      };
    }
    case "welcome": {
      const props = p as TemplateProps["welcome"];
      const name = props.name?.trim().split(/\s+/)[0];
      return {
        subject: c.welcome.subject, preview: c.welcome.preview, heading: name ? fill(c.welcome.headingNamed, { name }) : c.welcome.heading,
        blocks: [
          { kind: "text", text: fill(c.welcome.body, { workspace: props.workspace }) },
          { kind: "steps", items: [c.welcome.step1, c.welcome.step2, c.welcome.step3] },
          { kind: "action", label: c.welcome.action, url: props.workspaceUrl },
          { kind: "text", tone: "muted", text: c.common.help },
        ],
        ...lifecycleFooter(c, props.unsubscribe),
      };
    }
    case "d1_test_set": {
      const props = p as TemplateProps["d1_test_set"];
      return {
        subject: c.d1TestSet.subject, preview: c.d1TestSet.preview, heading: c.d1TestSet.heading,
        blocks: [
          { kind: "text", text: c.d1TestSet.body }, { kind: "text", text: c.d1TestSet.bodyMissing },
          { kind: "action", label: c.d1TestSet.action, url: props.workspaceUrl },
          { kind: "text", tone: "muted", text: c.d1TestSet.help }, { kind: "link", label: c.common.bookCall, url: props.callUrl },
        ],
        ...lifecycleFooter(c, props.unsubscribe),
      };
    }
    case "d3_run": {
      const props = p as TemplateProps["d3_run"];
      return {
        subject: c.d3Run.subject, preview: c.d3Run.preview, heading: c.d3Run.heading,
        blocks: [
          { kind: "text", text: c.d3Run.body }, { kind: "text", text: props.hasTestSet ? c.d3Run.bodyReady : c.d3Run.bodyNotReady },
          { kind: "action", label: c.d3Run.action, url: props.workspaceUrl }, { kind: "text", tone: "muted", text: c.common.help },
        ],
        ...lifecycleFooter(c, props.unsubscribe),
      };
    }
    case "d7_report": {
      const props = p as TemplateProps["d7_report"];
      return {
        subject: c.d7Report.subject, preview: c.d7Report.preview, heading: c.d7Report.heading,
        blocks: [
          { kind: "text", text: c.d7Report.body }, { kind: "action", label: c.d7Report.action, url: props.callUrl },
          { kind: "link", label: c.d7Report.secondary, url: props.workspaceUrl },
        ],
        ...lifecycleFooter(c, props.unsubscribe),
      };
    }
    case "first_report": {
      const props = p as TemplateProps["first_report"];
      return {
        subject: c.firstReport.subject, preview: c.firstReport.preview, heading: c.firstReport.heading,
        blocks: [
          { kind: "text", text: c.firstReport.body }, { kind: "action", label: c.firstReport.action, url: props.reportsUrl },
          { kind: "text", text: c.firstReport.readout }, { kind: "link", label: c.firstReport.secondary, url: props.callUrl },
        ],
        ...lifecycleFooter(c, props.unsubscribe),
      };
    }
    case "d21_rerun": {
      const props = p as TemplateProps["d21_rerun"];
      return {
        subject: c.d21Rerun.subject, preview: c.d21Rerun.preview, heading: c.d21Rerun.heading,
        blocks: [{ kind: "text", text: c.d21Rerun.body }, { kind: "action", label: c.d21Rerun.action, url: props.workspaceUrl }, { kind: "text", tone: "muted", text: c.common.help }],
        ...lifecycleFooter(c, props.unsubscribe),
      };
    }
    case "d30_winback": {
      const props = p as TemplateProps["d30_winback"];
      return {
        subject: c.d30Winback.subject, preview: c.d30Winback.preview, heading: c.d30Winback.heading,
        blocks: [
          { kind: "text", text: fill(c.d30Winback.body, { workspace: props.workspace }) },
          { kind: "action", label: c.d30Winback.action, url: props.workspaceUrl },
          { kind: "text", tone: "muted", text: c.d30Winback.help }, { kind: "link", label: c.common.bookCall, url: props.callUrl },
        ],
        ...lifecycleFooter(c, props.unsubscribe),
      };
    }
    case "payment_receipt": {
      const props = p as TemplateProps["payment_receipt"];
      const credits = number(locale, props.credits);
      const rows: Array<[string, string]> = [
        [c.paymentReceipt.amount, money(locale, props.amountCents, props.currency)],
        [c.paymentReceipt.credits, credits],
        [c.paymentReceipt.date, date(locale, props.paidAt)],
      ];
      if (props.bonusCredits) rows.push([c.paymentReceipt.bonus, number(locale, props.bonusCredits)]);
      if (props.netCents !== undefined) {
        rows.push([c.paymentReceipt.net, money(locale, props.netCents, props.currency)]);
        rows.push(props.vatCents ? [c.paymentReceipt.vat, money(locale, props.vatCents, props.currency)] : [c.paymentReceipt.taxMention, props.taxMention ?? "—"]);
      }
      if (props.card) rows.push([c.paymentReceipt.paidWith, fill(c.paymentReceipt.card, props.card)]);
      if (props.reference) rows.push([c.paymentReceipt.reference, props.reference]);
      return {
        subject: c.paymentReceipt.subject, preview: fill(c.paymentReceipt.preview, { credits, workspace: props.workspace }), heading: c.paymentReceipt.heading,
        blocks: [
          { kind: "text", text: fill(c.paymentReceipt.body, { credits, workspace: props.workspace }) }, { kind: "facts", rows },
          ...(props.netCents !== undefined ? [{ kind: "text" as const, tone: "muted" as const, text: c.paymentReceipt.validity }] : []),
          { kind: "text", tone: "muted", text: c.paymentReceipt.note }, { kind: "action", label: c.paymentReceipt.action, url: props.billingUrl },
        ],
        footer: [fill(c.footer.receipt, { workspace: props.workspace })],
      };
    }
    case "invoice_available": {
      const props = p as TemplateProps["invoice_available"];
      const copy = c.invoiceAvailable;
      const rectifying = props.kind === "credit_note";
      const values = { number: props.number, workspace: props.workspace, original: props.originalNumber ?? "—" };
      return {
        subject: fill(rectifying ? copy.subjectCreditNote : copy.subjectInvoice, values), preview: copy.preview,
        heading: rectifying ? copy.headingCreditNote : copy.headingInvoice,
        blocks: [
          { kind: "text", text: fill(rectifying ? copy.bodyCreditNote : copy.bodyInvoice, values) },
          { kind: "facts", rows: [[copy.number, props.number], [copy.date, date(locale, `${props.issueDate}T12:00:00Z`)], [copy.total, money(locale, props.totalCents, props.currency)]] },
          { kind: "text", tone: "muted", text: copy.note }, { kind: "action", label: copy.action, url: props.billingUrl },
        ],
        footer: [fill(copy.footer, { workspace: props.workspace })],
      };
    }
    case "low_balance": {
      const props = p as TemplateProps["low_balance"];
      const values = { workspace: props.workspace, balance: number(locale, props.balance), threshold: number(locale, props.threshold) };
      return {
        subject: c.lowBalance.subject, preview: fill(c.lowBalance.preview, values), heading: c.lowBalance.heading,
        blocks: [{ kind: "text", text: fill(c.lowBalance.body, values) }, { kind: "action", label: c.lowBalance.action, url: props.topUpUrl }],
        ...billingFooter(c, props.workspace, props.settingsUrl),
      };
    }
    case "auto_recharge_succeeded": {
      const props = p as TemplateProps["auto_recharge_succeeded"];
      const values = {
        workspace: props.workspace, amount: money(locale, props.amountCents, props.currency), credits: number(locale, props.credits),
        threshold: number(locale, props.threshold), balance: number(locale, props.balance),
      };
      return {
        subject: fill(c.autoRechargeSucceeded.subject, values), preview: fill(c.autoRechargeSucceeded.preview, values), heading: c.autoRechargeSucceeded.heading,
        blocks: [{ kind: "text", text: fill(c.autoRechargeSucceeded.body, values) }, { kind: "action", label: c.autoRechargeSucceeded.action, url: props.billingUrl }],
        ...billingFooter(c, props.workspace, props.settingsUrl),
      };
    }
    case "auto_recharge_failed": {
      const props = p as TemplateProps["auto_recharge_failed"];
      const values = { workspace: props.workspace, amount: money(locale, props.amountCents, props.currency) };
      return {
        subject: c.autoRechargeFailed.subject, preview: c.autoRechargeFailed.preview, heading: c.autoRechargeFailed.heading,
        blocks: [{ kind: "text", text: fill(c.autoRechargeFailed.body, values) }, { kind: "action", label: c.autoRechargeFailed.action, url: props.billingUrl }],
        ...billingFooter(c, props.workspace, props.settingsUrl),
      };
    }
    case "credits_expiring": {
      const props = p as TemplateProps["credits_expiring"];
      const values = { workspace: props.workspace, credits: number(locale, props.credits), date: date(locale, props.expiresAt) };
      return {
        subject: fill(c.creditsExpiring.subject, values), preview: fill(c.creditsExpiring.preview, values), heading: c.creditsExpiring.heading,
        blocks: [{ kind: "text", text: fill(c.creditsExpiring.body, values) }, { kind: "action", label: c.creditsExpiring.action, url: props.workspaceUrl }],
        ...billingFooter(c, props.workspace, props.settingsUrl),
      };
    }
    case "cap_reached": {
      const props = p as TemplateProps["cap_reached"];
      const k = c.capReached;
      const scope = props.scope === "monthly" ? k.scopeMonthly : props.scope === "run" ? k.scopeRun : k.scopeSchedule;
      const values = { workspace: props.workspace, cap: number(locale, props.cap), percent: props.percent, scope };
      const full = props.percent >= 100;
      return {
        subject: full ? k.subject : fill(k.subjectPartial, values), preview: fill(k.preview, values), heading: full ? k.heading : fill(k.headingPartial, values),
        blocks: [{ kind: "text", text: fill(full ? k.body : k.bodyPartial, values) }, { kind: "action", label: k.action, url: props.limitsUrl }],
        ...billingFooter(c, props.workspace, props.settingsUrl),
      };
    }
    case "demo_report": {
      const props = p as TemplateProps["demo_report"];
      return {
        subject: props.subject, preview: props.lines[0] ?? props.heading, heading: props.heading,
        blocks: [
          ...props.lines.map((text, index): EmailBlock => ({ kind: "text", tone: index === 0 ? "lead" : "body", text })),
          { kind: "action", label: props.failed ? c.demoReport.actionRetry : c.demoReport.action, url: props.url },
        ],
        footer: [props.footer],
      };
    }
  }
  throw new Error("email_template_unknown");
}

export type RenderedEmail = {
  template: TemplateName;
  category: EmailCategory;
  locale: EmailLocale;
  subject: string;
  html: string;
  text: string;
  /** RFC 8058 one-click unsubscribe headers on lifecycle mail. */
  headers?: Record<string, string>;
};

/** Content for one template in one language (exposed for tests and previews). */
export function emailContent<T extends TemplateName>(name: T, locale: EmailLocale, props: TemplateProps[T]): EmailContent {
  const c = emailCopy(locale);
  const d = draft(name, c, locale, props);
  return {
    locale, category: TEMPLATE_CATEGORY[name], subject: d.subject, preview: d.preview, heading: d.heading, blocks: d.blocks,
    footer: d.footer ?? [c.footer.essential], footerLink: d.footerLink, signoff: c.common.signoff, address: c.common.address, copyLink: c.common.copyLink,
  };
}

export function renderEmail<T extends TemplateName>(name: T, locale: EmailLocale, props: TemplateProps[T]): RenderedEmail {
  const content = emailContent(name, locale, props);
  const unsubscribe = (props as { unsubscribe?: Unsubscribe }).unsubscribe;
  return {
    template: name, category: content.category, locale, subject: content.subject,
    html: renderEmailDocument(<EmailLayout content={content} />),
    text: renderEmailText(content),
    headers: content.category === "lifecycle" && unsubscribe
      ? { "List-Unsubscribe": `<${unsubscribe.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined,
  };
}
