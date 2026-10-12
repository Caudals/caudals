import "server-only";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { createTranslator, scopeTranslator, type NamespaceKeys } from "@/lib/i18n/messages";
import { getResendClient } from "@/lib/resend/client";
import { publicOrigin } from "./notify";
import type { RunRow } from "./store";

/**
 * "Send to a colleague" from a finished demo report (launch L-04).
 *
 * One request sends one plain-text email to one address: the report's private
 * link, which works until the run is deleted. The address is used for that
 * send only. It is never stored or logged; the record kept is the sender's
 * consent (the `demo_report_shared` event, channel `email`), written before
 * the email goes out. The text is fixed: nothing the visitor types reaches it
 * except the tested host, which only a finished test can set.
 */

/** Emails per visitor (hashed IP) a day, and per run over its seven-day life. */
export const SHARE_LIMITS = {
  visitor: { limit: 5, windowMs: 24 * 3600_000 },
  run: { limit: 3, windowMs: 7 * 24 * 3600_000 },
} as const;

type ShareRun = Pick<RunRow, "id" | "locale" | "target_host" | "summary" | "expires_at">;

export function composeShareEmail(run: ShareRun, token: string) {
  const t = scopeTranslator(createTranslator(run.locale), "demo");
  const e = (key: string, values?: Record<string, string | number>) => t(`shareEmail.${key}` as NamespaceKeys<"demo">, values);
  const host = run.target_host;
  const date = new Intl.DateTimeFormat(run.locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(new Date(run.expires_at));
  const summary = run.summary;
  const lines = [
    e("intro", { host }),
    ...(summary && summary.scored ? ["", e("score", { correct: summary.correct, scored: summary.scored })] : []),
    "",
    e("link"),
    `${publicOrigin()}/${run.locale}/demo#r=${run.id}.${token}`,
    "",
    e("expiry", { date }),
    "",
    e("footer"),
  ];
  return { subject: e("subject", { host }), text: lines.join("\n") };
}

/**
 * Sends the email. `key` comes from the page, once per send, so a retried
 * request is delivered once (Resend idempotency).
 */
export async function sendShareEmail(run: ShareRun, token: string, to: string, key: string) {
  const from = getSecretEnvValue("RESEND_FROM_EMAIL");
  if (!from) throw new Error("email_unconfigured");
  const message = composeShareEmail(run, token);
  const { error } = await getResendClient().emails.send(
    { from, to, subject: message.subject, text: message.text },
    { idempotencyKey: `demo-share-${run.id}-${key}` },
  );
  if (error) throw new Error("email_rejected");
}
