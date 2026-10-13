/**
 * Credit-rate increase notices (launch spec v2 §6.4; L-16).
 *
 * Rules, enforced in the database (migration 094): a revision that raises
 * any rate is scheduled at least 30 days ahead (L-10), and it takes effect
 * only if its notice went out at least 30 days before its effective date;
 * otherwise billing.price_book_at keeps the previous revision and ops cancel
 * and reschedule it (we absorb the provider's increase meanwhile). Decreases
 * apply immediately.
 *
 * Recipients: owners of credit workspaces (not contract) that used a raised
 * model in the last 90 days, or ran anything when a platform meter rises
 * (billing.price_notice_recipients). The notice is in-app (one per
 * workspace, written by billing.record_price_notice) and by email.
 *
 * BILLING_PRICE_NOTICES decides who gets the email: `internal` (default)
 * computes the recipients but sends only test copies to the internal address
 * (COLLABORATION_NOTIFICATION_EMAIL) and refuses the real send; `owners`
 * (a founder decision) sends to the owners and records the notice.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { emailAppUrl, senderAddress } from "@/lib/email/links";
import { renderEmail } from "@/lib/email/templates";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import { requirePlatformAdmin, requireRecentAuthentication } from "@/lib/evals/repositories/platform";
import { getResendClient } from "@/lib/resend/client";
import { opsApiError, opsIdempotencyKey } from "./ops";
import { getPriceBookRevision } from "./price-book";
import { ucrToCredits } from "./units";

type Env = Record<string, string | undefined>;
type Row = Record<string, unknown>;
const DAY = 86_400_000;
export const NOTICE_DAYS = 30;

export type PriceNoticeMode = "internal" | "owners";
export function priceNoticeMode(env: Env = process.env): PriceNoticeMode {
  return env.BILLING_PRICE_NOTICES?.trim() === "owners" ? "owners" : "internal";
}

/** The last instant the notice for a revision can go out: 30 days before it takes effect. */
export function noticeDeadline(effectiveAt: Date | null): Date | null {
  return effectiveAt ? new Date(effectiveAt.getTime() - NOTICE_DAYS * DAY) : null;
}

/** Whether a revision may take effect (mirrors billing.price_notice_ok). */
export function noticeSatisfied(raisesPrices: boolean | null, noticeSentAt: Date | null, effectiveAt: Date | null): boolean {
  if (!raisesPrices) return true;
  const deadline = noticeDeadline(effectiveAt);
  return !!noticeSentAt && !!deadline && noticeSentAt.getTime() <= deadline.getTime();
}

/** One rate as "in · out" whole credits per 1M tokens, or "n" per unit for a meter. */
function rateText(rate: Record<string, unknown>) {
  const whole = (value: unknown) => ucrToCredits(BigInt(String(value ?? 0)));
  return "unit" in rate ? whole(rate.unit) : `${whole(rate.input)} · ${whole(rate.output)}`;
}

export interface NoticeState {
  revisionId: string; revision: number; status: string; raisesPrices: boolean | null; effectiveAt: string | null; noticeSentAt: string | null;
  deadline: string | null; noticeOk: boolean; canSend: boolean; mode: PriceNoticeMode;
  /** "due": scheduled, raising, not sent, deadline ahead; "missed": the deadline passed without a notice (the revision is held). */
  state: "not_required" | "due" | "sent" | "missed" | "draft";
  increases: Array<{ kind: string; label: string; now: string; next: string }>;
  recipients: Array<{ orgId: string; workspace: string; billingMode: string; owners: number; models: string[] }>;
  totals: { workspaces: number; owners: number };
}

/** The notice state of a revision: what rises, by how much, who must be told, and by when. */
export async function noticeState(db: PoolClient, revisionId: string, env: Env = process.env, now = new Date()): Promise<NoticeState> {
  const book = await getPriceBookRevision(db, revisionId);
  if (!book) throw new EvalError("PRICE_BOOK_NOT_FOUND", 404, "Price-book revision not found.");
  const r = book.revision;
  const increases = (await db.query("SELECT * FROM billing.price_increases($1::uuid)", [revisionId])).rows as Row[];
  const recipients = r.raisesPrices || r.status === "draft"
    ? (await db.query("SELECT org_id,workspace,billing_mode,cardinality(owner_emails) AS owners,models FROM billing.price_notice_recipients($1::uuid)", [revisionId])).rows as Row[]
    : [];
  const deadline = noticeDeadline(r.effectiveAt);
  const ok = noticeSatisfied(r.raisesPrices, r.noticeSentAt, r.effectiveAt);
  const state: NoticeState["state"] = r.status === "draft" ? "draft" : !r.raisesPrices ? "not_required" : r.noticeSentAt ? (ok ? "sent" : "missed")
    : deadline && now.getTime() <= deadline.getTime() ? "due" : "missed";
  return {
    revisionId, revision: r.revision, status: r.status, raisesPrices: r.raisesPrices, effectiveAt: r.effectiveAt?.toISOString() ?? null,
    noticeSentAt: r.noticeSentAt?.toISOString() ?? null, deadline: deadline?.toISOString() ?? null, noticeOk: ok,
    canSend: state === "due", mode: priceNoticeMode(env), state,
    increases: increases.map(row => ({ kind: String(row.kind), label: String(row.label), now: rateText(row.before_ucr as Record<string, unknown>), next: rateText(row.after_ucr as Record<string, unknown>) })),
    recipients: recipients.map(row => ({ orgId: String(row.org_id), workspace: String(row.workspace), billingMode: String(row.billing_mode), owners: Number(row.owners), models: (row.models ?? []) as string[] })),
    totals: { workspaces: recipients.length, owners: recipients.reduce((total, row) => total + Number(row.owners), 0) },
  };
}

/** GET /admin/price-book/revisions/:id/notice?orgId= */
export async function noticeForAdmin(identity: EvalIdentity, id: string, params: URLSearchParams) {
  requirePlatformAdmin(identity);
  const orgId = z.uuid().parse(params.get("orgId"));
  const revisionId = z.uuid().parse(id);
  return withTenant({ orgId, actorId: identity.user.id }, db => noticeState(db, revisionId)).catch(opsApiError);
}

export type SendEmail = (message: { to: string; subject: string; text: string; html: string; idempotencyKey: string }) => Promise<void>;
async function resendEmail(message: Parameters<SendEmail>[0]) {
  const from = getSecretEnvValue("RESEND_FROM_EMAIL");
  if (!from) throw new Error("email_unconfigured");
  const { error } = await getResendClient().emails.send(
    { from: senderAddress(from), to: message.to, subject: message.subject, text: message.text, html: message.html, tags: [{ name: "source", value: "billing-price-notice" }] },
    { idempotencyKey: message.idempotencyKey },
  );
  if (error) throw new Error("email_provider_rejected");
}

export const noticeActionInput = z.strictObject({ orgId: z.uuid(), action: z.enum(["test", "send"]) });

/**
 * POST /admin/price-book/revisions/:id/notice. "test": renders the notice
 * (EN and ES, for the first recipient workspace or a sample) and sends it to
 * the internal address only; nothing is recorded. "send": while
 * BILLING_PRICE_NOTICES=owners, records the notice (in-app, audited) and
 * emails every owner once; refused otherwise, and refused after the deadline.
 */
export async function noticeActionForAdmin(request: Request, identity: EvalIdentity, id: string, body: unknown,
  deps: { send?: SendEmail; env?: Env } = {}) {
  requireRecentAuthentication(identity);
  const key = opsIdempotencyKey(request);
  const input = noticeActionInput.parse(body);
  const revisionId = z.uuid().parse(id);
  const env = deps.env ?? process.env;
  const send = deps.send ?? resendEmail;
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  const base = emailAppUrl(env);
  const state = await withTenant(scope, db => noticeState(db, revisionId, env)).catch(opsApiError);
  if (!state.raisesPrices) throw new EvalError("NOTICE_NOT_REQUIRED", 409, "This revision raises no rate: decreases apply without notice.");
  if (!state.effectiveAt) throw new EvalError("PRICE_BOOK_TRANSITION", 409, "Schedule the revision first: the notice names its date.");
  const models = state.increases.map(item => ({ label: item.label, now: item.now, next: item.next }));
  const props = (workspace: string, orgId: string) => ({ workspace, effectiveAt: state.effectiveAt!, models, modelsUrl: `${base}/workspace/settings/models?orgId=${orgId}` });

  if (input.action === "test") {
    const internal = env.COLLABORATION_NOTIFICATION_EMAIL?.trim();
    if (!internal) throw new EvalError("EMAIL_UNCONFIGURED", 503, "The internal notification address is not configured.");
    const sample = state.recipients[0];
    const requestId = randomUUID();
    let sent = 0;
    for (const locale of ["en", "es"] as const) {
      const email = renderEmail("price_increase", locale, props(sample?.workspace ?? "Example workspace", sample?.orgId ?? input.orgId));
      await send({ to: internal, subject: `[test] ${email.subject}`, text: email.text, html: email.html, idempotencyKey: `price-notice-test:${revisionId}:${requestId}:${locale}` });
      sent++;
    }
    console.info(JSON.stringify({ event: "billing_price_notice_test", revision: state.revision, recipients: state.totals.owners, workspaces: state.totals.workspaces, sent }));
    return { action: "test", sent, to: "internal", recipients: state.totals };
  }

  if (state.mode !== "owners") {
    throw new EvalError("NOTICE_SENDS_INTERNAL_ONLY", 409, "Owner notices are off in this environment (BILLING_PRICE_NOTICES=internal). Send a test to the internal address instead.");
  }
  if (state.state !== "due" && state.state !== "sent") {
    throw new EvalError("NOTICE_TOO_LATE", 409, "The notice deadline has passed. Cancel the revision and schedule it at least 30 days after today.");
  }
  // Record the notice (in-app notices, notice_sent_at, audit) once; a replay returns the same answer.
  const recorded = await withTenant(scope, db => idempotent(db, scope, "price-book-notice", key, { revisionId, ...input }, async () => {
    const row = (await db.query("SELECT notice_sent_at FROM billing.record_price_notice($1::uuid,$2::jsonb)",
      [revisionId, JSON.stringify({ workspaces: state.totals.workspaces, owners: state.totals.owners, mode: state.mode })])).rows[0];
    return { noticeSentAt: new Date(row.notice_sent_at).toISOString() };
  })).catch(opsApiError);
  // Then one email per owner, deduplicated per workspace and revision.
  let sent = 0, failed = 0;
  for (const recipient of state.recipients) {
    const target = { orgId: recipient.orgId, actorId: identity.user.id };
    try {
      const claimed = await withTenant(target, async db => {
        if (!(await db.query("SELECT billing.claim_alert($1,'price_increase',$2) AS ok", [recipient.orgId, revisionId])).rows[0].ok) return null;
        const owners = (await db.query("SELECT unnest(owner_emails) AS email FROM billing.price_notice_recipients($1::uuid) WHERE org_id=$2", [revisionId, recipient.orgId])).rows;
        const country = (await db.query("SELECT country FROM billing.billing_profile WHERE org_id=$1", [recipient.orgId])).rows[0]?.country;
        return { owners: owners.map(row => String(row.email)), locale: country === "ES" ? "es" as const : "en" as const };
      });
      if (!claimed) continue;
      for (const [index, email] of claimed.owners.entries()) {
        const message = renderEmail("price_increase", claimed.locale, props(recipient.workspace, recipient.orgId));
        await send({ to: email, subject: message.subject, text: message.text, html: message.html, idempotencyKey: `price-notice:${revisionId}:${recipient.orgId}:${index}` });
        sent++;
      }
      await withTenant(target, db => db.query("SELECT billing.mark_alert_sent($1,'price_increase',$2)", [recipient.orgId, revisionId]));
    } catch {
      failed++;
      console.error(JSON.stringify({ event: "billing_price_notice_email_failed", revision: state.revision, workspace: recipient.orgId }));
    }
  }
  console.info(JSON.stringify({ event: "billing_price_notice_sent", revision: state.revision, workspaces: state.totals.workspaces, sent, failed }));
  return { action: "send", noticeSentAt: recorded.noticeSentAt, workspaces: state.totals.workspaces, sent, failed };
}
