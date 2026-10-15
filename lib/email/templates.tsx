import { emailCopy, fill, type EmailCopy, type EmailLocale } from "./copy";
import { EmailLayout, renderEmailText, type EmailBlock, type EmailCategory, type EmailContent } from "./layout";
import { renderEmailDocument } from "./render";
import { buildDestinationMessage, testMessage, type DestinationContent } from "@/lib/evals/monitoring/destination-format";

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
  /** `reviewers`: an expert-reviewed revision (launch L-26), with the number of experts on its label. */
  report_published: Notice & { updated?: boolean; reviewers?: number };
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
  /** A credit-rate increase notice (L-16, §6.4): 30 days ahead, to owners who used the models in the last 90 days. */
  price_increase: { workspace: string; effectiveAt: string; models: Array<{ label: string; now: string; next: string }>; modelsUrl: string };
  low_balance: { workspace: string; balance: number; threshold: number; topUpUrl: string; settingsUrl: string };
  auto_recharge_succeeded: { workspace: string; amountCents: number; currency: string; credits: number; threshold: number; balance: number; billingUrl: string; settingsUrl: string };
  auto_recharge_failed: { workspace: string; amountCents: number; currency: string; billingUrl: string; settingsUrl: string };
  credits_expiring: { workspace: string; credits: number; expiresAt: string; workspaceUrl: string; settingsUrl: string };
  cap_reached: { workspace: string; cap: number; percent: 50 | 80 | 100; scope: "monthly" | "run" | "schedule"; limitsUrl: string; settingsUrl: string };
  /** Unusual spend (launch G2, §6.10): a UTC day above 3 × the daily average of the 28 days before it. */
  unusual_spend: { workspace: string; day: string; credits: number; average: number; usageUrl: string; settingsUrl: string };
  /** A scheduled run skipped before it started (launch L-18): too few credits, or a credit limit it would pass. */
  schedule_skipped: {
    workspace: string; evaluation: string; scheduledFor: string; reason: "credits" | "cap"; capScope?: "monthly" | "run" | "schedule" | null;
    needed: number; available: number; cap?: number | null; nextRunAt?: string | null; actionUrl: string; settingsUrl: string;
  };
  /** The regression summary after a scheduled run (launch L-18, P-25): score against last time and up to five newly broken questions. */
  monitor_regression: {
    evaluation: string; scheduledFor: string; now: { pass: number; scored: number }; before: { pass: number; scored: number };
    broken: Array<{ title: string; url: string }>; brokenTotal: number; reportUrl: string; settingsUrl: string;
  };
  /**
   * The summary after a scheduled run sent to an email destination (launch
   * L-19, P-28): the same lines as the Slack and Teams messages
   * (lib/evals/monitoring/destination-format.ts), or the test send's example,
   * labelled as one. Sent to a shared address, not a member: its footer says
   * why it arrives and who can remove it.
   */
  monitor_summary: DestinationContent;
  /** The public demo's report email (L-03), with its own localized lines. */
  demo_report: { subject: string; heading: string; lines: string[]; url: string; failed: boolean; footer: string };
};

export type TemplateName = keyof TemplateProps;

export const TEMPLATE_CATEGORY: Record<TemplateName, EmailCategory> = {
  signup_link: "essential", signup_existing: "essential", signup_domain_taken: "essential", password_reset: "essential",
  invitation: "essential", payment_receipt: "essential", invoice_available: "essential", demo_report: "essential", price_increase: "essential",
  test_set_ready: "notification", report_published: "notification", run_failed: "notification", input_required: "notification",
  export_failed: "notification", generation_failed: "notification", website_failed: "notification", document_failed: "notification",
  low_balance: "billing", auto_recharge_succeeded: "billing", auto_recharge_failed: "billing", credits_expiring: "billing", cap_reached: "billing",
  unusual_spend: "billing", schedule_skipped: "billing", monitor_regression: "notification", monitor_summary: "essential",
  welcome: "lifecycle", d1_test_set: "lifecycle", d3_run: "lifecycle", d7_report: "lifecycle", first_report: "lifecycle",
  d21_rerun: "lifecycle", d30_winback: "lifecycle",
};

const intlLocale = (locale: EmailLocale) => (locale === "es" ? "es-ES" : "en-GB");
const number = (locale: EmailLocale, value: number) => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
const money = (locale: EmailLocale, cents: number, currency: string) =>
  new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency }).format(cents / 100);
const percentOf = (locale: EmailLocale, score: { pass: number; scored: number }) =>
  score.scored > 0 ? new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(score.pass / score.scored) : "—";
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
      if (props.reviewers && props.reviewers > 0) {
        return {
          subject: r.subjectReviewed, preview: r.preview, heading: r.headingReviewed,
          blocks: [{ kind: "text", text: props.reviewers === 1 ? r.bodyReviewedOne : fill(r.bodyReviewedMany, { count: props.reviewers }) }, { kind: "action", label: r.action, url: props.url }],
          footer: [c.footer.notification], footerLink: { label: c.footer.notificationLink, url: props.settingsUrl },
        };
      }
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
    case "price_increase": {
      const props = p as TemplateProps["price_increase"];
      const copy = c.priceIncrease;
      const values = { date: date(locale, props.effectiveAt), workspace: props.workspace, models: props.models.map(model => model.label).join(", ") };
      return {
        subject: fill(copy.subject, values), preview: fill(copy.preview, values), heading: copy.heading,
        blocks: [
          { kind: "text", text: fill(copy.body, values) },
          { kind: "text", tone: "muted", text: fill(copy.rates, values) },
          { kind: "facts", rows: props.models.map(model => [model.label, `${model.now} → ${model.next}`] as [string, string]) },
          { kind: "text", text: copy.next }, { kind: "action", label: copy.action, url: props.modelsUrl },
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
    case "unusual_spend": {
      const props = p as TemplateProps["unusual_spend"];
      const k = c.unusualSpend;
      // The day is a UTC date: format its midday so no time zone moves it.
      const values = { workspace: props.workspace, credits: number(locale, props.credits), average: number(locale, props.average), date: date(locale, `${props.day}T12:00:00Z`) };
      return {
        subject: fill(k.subject, values), preview: fill(k.preview, values), heading: k.heading,
        blocks: [{ kind: "text", text: fill(k.body, values) }, { kind: "text", text: k.next }, { kind: "action", label: k.action, url: props.usageUrl }],
        ...billingFooter(c, props.workspace, props.settingsUrl),
      };
    }
    case "schedule_skipped": {
      const props = p as TemplateProps["schedule_skipped"];
      const k = c.scheduleSkipped;
      const credits = props.reason === "credits";
      const scope = props.capScope === "monthly" ? c.capReached.scopeMonthly : props.capScope === "run" ? c.capReached.scopeRun : c.capReached.scopeSchedule;
      const values = {
        workspace: props.workspace, evaluation: props.evaluation, date: date(locale, props.scheduledFor), needed: number(locale, props.needed),
        available: number(locale, props.available), cap: number(locale, props.cap ?? 0), scope, next: props.nextRunAt ? date(locale, props.nextRunAt) : "",
      };
      return {
        subject: credits ? k.subjectCredits : k.subjectCap, preview: fill(k.preview, values), heading: k.heading,
        blocks: [
          { kind: "text", text: fill(credits ? k.bodyCredits : k.bodyCap, values) },
          ...(props.nextRunAt ? [{ kind: "text" as const, text: fill(credits ? k.nextCredits : k.nextCap, values) }] : []),
          { kind: "action", label: credits ? k.actionCredits : k.actionCap, url: props.actionUrl },
        ],
        ...billingFooter(c, props.workspace, props.settingsUrl),
      };
    }
    case "monitor_regression": {
      const props = p as TemplateProps["monitor_regression"];
      const k = c.monitorRegression;
      const values = {
        evaluation: props.evaluation, count: number(locale, props.brokenTotal), now: percentOf(locale, props.now), before: percentOf(locale, props.before),
        date: date(locale, props.scheduledFor),
      };
      const score = (value: { pass: number; scored: number }) =>
        fill(k.scoreValue, { percent: percentOf(locale, value), pass: number(locale, value.pass), scored: number(locale, value.scored) });
      const broken = props.broken.slice(0, 5);
      return {
        subject: props.brokenTotal === 1 ? fill(k.subjectOne, values) : fill(k.subject, values), preview: fill(k.preview, values), heading: k.heading,
        blocks: [
          { kind: "text", tone: "lead", text: fill(k.lead, values) },
          { kind: "facts", rows: [[k.scoreNow, score(props.now)], [k.scoreBefore, score(props.before)]] },
          ...(broken.length ? [{ kind: "text" as const, text: k.brokenIntro }, ...broken.map((item): EmailBlock => ({ kind: "link", label: item.title.slice(0, 160), url: item.url }))] : []),
          ...(props.brokenTotal > broken.length ? [{ kind: "text" as const, tone: "muted" as const, text: fill(k.brokenMore, { count: number(locale, props.brokenTotal - broken.length) }) }] : []),
          { kind: "action", label: k.action, url: props.reportUrl },
        ],
        footer: [c.footer.notification], footerLink: { label: c.footer.notificationLink, url: props.settingsUrl },
      };
    }
    case "monitor_summary": {
      const props = p as TemplateProps["monitor_summary"];
      const options = { locale, appUrl: props.appUrl, orgId: props.orgId, workspace: props.workspace };
      const message = "summary" in props ? buildDestinationMessage(props.summary, options) : testMessage(options, props.now ? new Date(props.now) : undefined);
      const blocks: EmailBlock[] = [];
      if (message.test) blocks.push({ kind: "text", tone: "lead", text: message.test.lead }, { kind: "text", tone: "muted", text: message.test.note });
      blocks.push({ kind: "text", tone: message.test ? "body" : "lead", text: message.lead });
      if (message.facts.length) blocks.push({ kind: "facts", rows: message.facts.map((fact): [string, string] => [fact.label, fact.value]) });
      if (message.broken.length) blocks.push({ kind: "text", text: message.brokenIntro }, ...message.broken.map((item): EmailBlock => ({ kind: "link", label: item.title, url: item.url })));
      if (message.more) blocks.push({ kind: "text", tone: "muted", text: message.more });
      if (message.fixed) blocks.push({ kind: "text", text: message.fixed });
      blocks.push({ kind: "action", label: message.action.label, url: message.action.url });
      return {
        subject: message.test ? message.test.subject : message.title, preview: message.preview, heading: message.test ? message.test.heading : message.title,
        blocks, footer: [message.footer],
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
