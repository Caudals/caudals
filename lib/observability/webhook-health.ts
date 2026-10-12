import "server-only";
import { getEvalsPool } from "@/lib/evals/repositories/db";
import { loadKeyring } from "@/lib/evals/security/envelope";

/**
 * Webhook health for the external uptime check (launch L-08, spec P-48):
 * `GET /api/evals/v1/health/webhooks` on the app host. Each check answers
 * "ok" or "failing" and never says why, so the public response leaks nothing.
 *
 * L-12 extends WEBHOOK_HEALTH_CHECKS with the Stripe webhook (signing secret
 * configured for the active mode, recent events processed); the endpoint,
 * the uptime script and its alert stay as they are.
 */
export type HealthState = "ok" | "failing";
export type WebhookHealthCheck = { name: string; run: () => Promise<boolean> };
export type WebhookHealth = { status: HealthState; checks: Record<string, HealthState> };

export const WEBHOOK_HEALTH_CHECKS: WebhookHealthCheck[] = [
  // The web process reaches the evaluation database, where deliveries are recorded.
  { name: "database", run: async () => (await getEvalsPool().query("SELECT 1 AS ok")).rows[0]?.ok === 1 },
  // Outbound customer webhooks are signed with secrets wrapped by this keyring.
  {
    name: "outbound_signing",
    run: async () => {
      const file = process.env.EVALS_WEBHOOK_KEYRING_FILE;
      const version = process.env.EVALS_WEBHOOK_KEY_VERSION;
      return !!file && !!version && loadKeyring(file).has(version);
    },
  },
];

const TIMEOUT_MS = 3000;
const CACHE_MS = 15_000;
let cached: { at: number; value: WebhookHealth } | null = null;

async function runCheck(check: WebhookHealthCheck): Promise<HealthState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), TIMEOUT_MS); });
    return (await Promise.race([check.run(), timeout])) ? "ok" : "failing";
  } catch {
    return "failing";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Runs every check at most once per 15 s, however often the endpoint is polled. */
export async function webhookHealth(checks = WEBHOOK_HEALTH_CHECKS, now = Date.now()): Promise<WebhookHealth> {
  if (checks === WEBHOOK_HEALTH_CHECKS && cached && now - cached.at < CACHE_MS) return cached.value;
  const results = await Promise.all(checks.map(async (check) => [check.name, await runCheck(check)] as const));
  const value: WebhookHealth = {
    status: results.every(([, state]) => state === "ok") ? "ok" : "failing",
    checks: Object.fromEntries(results),
  };
  if (checks === WEBHOOK_HEALTH_CHECKS) cached = { at: now, value };
  return value;
}

/** Tests only. */
export function resetWebhookHealthCache() {
  cached = null;
}
