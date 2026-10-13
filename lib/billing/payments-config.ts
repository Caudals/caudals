/**
 * Payment configuration and who may pay (launch spec v2 §6.18; decisions I-3
 * and I-9). Read on the server at request time; never NEXT_PUBLIC_*.
 *
 * - BILLING_STRIPE_MODE: "live" or "test" (anything else is test). The Stripe
 *   key must match the mode by its prefix; a mismatch closes payments.
 * - Test mode never serves customers: only the workspaces listed in
 *   BILLING_TEST_WORKSPACE_IDS (internal verification) can top up, whatever
 *   BILLING_CREDITS_ENABLED says, so no one can obtain credits with a test card.
 * - Live mode opens top-ups to workspace owners when BILLING_CREDITS_ENABLED
 *   is true and the company's legal data are configured (D-01, §3.2), and
 *   then (L-14, §6.18) only to the workspaces a platform admin allowlisted
 *   (billing.workspace_override.live_payments: the founder's €20 purchase,
 *   the design partners) until PLANS_V2_ENABLED opens them to every owner at
 *   Gate B.
 * - Webhook signing secrets are per mode: STRIPE_TEST_WEBHOOK_SECRET and
 *   STRIPE_LIVE_WEBHOOK_SECRET.
 */
import { getSecretEnvValue } from "@/lib/env/secrets";
import { getLegalEntity } from "@/lib/legal/entity";
import type { Pool } from "pg";
import { withTenant } from "@/lib/evals/repositories/db";
import { billingCreditsEnabled } from "./config";
import { livePaymentWorkspaces } from "./overrides";
import { plansV2Enabled } from "./plans";

type Env = Record<string, string | undefined>;
export type StripeMode = "test" | "live";

export function stripeMode(env: Env = process.env): StripeMode {
  return env.BILLING_STRIPE_MODE?.trim() === "live" ? "live" : "test";
}

export class PaymentsConfigError extends Error {
  constructor(readonly code: "STRIPE_KEY_MISSING" | "STRIPE_MODE_MISMATCH" | "WEBHOOK_SECRET_MISSING") { super(code); this.name = "PaymentsConfigError"; }
}

/** True when a Stripe secret or restricted key belongs to the mode, judged by its prefix only. */
export function keyMatchesMode(key: string, mode: StripeMode) {
  return mode === "live" ? /^(sk|rk)_live_/.test(key) : /^(sk|rk)_test_/.test(key);
}

/** The Stripe secret key for the configured mode. Throws when missing or of the other mode (never returns a live key in test mode). */
export function stripeSecretKey(env: Env = process.env): string {
  const key = getSecretEnvValue("STRIPE_SECRET_KEY", { env });
  if (!key) throw new PaymentsConfigError("STRIPE_KEY_MISSING");
  if (!keyMatchesMode(key, stripeMode(env))) throw new PaymentsConfigError("STRIPE_MODE_MISMATCH");
  return key;
}

/** The signing secret of this mode's webhook endpoint. */
export function stripeWebhookSecret(env: Env = process.env): string {
  const name = stripeMode(env) === "live" ? "STRIPE_LIVE_WEBHOOK_SECRET" : "STRIPE_TEST_WEBHOOK_SECRET";
  const secret = getSecretEnvValue(name, { env });
  if (!secret || !secret.startsWith("whsec_")) throw new PaymentsConfigError("WEBHOOK_SECRET_MISSING");
  return secret;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** BILLING_TEST_WORKSPACE_IDS: internal workspaces that may top up in test mode. */
export function testWorkspaceIds(env: Env = process.env): Set<string> {
  return new Set((env.BILLING_TEST_WORKSPACE_IDS ?? "").split(",").map(id => id.trim().toLowerCase()).filter(id => UUID.test(id)));
}

export type PaymentsAccess = "open" | "test_workspace" | "closed";

/**
 * Whether this workspace may use top-ups, auto-recharge and the portal now.
 * The scheduler, which has no legal-entity settings, passes requireEntity
 * false: auto-recharge can only have been switched on through this check.
 * In live mode before Gate B, `liveAllowlisted` says whether an admin opened
 * live payments for the workspace (resolvePaymentsAccess looks it up).
 */
export function paymentsAccess(orgId: string, env: Env = process.env, options: { requireEntity?: boolean; liveAllowlisted?: boolean } = {}): PaymentsAccess {
  try { stripeSecretKey(env); } catch { return "closed"; }
  if (stripeMode(env) === "test") return testWorkspaceIds(env).has(orgId.toLowerCase()) ? "test_workspace" : "closed";
  if (!billingCreditsEnabled(env) || !(options.requireEntity === false || getLegalEntity(env))) return "closed";
  return plansV2Enabled(env) || options.liveAllowlisted === true ? "open" : "closed";
}

/**
 * paymentsAccess for several workspaces, with the live-mode allowlist read
 * from the database (only in live mode before Gate B; test mode and Gate B
 * need no query). Any lookup failure keeps live payments closed.
 */
export async function resolvePaymentsAccess(orgIds: readonly string[], env: Env = process.env,
  options: { requireEntity?: boolean; actorId?: string; pool?: Pool } = {}): Promise<Map<string, PaymentsAccess>> {
  let allowlisted = new Set<string>();
  const needsList = orgIds.length > 0 && stripeMode(env) === "live" && !plansV2Enabled(env) && billingCreditsEnabled(env)
    && orgIds.some(id => paymentsAccess(id, env, { requireEntity: options.requireEntity, liveAllowlisted: true }) === "open");
  if (needsList) {
    try {
      allowlisted = await withTenant({ orgId: "", actorId: options.actorId ?? "system:payments-access" }, db => livePaymentWorkspaces(db, orgIds), options.pool);
    } catch {
      console.error(JSON.stringify({ event: "billing_live_allowlist_unavailable" }));
    }
  }
  return new Map(orgIds.map(id => [id, paymentsAccess(id, env, { requireEntity: options.requireEntity, liveAllowlisted: allowlisted.has(id.toLowerCase()) })]));
}

/** resolvePaymentsAccess for one workspace. */
export async function paymentsAccessFor(orgId: string, env: Env = process.env, options: { requireEntity?: boolean; actorId?: string; pool?: Pool } = {}): Promise<PaymentsAccess> {
  return (await resolvePaymentsAccess([orgId], env, options)).get(orgId) ?? "closed";
}

/**
 * Origin of the app host for Stripe return links and the portal. Never
 * NEXT_PUBLIC_APP_URL: in production it names the public site, where
 * /workspace paths do not exist.
 */
export function appBaseUrl(env: Env = process.env) {
  for (const value of [env.EVALS_APP_URL, env.BETTER_AUTH_URL]) {
    try { if (value?.trim()) return new URL(value.trim()).origin; } catch { /* next */ }
  }
  return "https://app.caudals.com";
}
