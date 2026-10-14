import "server-only";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { getResendClient } from "@/lib/resend/client";
import { appOrigin } from "@/lib/evals/signup";

/**
 * "Have an expert review this" (launch L-26, P-10): tells the founders, at the
 * internal ops address the platform alerts use, that a customer asked for an
 * expert review, so they can reply with a hand-written quote within one
 * working day. Only the internal address ever receives it. It carries the
 * workspace and report names, the requested scope, deadline and sector, and
 * links; no answers, contact addresses or secrets. One email per request
 * (Resend idempotency key).
 */
export async function notifyFoundersOfReviewRequest(input: {
  requestId: string; workspace: string; report: string; scopeKind: string; sector: string;
  deadline: string | null; replyDueAt: string; hasNote: boolean;
}) {
  const to = process.env.COLLABORATION_NOTIFICATION_EMAIL?.trim() || process.env.CONTACT_NOTIFICATION_EMAIL?.trim() || "hello@caudals.com";
  const from = getSecretEnvValue("RESEND_FROM_EMAIL");
  if (!from) throw new Error("email_unconfigured");
  const clean = (value: string) => value.replace(/[\r\n]+/g, " ").slice(0, 160);
  const reply = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(input.replyDueAt));
  const text = [
    "A customer asked for an expert review of a report.",
    "",
    `Workspace: ${clean(input.workspace)}`,
    `Report: ${clean(input.report)}`,
    `Scope: ${input.scopeKind.replaceAll("_", " ")}${input.hasNote ? " (with a note)" : ""}`,
    `Sector: ${input.sector.replaceAll("_", " ")}`,
    `Deadline: ${input.deadline ?? "none given"}`,
    "",
    `Reply with a hand-written quote by ${reply} (Madrid), one working day after the request.`,
    `Request, CRM draft and order: ${appOrigin()}/ops/experts/reviews/${input.requestId}`,
    "",
    "The CRM draft is not sent anywhere; copy it into Warmbly. Credits never pay for expert hours.",
  ].join("\n");
  const result = await getResendClient().emails.send(
    { from, to, subject: `Expert review requested: ${clean(input.workspace).slice(0, 80)}`, text },
    { idempotencyKey: `expert-review-request-${input.requestId}` },
  );
  if (result && "error" in result && result.error) throw new Error("review_email_failed");
}
