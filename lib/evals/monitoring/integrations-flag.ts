/**
 * INTEGRATIONS_V2_ENABLED (launch L-19, spec v2 P-25, P-27, P-28): the CI
 * trigger (`runs:write` tokens, `POST /integrations/runs`, the release gate and
 * its thresholds) and the Slack, Microsoft Teams and email destinations with
 * their test send. Read on the server only (the app passes it to Settings as a
 * prop) and by the scheduler, which queues summaries for those destinations
 * only while it is on. Off: today's read-only tokens and signed webhooks.
 *
 * No "server-only": the scheduler imports it.
 */
type Env = Record<string, string | undefined>;

export function integrationsV2Enabled(env: Env = process.env): boolean {
  return env.INTEGRATIONS_V2_ENABLED === "true";
}
