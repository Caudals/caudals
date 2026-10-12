import "server-only";
import { getPostgresPool } from "@/lib/db/client";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { decryptSecret, encryptSecret, loadKeyring, type Keyring, type SecretScope } from "@/lib/evals/security/envelope";
import { createTranslator, scopeTranslator, type NamespaceKeys } from "@/lib/i18n/messages";
import { getResendClient } from "@/lib/resend/client";
import type { DemoSummary } from "./judge";

/**
 * "Email me the report when it's ready". The address (and the run's private
 * token, needed for the report link) is stored only as an AES-256-GCM envelope
 * under the evaluation master keyring (EVALS_MASTER_KEYRING_FILE, purpose
 * demo_notify), bound to the run. When the run ends, the email goes to that
 * address and nowhere else, and the envelope is deleted. A finished run that
 * could not be emailed within an hour is dropped rather than kept.
 */

const GIVE_UP_MS = 60 * 60_000;

let cachedKeys: { at: number; keys: Keyring; version: string } | null = null;

function keyring(): { keys: Keyring; version: string } | null {
  const file = process.env.EVALS_MASTER_KEYRING_FILE;
  if (!file) return null;
  if (cachedKeys && Date.now() - cachedKeys.at < 60_000) return cachedKeys;
  try {
    const keys = loadKeyring(file);
    const configured = process.env.EVALS_MASTER_KEY_VERSION;
    const version = configured && keys.has(configured) ? configured : [...keys.keys()].sort().at(-1)!;
    cachedKeys = { at: Date.now(), keys, version };
    return cachedKeys;
  } catch {
    return null;
  }
}

function emailConfigured() {
  try { return Boolean(getSecretEnvValue("RESEND_API_KEY") && getSecretEnvValue("RESEND_FROM_EMAIL")); } catch { return false; }
}

/** Whether the page may offer the option: a keyring to encrypt with and a way to send. */
export function notifyAvailable() {
  return emailConfigured() && keyring() !== null;
}

const scope = (runId: string): SecretScope => ({ orgId: "demo", recordId: runId, versionId: "notify-v1", purpose: "demo_notify", scopeId: runId });

/**
 * Stores the visitor's request. Returns "stored", or "finished" when the run
 * ended first (the page shows the report instead).
 */
export async function requestNotify(runId: string, email: string, token: string): Promise<"stored" | "finished"> {
  const ring = keyring();
  if (!ring) throw new Error("notify_unavailable");
  const plaintext = Buffer.from(JSON.stringify({ email: email.trim(), token }));
  let envelope;
  try { envelope = encryptSecret(plaintext, scope(runId), ring.version, ring.keys); } finally { plaintext.fill(0); }
  const { rowCount } = await getPostgresPool().query(
    `UPDATE demo.run SET notify_email_ciphertext = $2::jsonb, notify_requested_at = now(), notified_at = NULL, version = version + 1, updated_at = now()
     WHERE id = $1 AND phase NOT IN ('done','failed')`,
    [runId, JSON.stringify(envelope)],
  );
  return rowCount === 1 ? "stored" : "finished";
}

type Pending = {
  id: string;
  locale: "en" | "es";
  phase: "done" | "failed";
  error_code: string | null;
  target_host: string;
  docs_host: string;
  summary: DemoSummary | null;
  finished_at: Date;
  notify_email_ciphertext: unknown;
};

/** Where the public demo lives (the report link). */
function publicOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) { try { return new URL(configured).origin; } catch { /* fall through */ } }
  return process.env.NODE_ENV === "production" ? "https://caudals.com" : "http://localhost:3000";
}

function compose(run: Pending, token: string) {
  const t = scopeTranslator(createTranslator(run.locale), "demo");
  const e = (key: string, values?: Record<string, string | number>) => t(`email.${key}` as NamespaceKeys<"demo">, values);
  const report = `${publicOrigin()}/${run.locale}/demo#r=${run.id}.${token}`;
  const host = run.target_host;
  if (run.phase === "done") {
    const summary = run.summary;
    const lines = [summary && summary.scored ? e("readyScore", { host, correct: summary.correct, scored: summary.scored }) : e("readyNoScore", { host }), "", e("readyLink"), report];
    lines.push("", e("footer"));
    return { subject: e("readySubject", { host }), text: lines.join("\n") };
  }
  const code = run.error_code ?? "generic";
  const normalized = code.startsWith("target_http_") ? "target_http" : code.startsWith("model_") || code === "engine_failed" ? "model" : code.startsWith("timeout_") ? "phase_timeout" : code;
  const reasonKey = `errors.${normalized}`;
  const reason = t(reasonKey as NamespaceKeys<"demo">, { host });
  const sentence = reason === `demo.${reasonKey}` ? t("errors.generic") : reason;
  const lines = [e("failedIntro", { host }), "", sentence, "", e("failedLink"), `${publicOrigin()}/${run.locale}/demo`, "", e("footer")];
  return { subject: e("failedSubject", { host }), text: lines.join("\n") };
}

/**
 * Sends the report email for a finished run, if one was requested, then
 * deletes the address. Safe to call more than once: a row lock and an
 * idempotency key keep it to one email.
 */
export async function sendPendingNotification(runId: string): Promise<"sent" | "none" | "failed"> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Pending>(
      `SELECT id, locale, phase, error_code, target_host, docs_host, summary, finished_at, notify_email_ciphertext FROM demo.run
       WHERE id = $1 AND notify_email_ciphertext IS NOT NULL AND phase IN ('done','failed') FOR UPDATE SKIP LOCKED`,
      [runId],
    );
    const run = rows[0];
    if (!run) { await client.query("COMMIT"); return "none"; }
    const ring = keyring();
    let request: { email: string; token: string } | null = null;
    if (ring) {
      try {
        const plain = decryptSecret(run.notify_email_ciphertext, scope(run.id), ring.keys);
        request = JSON.parse(plain.toString("utf8")) as { email: string; token: string };
        plain.fill(0);
      } catch { request = null; }
    }
    if (!request || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(request.email) || !/^[A-Za-z0-9_-]{32}$/.test(request.token)) {
      // Unreadable: drop it rather than keep it.
      await client.query("UPDATE demo.run SET notify_email_ciphertext = NULL, version = version + 1, updated_at = now() WHERE id = $1", [run.id]);
      await client.query("COMMIT");
      console.error("demo_notify_unreadable", { run_id: run.id });
      return "failed";
    }
    const from = getSecretEnvValue("RESEND_FROM_EMAIL");
    if (!from) throw new Error("email_unconfigured");
    // Keep the payload identical across retries. Account signup is an explicit
    // action from the report, never a side effect of asking for an email.
    const message = compose(run, request.token);
    const { error } = await getResendClient().emails.send(
      { from, to: request.email, subject: message.subject, text: message.text },
      { idempotencyKey: `demo-notify-${run.id}` },
    );
    if (error) throw new Error("email_rejected");
    await client.query("UPDATE demo.run SET notify_email_ciphertext = NULL, notified_at = now(), version = version + 1, updated_at = now() WHERE id = $1", [run.id]);
    await client.query("COMMIT");
    return "sent";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    const code = error instanceof Error && /^[a-z_]{1,40}$/.test(error.message) ? error.message : error instanceof Error ? error.name : typeof error;
    console.error("demo_notify_failed", { run_id: runId, code });
    // Retried by the sweeper; after an hour the address is dropped, not kept.
    await getPostgresPool().query(
      `UPDATE demo.run SET notify_email_ciphertext = NULL, version = version + 1, updated_at = now()
       WHERE id = $1 AND notify_email_ciphertext IS NOT NULL AND phase IN ('done','failed') AND finished_at < now() - make_interval(secs => $2)`,
      [runId, GIVE_UP_MS / 1000],
    ).catch(() => {});
    return "failed";
  } finally {
    client.release();
  }
}

/** Finished runs whose report email is still due (a crash or an email outage). */
export async function pendingNotifications(limit = 5): Promise<string[]> {
  const { rows } = await getPostgresPool().query<{ id: string }>(
    `SELECT id FROM demo.run WHERE notify_email_ciphertext IS NOT NULL AND phase IN ('done','failed') ORDER BY finished_at LIMIT $1`,
    [limit],
  );
  return rows.map((row) => row.id);
}
