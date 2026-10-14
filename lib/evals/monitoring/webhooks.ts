import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import https from "node:https";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pinnedLookup, validatePublicDestination, type Lookup } from "../connectors/egress";
import { canonicalJson, sha256 } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import type { EvidenceScope } from "../repositories/evidence";
import { withTenant } from "../repositories/db";
import { decryptSecret, encryptSecret, loadKeyring, type Keyring } from "../security/envelope";
import { emailAppUrl } from "@/lib/email/links";
import { renderEmail } from "@/lib/email/templates";
import type { EmailLocale } from "@/lib/email/copy";
import type { RateLimitResult } from "@/lib/security/rate-limit";
import type { SendEmail } from "../operations/notifications";
import { createWebhookSignature } from "./webhook-protocol";
import { CUSTOMER_API_LIMITS, WEBHOOK_EVENT_KINDS, WEBHOOK_HEADERS, type DestinationType, type WebhookEventKind } from "./customer-api";
import { integrationsV2Enabled } from "./integrations-flag";
import { destinationMessage, slackPayload, teamsPayload, type DestinationContent } from "./destination-format";
import type { MonitoringSummary } from "./summary";

/**
 * Destinations for scheduled-run outcomes (WP-13; launch L-19, spec v2 P-25, P-28).
 *
 *   webhook  the signed generic webhook: canonical JSON, HMAC signature, five
 *            attempts. Unchanged by L-19.
 *   slack    a Slack incoming webhook (https://hooks.slack.com/services/…):
 *            a Block Kit message with links.
 *   teams    a Microsoft Teams incoming webhook (a Workflows or connector URL):
 *            an Adaptive Card with links.
 *   email    an address that is a member's, or on a member's company domain:
 *            the branded EN/ES `monitor_summary` email.
 *
 * For Slack, Teams and email the URL or address is the credential: it is kept
 * only in the endpoint's encrypted envelope (webhook keyring), never in the
 * clear; the list shows a masked hint. Every destination URL passes the same
 * egress checks as webhooks: HTTPS, public addresses only (private, loopback,
 * link-local, CGNAT and documentation ranges refused, for every DNS answer),
 * the socket pinned to the validated address (DNS rebinding cannot swap it),
 * no redirects, 10 s timeout. Deliveries go through `webhook_delivery` (one
 * per destination and event, five attempts). Slack, Teams and email need
 * INTEGRATIONS_V2_ENABLED to be created, tested or sent new summaries.
 */

const kinds = WEBHOOK_EVENT_KINDS;
const events = z.array(z.enum(kinds)).min(1).max(kinds.length);
const label = z.string().trim().min(1).max(120);
const locale = z.enum(["en", "es"]).default("en");
/** The generic signed webhook (WP-13). Kept as is: a body without `type` creates one. */
export const createWebhookSchema = z.strictObject({ label, url: z.url().max(2048), events });
/** Launch L-19: the destination picker. */
export const createDestinationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("webhook"), label, url: z.url().max(2048), events }),
  z.strictObject({ type: z.literal("slack"), label, url: z.url().max(2048), events, locale }),
  z.strictObject({ type: z.literal("teams"), label, url: z.url().max(2048), events, locale }),
  z.strictObject({ type: z.literal("email"), label, email: z.string().trim().max(254), events, locale }),
]);
export const updateWebhookSchema = z.strictObject({ enabled: z.boolean().optional(), events: events.optional(), rotate: z.boolean().optional() });

function secretConfig() {
  const file = process.env.EVALS_WEBHOOK_KEYRING_FILE, version = process.env.EVALS_WEBHOOK_KEY_VERSION;
  if (!file || !version) throw new Error("webhook_keyring_unconfigured");
  // Loaded at use time so a mounted keyring can be rotated without an application restart.
  return { keys: loadKeyring(file), version };
}
function scope(orgId: string, endpointId: string, versionId: string) { return { orgId, recordId: endpointId, versionId, purpose: "webhook" as const, scopeId: endpointId }; }

/* ------------------------------------------------------- destination rules --- */

const SLACK_HOSTS = new Set(["hooks.slack.com", "hooks.slack-gov.com"]);
const fail = (message: string): never => { throw new EvalError("INPUT_INVALID", 422, message); };

/** A Slack incoming-webhook URL: Slack's own host and path, nothing else. */
export function checkSlackUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return fail("Paste the incoming webhook URL from Slack (https://hooks.slack.com/services/…)."); }
  if (url.protocol !== "https:" || !SLACK_HOSTS.has(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !/^\/services\/[A-Za-z0-9_/-]{10,200}$/.test(url.pathname)) {
    fail("Paste the incoming webhook URL from Slack (https://hooks.slack.com/services/…).");
  }
  return url.href;
}
/** A Teams incoming-webhook URL: HTTPS, no credentials or fragment; its query string (the signature) is kept. */
export function checkTeamsUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return fail("Paste the incoming webhook URL from Microsoft Teams."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) fail("Paste the incoming webhook URL from Microsoft Teams.");
  return url.href;
}
/**
 * An email destination is a verified member's address, or a work address on a
 * member's company domain (never a free-mail or disposable domain unless it is
 * the member's own address), so alerts cannot be pointed at strangers.
 */
export async function emailDestinationAllowed(address: string, memberEmails: readonly string[]): Promise<boolean> {
  // Loaded here: the scheduler imports this module but never creates destinations.
  const { checkSignupEmail } = await import("../signup-domains");
  const target = checkSignupEmail(address, {});
  if (target.kind === "invalid") return false;
  const members = memberEmails.map(email => email.trim().toLowerCase());
  if (members.includes(target.email)) return true;
  if (target.kind !== "work") return false;
  return members.some(email => { const member = checkSignupEmail(email, {}); return member.kind === "work" && member.domain === target.domain; });
}
/** What the list shows instead of the credential. */
export function targetHint(type: Exclude<DestinationType, "webhook">, value: string): string {
  if (type === "email") {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 2)}•••@${domain}`;
  }
  const url = new URL(value), tail = (url.pathname + url.search).replace(/[^A-Za-z0-9]/g, "").slice(-4);
  return `${url.hostname} · …${tail}`;
}

async function liveDestinations(db: PoolClient, orgId: string) {
  return Number((await db.query("SELECT count(*)::int AS n FROM evals.webhook_endpoint WHERE org_id=$1 AND archived_at IS NULL", [orgId])).rows[0].n);
}

/* ------------------------------------------------------------------ create --- */

export async function createWebhookEndpoint(tenant: EvidenceScope, raw: unknown, deps: { lookup?: Lookup } = {}) {
  const typed = typeof raw === "object" && raw !== null && "type" in raw;
  const input = typed ? createDestinationSchema.parse(raw) : { type: "webhook" as const, ...createWebhookSchema.parse(raw) };
  if (input.type !== "webhook" && !integrationsV2Enabled()) throw new EvalError("INPUT_INVALID", 422, "This destination type is not available yet.");
  const lookup = deps.lookup;
  let credential: string;
  if (input.type === "webhook") {
    await validatePublicDestination(input.url, lookup).catch(error => denied(error));
    credential = "";
  } else if (input.type === "slack") {
    credential = checkSlackUrl(input.url);
    await validatePublicDestination(credential, lookup).catch(error => denied(error));
  } else if (input.type === "teams") {
    credential = checkTeamsUrl(input.url);
    await validatePublicDestination(credential, lookup, { allowQuery: true }).catch(error => denied(error));
  } else {
    credential = input.email.toLowerCase();
  }
  const { keys, version } = secretConfig(), endpointId = randomUUID(), versionId = randomUUID();
  const secret = input.type === "webhook" ? randomBytes(32) : Buffer.from(credential, "utf8");
  const uniqueEvents = [...new Set(input.events)];
  try {
    const result = await withTenant(tenant, async db => {
      if (input.type === "email") {
        const members = (await db.query("SELECT evals.workspace_member_emails($1) AS email", [tenant.orgId])).rows.map(row => String(row.email));
        if (!(await emailDestinationAllowed(credential, members))) fail("Use a team member's address or an address on your team's company domain.");
      }
      if (input.type !== "webhook" && await liveDestinations(db, tenant.orgId) >= CUSTOMER_API_LIMITS.destinationsPerWorkspace) {
        fail(`A workspace can have up to ${CUSTOMER_API_LIMITS.destinationsPerWorkspace} destinations. Delete one first.`);
      }
      const hint = input.type === "webhook" ? null : targetHint(input.type, credential);
      const language = input.type === "webhook" ? "en" : input.locale;
      await db.query(`INSERT INTO evals.webhook_endpoint(id,org_id,label,url,events,destination_type,target_hint,locale)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [endpointId, tenant.orgId, input.label, input.type === "webhook" ? input.url : null, uniqueEvents, input.type, hint, language]);
      await db.query("INSERT INTO evals.webhook_secret_version(id,org_id,endpoint_id,envelope) VALUES($1,$2,$3,$4)",
        [versionId, tenant.orgId, endpointId, encryptSecret(secret, scope(tenant.orgId, endpointId, versionId), version, keys)]);
      await db.query("UPDATE evals.webhook_endpoint SET current_secret_version_id=$3 WHERE org_id=$1 AND id=$2", [tenant.orgId, endpointId, versionId]);
      await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,'destination.created',$3,$4)",
        [tenant.orgId, tenant.actorId, endpointId, { type: input.type, events: uniqueEvents }]);
      await recordProductEvent({ eventName: "webhook_created", source: "server", orgId: tenant.orgId, eventKey: endpointId, payload: { destination_type: input.type === "webhook" ? "https" : input.type } }, db);
      return input.type === "webhook"
        ? { id: endpointId, label: input.label, url: input.url, events: uniqueEvents, enabled: true, destination_type: "webhook" as const }
        : { id: endpointId, label: input.label, url: null, events: uniqueEvents, enabled: true, destination_type: input.type, target_hint: hint, locale: language };
    });
    return input.type === "webhook" ? { ...result, secret: secret.toString("base64url") } : result;
  } finally { secret.fill(0); }
}
function denied(error: unknown): never {
  const reason = error instanceof Error ? error.message : "";
  if (reason === "destination_invalid") throw new EvalError("INPUT_INVALID", 422, "Use a public HTTPS address.");
  throw new EvalError("INPUT_INVALID", 422, "That address does not resolve to a public internet host. Private, loopback and link-local addresses are refused.");
}

export function listWebhookEndpoints(tenant: EvidenceScope) {
  return withTenant(tenant, async db => (await db.query(`SELECT e.id,e.label,e.url,e.events,e.enabled,e.created_at,e.updated_at,
    e.destination_type,e.target_hint,e.locale,e.last_test_at,e.last_test_status,e.last_test_reason,e.last_test_http_status,
    (SELECT count(*)::int FROM evals.webhook_delivery d WHERE (d.org_id,d.endpoint_id)=(e.org_id,e.id) AND d.status='failed') AS failed_deliveries
    FROM evals.webhook_endpoint e WHERE e.org_id=$1 AND e.archived_at IS NULL ORDER BY e.created_at DESC LIMIT 100`, [tenant.orgId])).rows);
}

export async function updateWebhookEndpoint(tenant: EvidenceScope, id: string, raw: unknown) {
  const input = updateWebhookSchema.parse(raw);
  if (!Object.keys(input).length) throw new EvalError("INPUT_INVALID", 422);
  const config = input.rotate ? secretConfig() : null, secret = input.rotate ? randomBytes(32) : null, versionId = input.rotate ? randomUUID() : null;
  try {
    return await withTenant(tenant, async db => {
      const endpoint = (await db.query("SELECT * FROM evals.webhook_endpoint WHERE org_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE", [tenant.orgId, id])).rows[0];
      if (!endpoint) throw new EvalError("SCOPE_DENIED", 404);
      if (secret && endpoint.destination_type !== "webhook") throw new EvalError("INPUT_INVALID", 422, "Only signed webhooks have a signing secret.");
      if (secret && versionId && config) await db.query("INSERT INTO evals.webhook_secret_version(id,org_id,endpoint_id,envelope) VALUES($1,$2,$3,$4)",
        [versionId, tenant.orgId, id, encryptSecret(secret, scope(tenant.orgId, id, versionId), config.version, config.keys)]);
      const row = (await db.query(`UPDATE evals.webhook_endpoint SET enabled=$3,events=$4,
        current_secret_version_id=$5,updated_at=now() WHERE org_id=$1 AND id=$2
        RETURNING id,label,url,events,enabled,updated_at,destination_type`, [tenant.orgId, id, input.enabled ?? endpoint.enabled,
        input.events ? [...new Set(input.events)] : endpoint.events, versionId ?? endpoint.current_secret_version_id])).rows[0];
      return { ...row, ...(secret ? { secret: secret.toString("base64url") } : {}) };
    });
  } finally { secret?.fill(0); }
}

/** Deletes a destination (Settings → Developers): it stops for good, queued deliveries are dropped. Audited. */
export function deleteWebhookEndpoint(tenant: EvidenceScope, id: string) {
  return withTenant(tenant, async db => {
    const row = (await db.query(`UPDATE evals.webhook_endpoint SET archived_at=now(),enabled=false,updated_at=now()
      WHERE org_id=$1 AND id=$2 AND archived_at IS NULL RETURNING id,destination_type,archived_at`, [tenant.orgId, id])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,'destination.deleted',$3,$4)",
      [tenant.orgId, tenant.actorId, id, { type: row.destination_type }]);
    return { id: row.id, archived_at: row.archived_at };
  });
}

/* ------------------------------------------------------------------- queue --- */

/** Called in the same tenant transaction as the outcome, so retries never create extra events. Generic signed webhooks only. */
export async function queueWebhookEvent(db: PoolClient, orgId: string, eventId: string, eventKind: WebhookEventKind, payload: Record<string, unknown>) {
  const endpoints = (await db.query(`SELECT id,current_secret_version_id FROM evals.webhook_endpoint WHERE org_id=$1 AND enabled
    AND archived_at IS NULL AND destination_type='webhook' AND $2=ANY(events)`, [orgId, eventKind])).rows;
  const body = { event_id: eventId, event_kind: eventKind, ...payload }, hash = sha256(canonicalJson(body));
  for (const endpoint of endpoints) {
    await db.query(`INSERT INTO evals.webhook_delivery(org_id,endpoint_id,secret_version_id,event_id,event_kind,payload,payload_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(org_id,endpoint_id,event_id) DO NOTHING`,
    [orgId, endpoint.id, endpoint.current_secret_version_id, eventId, eventKind, body, hash]);
  }
}

/**
 * Queues a scheduled run's summary for the workspace's Slack, Teams and email
 * destinations that take this event (launch L-19), in the alert's transaction:
 * one delivery per destination and event, whatever the retries. Nothing while
 * INTEGRATIONS_V2_ENABLED is off.
 */
export async function queueSummaryDeliveries(db: PoolClient, orgId: string, eventId: string, eventKind: WebhookEventKind, summary: MonitoringSummary, env: Record<string, string | undefined> = process.env) {
  if (!integrationsV2Enabled(env)) return 0;
  const endpoints = (await db.query(`SELECT id,current_secret_version_id FROM evals.webhook_endpoint WHERE org_id=$1 AND enabled
    AND archived_at IS NULL AND destination_type IN ('slack','teams','email') AND $2=ANY(events)`, [orgId, eventKind])).rows;
  const body = { event_id: eventId, event_kind: eventKind, summary }, hash = sha256(canonicalJson(body));
  let queued = 0;
  for (const endpoint of endpoints) {
    queued += (await db.query(`INSERT INTO evals.webhook_delivery(org_id,endpoint_id,secret_version_id,event_id,event_kind,payload,payload_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(org_id,endpoint_id,event_id) DO NOTHING`,
    [orgId, endpoint.id, endpoint.current_secret_version_id, eventId, eventKind, body, hash])).rowCount ?? 0;
  }
  return queued;
}

/* ------------------------------------------------------------------- send --- */

export type PostOptions = { allowQuery?: boolean; lookup?: Lookup };
/** One POST of a JSON body to a validated public HTTPS address, the socket pinned to the address checked. Redirects are not followed. */
export async function postWebhook(url: string, body: string, headers: Record<string, string>, options: PostOptions = {}): Promise<number> {
  const destination = await validatePublicDestination(url, options.lookup, { allowQuery: options.allowQuery });
  return new Promise((resolve, reject) => {
    const req = https.request(destination.url, {
      method: "POST", agent: false, timeout: CUSTOMER_API_LIMITS.webhookTimeoutSeconds * 1000,
      lookup: pinnedLookup(destination),
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...headers },
    }, response => {
      response.resume(); response.on("end", () => resolve(response.statusCode ?? 0));
    });
    req.on("timeout", () => req.destroy(new Error("webhook_timeout"))); req.on("error", reject); req.end(body);
  });
}

export interface DeliveryDeps {
  /** Sends an email destination's message (the scheduler's Resend sender). Without it, email deliveries wait. */
  send?: SendEmail | null;
  post?: typeof postWebhook;
  env?: Record<string, string | undefined>;
}

type Outcome = { status: number; reason: string | null };
const httpOutcome = (status: number): Outcome => ({ status, reason: status >= 200 && status < 300 ? null : status >= 300 && status < 400 ? "redirect_rejected" : "http_error" });
const failure = (error: unknown): Outcome => ({ status: 0, reason: error instanceof Error && error.message.startsWith("destination_") ? "destination_denied" : error instanceof Error && error.message === "email_unavailable" ? "email_unavailable" : "delivery_error" });

/** Sends one formatted message, in the destination's language, to a Slack, Teams or email destination. */
async function sendMessage(type: Exclude<DestinationType, "webhook">, credential: string, content: DestinationContent, locale: EmailLocale, key: string, deps: DeliveryDeps): Promise<Outcome> {
  const post = deps.post ?? postWebhook;
  try {
    if (type === "slack") return httpOutcome(await post(credential, JSON.stringify(slackPayload(destinationMessage(content, locale))), {}));
    if (type === "teams") return httpOutcome(await post(credential, JSON.stringify(teamsPayload(destinationMessage(content, locale))), {}, { allowQuery: true }));
    if (!deps.send) throw new Error("email_unavailable");
    const email = renderEmail("monitor_summary", locale, content);
    await deps.send({ to: credential, subject: email.subject, text: email.text, html: email.html, idempotencyKey: key });
    return { status: 200, reason: null };
  } catch (error) { return failure(error); }
}

/** The workspace's name: read directly by its members (a test send), through billing.workspace_label by the scheduler. */
async function workspaceLabel(tenant: EvidenceScope) {
  return withTenant(tenant, async db => {
    const own = (await db.query("SELECT name FROM evals.workspace WHERE id=$1", [tenant.orgId])).rows[0]?.name;
    if (own) return String(own);
    return String((await db.query("SELECT billing.workspace_label($1) AS name", [tenant.orgId])).rows[0]?.name ?? "Caudals");
  });
}

export async function tickWebhookDeliveries(tenant: EvidenceScope, keys: Keyring, deps: DeliveryDeps = {}) {
  const claimed = await withTenant(tenant, async db => {
    await db.query(`UPDATE evals.webhook_delivery SET status='failed',reason_code='retry_limit',lease_until=NULL,
      updated_at=now() WHERE org_id=$1 AND status IN ('queued','retry','sending') AND attempt_count>=5
      AND (status<>'sending' OR lease_until<now())`, [tenant.orgId]);
    const rows = (await db.query(`SELECT d.*,e.url,e.enabled,e.destination_type,e.locale,sv.envelope FROM evals.webhook_delivery d
      JOIN evals.webhook_endpoint e ON (e.org_id,e.id)=(d.org_id,d.endpoint_id)
      JOIN evals.webhook_secret_version sv ON (sv.org_id,sv.id)=(d.org_id,d.secret_version_id)
      WHERE d.org_id=$1 AND d.status IN ('queued','retry','sending')
      AND d.attempt_count<5
      AND (d.status<>'sending' OR d.lease_until<now()) AND d.next_attempt_at<=now()
      ORDER BY d.next_attempt_at,d.id LIMIT 10 FOR UPDATE OF d SKIP LOCKED`, [tenant.orgId])).rows;
    for (const row of rows) await db.query("UPDATE evals.webhook_delivery SET status='sending',attempt_count=attempt_count+1,lease_until=now()+interval '30 seconds',updated_at=now() WHERE org_id=$1 AND id=$2", [tenant.orgId, row.id]);
    return rows;
  });
  let workspace: string | null = null;
  for (const row of claimed) {
    let outcome: Outcome = { status: 0, reason: null };
    if (!row.enabled) outcome = { status: 0, reason: "endpoint_disabled" };
    else {
      let secret: Buffer | undefined;
      try {
        secret = decryptSecret(row.envelope, scope(tenant.orgId, row.endpoint_id, row.secret_version_id), keys);
        if (row.destination_type === "webhook" || !row.destination_type) {
          const body = canonicalJson(row.payload), timestamp = new Date().toISOString();
          outcome = httpOutcome(await (deps.post ?? postWebhook)(row.url, body, {
            [WEBHOOK_HEADERS.id]: row.id, [WEBHOOK_HEADERS.timestamp]: timestamp,
            [WEBHOOK_HEADERS.signature]: createWebhookSignature(secret, row.id, timestamp, body),
          }));
        } else {
          workspace ??= await workspaceLabel(tenant);
          const language: EmailLocale = row.locale === "es" ? "es" : "en";
          const content: DestinationContent = { summary: row.payload.summary as MonitoringSummary, appUrl: emailAppUrl(deps.env ?? process.env), orgId: tenant.orgId, workspace };
          outcome = await sendMessage(row.destination_type, secret.toString("utf8"), content, language, `destination:${row.id}`, deps);
        }
      } catch (error) { outcome = failure(error); } finally { secret?.fill(0); }
    }
    await withTenant(tenant, async db => {
      const retry = outcome.reason && row.enabled && row.attempt_count + 1 < 5;
      await db.query(`UPDATE evals.webhook_delivery SET status=$3,reason_code=$4,last_http_status=$5,
        next_attempt_at=CASE WHEN $6 THEN now()+($7::int*interval '1 minute') ELSE next_attempt_at END,
        delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END,
        lease_until=NULL,updated_at=now() WHERE org_id=$1 AND id=$2`,
      [tenant.orgId, row.id, outcome.reason ? (retry ? "retry" : "failed") : "delivered", outcome.reason, outcome.status || null, retry, 2 ** row.attempt_count]);
    });
  }
  return claimed.length;
}

/* -------------------------------------------------------------- test send --- */

export interface TestDeps extends DeliveryDeps {
  limit?: (input: { key: string; limit: number; windowMs: number }) => Promise<RateLimitResult>;
  keys?: Keyring;
}

/**
 * "Send test" (launch L-19): sends an example alert, clearly labelled, to a
 * Slack, Teams or email destination now and records the result on it. At
 * most five a destination per hour. Audited (`destination.tested`).
 */
export async function testWebhookEndpoint(tenant: EvidenceScope, id: string, deps: TestDeps = {}) {
  if (!integrationsV2Enabled(deps.env)) throw new EvalError("SCOPE_DENIED", 404);
  const endpoint = await withTenant(tenant, async db => (await db.query(`SELECT e.id,e.destination_type,e.locale,e.current_secret_version_id,sv.envelope
    FROM evals.webhook_endpoint e JOIN evals.webhook_secret_version sv ON (sv.org_id,sv.id)=(e.org_id,e.current_secret_version_id)
    WHERE e.org_id=$1 AND e.id=$2 AND e.archived_at IS NULL`, [tenant.orgId, id])).rows[0]);
  if (!endpoint) throw new EvalError("SCOPE_DENIED", 404);
  if (endpoint.destination_type === "webhook") throw new EvalError("INPUT_INVALID", 422, "Signed webhooks receive real events only.");
  const limit = deps.limit ?? (await import("@/lib/security/rate-limit")).consumeRateLimit;
  const allowed = await limit({ key: `destination-test:${id}`, limit: CUSTOMER_API_LIMITS.destinationTestsPerHour, windowMs: 3_600_000 });
  if (!allowed.allowed) throw new EvalError("RATE_LIMITED", 429, `Too many test messages. Try again in ${Math.ceil(allowed.retryAfterSeconds / 60)} minutes.`);
  const keys = deps.keys ?? secretConfig().keys;
  const language: EmailLocale = endpoint.locale === "es" ? "es" : "en";
  let secret: Buffer | undefined, outcome: Outcome;
  try {
    secret = decryptSecret(endpoint.envelope, scope(tenant.orgId, id, endpoint.current_secret_version_id), keys);
    const content: DestinationContent = { test: true, appUrl: emailAppUrl(deps.env ?? process.env), orgId: tenant.orgId, workspace: await workspaceLabel(tenant) };
    outcome = await sendMessage(endpoint.destination_type, secret.toString("utf8"), content, language, `destination-test:${id}:${randomUUID()}`, deps);
  } catch (error) { outcome = failure(error); } finally { secret?.fill(0); }
  const status = outcome.reason ? "failed" as const : "delivered" as const;
  return withTenant(tenant, async db => {
    const row = (await db.query(`UPDATE evals.webhook_endpoint SET last_test_at=now(),last_test_status=$3,last_test_reason=$4,last_test_http_status=$5
      WHERE org_id=$1 AND id=$2 RETURNING id,last_test_at,last_test_status,last_test_reason,last_test_http_status`,
    [tenant.orgId, id, status, outcome.reason, outcome.status || null])).rows[0];
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,'destination.tested',$3,$4)",
      [tenant.orgId, tenant.actorId, id, { type: endpoint.destination_type, status, reason: outcome.reason, http_status: outcome.status || null }]);
    return row;
  });
}
