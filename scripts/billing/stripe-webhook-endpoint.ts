/**
 * Creates the Stripe webhook endpoint for credit top-ups (launch L-12) and
 * stores its signing secret in the app credentials, without printing it.
 *
 *   scripts/billing/with-app-credentials.sh STRIPE_SECRET_KEY -- \
 *     node --conditions=react-server --import tsx scripts/billing/stripe-webhook-endpoint.ts [--mode test|live] [--replace]
 *
 * Reads STRIPE_SECRET_KEY from the environment and refuses a key of the other
 * mode (judged by its prefix). Test mode is the default; live mode is a
 * founder action at Gate B (decision I-3). The endpoint points at
 * https://app.caudals.com/api/evals/v1/billing/stripe/webhook (override with
 * BILLING_WEBHOOK_URL), subscribes to the events in lib/billing/stripe.ts and
 * pins the API version the code is typed against. Stripe returns the signing
 * secret only when an endpoint is created, so an existing endpoint is kept
 * unless --replace is given (which deletes and recreates it). The secret is
 * piped to scripts/set-app-credentials.sh as STRIPE_TEST_WEBHOOK_SECRET or
 * STRIPE_LIVE_WEBHOOK_SECRET; run scripts/launch/set-app-flag.sh or redeploy
 * the app afterwards so the process reads it.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import Stripe from "stripe";
import { keyMatchesMode, type StripeMode } from "../../lib/billing/payments-config";
import { STRIPE_API_VERSION, STRIPE_WEBHOOK_EVENTS } from "../../lib/billing/stripe";

async function main() {
  const args = process.argv.slice(2);
  const mode: StripeMode = args.includes("--mode") && args[args.indexOf("--mode") + 1] === "live" ? "live" : "test";
  const replace = args.includes("--replace");
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!keyMatchesMode(key, mode)) throw new Error(`STRIPE_SECRET_KEY is not a ${mode}-mode key`);
  const url = process.env.BILLING_WEBHOOK_URL ?? "https://app.caudals.com/api/evals/v1/billing/stripe/webhook";
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  const existing = [];
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) if (endpoint.url === url) existing.push(endpoint);
  if (existing.length && !replace) {
    console.log(JSON.stringify({ result: "exists", endpoints: existing.map(endpoint => ({ id: endpoint.id, status: endpoint.status, events: endpoint.enabled_events.length, api_version: endpoint.api_version })) }));
    console.log("Kept the existing endpoint. Pass --replace to recreate it and store a new signing secret.");
    return;
  }
  for (const endpoint of existing) await stripe.webhookEndpoints.del(endpoint.id);
  const created = await stripe.webhookEndpoints.create({
    url, enabled_events: [...STRIPE_WEBHOOK_EVENTS], api_version: STRIPE_API_VERSION,
    description: `Caudals credit top-ups (${mode} mode, launch L-12)`, metadata: { caudals_key: "billing_webhook_v1" },
  });
  if (!created.secret?.startsWith("whsec_")) throw new Error("Stripe returned no signing secret");
  const credential = mode === "live" ? "STRIPE_LIVE_WEBHOOK_SECRET" : "STRIPE_TEST_WEBHOOK_SECRET";
  const store = spawnSync("sudo", ["-n", path.resolve(path.dirname(process.argv[1] ?? "scripts/billing/x"), "..", "set-app-credentials.sh"), credential], { input: `${created.secret}\n`, encoding: "utf8" });
  if (store.status !== 0) throw new Error(`Could not store ${credential} (exit ${store.status})`);
  console.log(JSON.stringify({ result: "created", id: created.id, livemode: created.livemode, status: created.status, events: created.enabled_events, api_version: created.api_version, stored: credential }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "failed");
  process.exitCode = 1;
});
