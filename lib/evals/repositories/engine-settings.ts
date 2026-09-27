import "server-only";
import { lookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { z } from "zod";
import { EvalError } from "../domain/errors";
import type { EvalIdentity } from "../domain/identity";
import { publicAddress } from "../providers/openai-compatible";
import { encryptSecret, decryptSecret, loadKeyring } from "../security/envelope";
import { connectionSecretScope } from "../security/secrets";
import { asAdmin, requirePlatformAdmin, requireRecentAuthentication } from "./platform";

/**
 * Settings → AI models: which model runs each internal engine role
 * (reading sources, drafting tests, grading, writing report takeaways).
 *
 * A "connection" is a funded provider account plus its endpoint and
 * write-only key: the private DGX Spark or any OpenAI-compatible API.
 * Choosing a model registers (or reuses) an immutable provider revision and a
 * price revision, then points the platform default or one workspace at it.
 * Nothing here returns a key; the DGX address never reaches the browser.
 */

export const ENGINE_ROLES = ["context_analyzer", "generator", "judge", "report_writer"] as const;
export type EngineRoleName = (typeof ENGINE_ROLES)[number];
const DATA_CLASSES = ["customer_confidential", "public", "synthetic"];
const ROUTE_DATA_CLASS = "customer_confidential";
const DGX_REGION = "private_wireguard";
const API_REGION = "external_api";
const DGX_CONTEXT_CAP = 131_072;
const PRICE = z.string().trim().regex(/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/);

type Connection = {
  id: string;
  name: string;
  adapter: "dgx" | "openai_compatible";
  host: string;
  key_hint: string | null;
  enabled: boolean;
  has_key: boolean;
};
type RouteRow = {
  role: EngineRoleName;
  provider_revision_id: string;
  model_id: string;
  adapter: string;
  account_id: string;
  account_name: string;
  context_limit: number;
  input_price: string;
  output_price: string;
  currency: string;
  updated_at: string;
  usable: boolean;
};

function dgxEndpoint(): string | null {
  const file = process.env.EVALS_DGX_ENDPOINT_FILE;
  if (!file) return null;
  try {
    return new URL(readFileSync(file, "utf8").trim()).href;
  } catch {
    return null;
  }
}

function keyring() {
  const file = process.env.EVALS_MASTER_KEYRING_FILE;
  if (!file) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Secret storage is not configured.");
  const keys = loadKeyring(file);
  const version = process.env.EVALS_MASTER_KEY_VERSION && keys.has(process.env.EVALS_MASTER_KEY_VERSION) ? process.env.EVALS_MASTER_KEY_VERSION : [...keys.keys()].sort().at(-1)!;
  return { keys, version };
}

async function audit(c: PoolClient, orgId: string, actorId: string, action: string, subjectId: string) {
  await c.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,$3,$4)", [orgId, actorId, action, subjectId]);
}

const ROUTE_SELECT = (table: string, where: string) => `SELECT r.role,r.provider_revision_id,p.model_id,p.adapter,p.account_id,a.name AS account_name,p.context_limit,
    pr.input_price::text AS input_price,pr.output_price::text AS output_price,pr.currency,r.updated_at,
    (a.enabled AND (p.retired_at IS NULL OR p.retired_at>now())) AS usable
  FROM ${table} r JOIN evals.provider_revision p ON p.id=r.provider_revision_id
  JOIN evals.provider_account a ON a.id=p.account_id
  JOIN evals.price_revision pr ON pr.id=r.price_revision_id ${where} ORDER BY r.role`;

// --------------------------------------------------------------------- read

export async function getEngineSettings(identity: EvalIdentity, orgId: string) {
  requirePlatformAdmin(identity);
  return asAdmin({ orgId, actorId: identity.user.id }, async (c) => {
    const connections = (await c.query(`SELECT a.id,a.name,c.adapter,a.enabled,c.key_hint,(c.envelope IS NOT NULL) AS has_key,
        CASE WHEN c.adapter='dgx' THEN 'DGX Spark (private network)' ELSE split_part(split_part(c.endpoint,'://',2),'/',1) END AS host
      FROM evals.provider_connection c JOIN evals.provider_account a ON a.id=c.account_id
      WHERE a.enabled ORDER BY (c.adapter='dgx') DESC,a.created_at`)).rows as Connection[];
    const platform = (await c.query(ROUTE_SELECT("evals.platform_model_route", ""))).rows as RouteRow[];
    const workspace = (await c.query(ROUTE_SELECT("evals.generation_provider_route", "WHERE r.org_id=$1"), [orgId])).rows as RouteRow[];
    const dgx = dgxEndpoint();
    return {
      roles: ENGINE_ROLES,
      dgxAvailable: !!dgx,
      // The DGX appears even before its first use; it is created on first selection.
      connections: dgx && !connections.some((item) => item.adapter === "dgx")
        ? [{ id: "dgx", name: "DGX Spark", adapter: "dgx" as const, host: "DGX Spark (private network)", key_hint: null, enabled: true, has_key: false }, ...connections]
        : connections,
      platform,
      workspace,
    };
  });
}

/** Live model list for one connection: Ollama tags on the DGX, `/models` on an API. */
export async function listConnectionModels(identity: EvalIdentity, orgId: string, connectionId: string) {
  requirePlatformAdmin(identity);
  const target = await connectionTarget(identity, orgId, connectionId);
  try {
    if (target.adapter === "dgx") {
      const root = target.endpoint.replace(/\/v1\/?$/, "");
      const body = await fetchJson(`${root}/api/tags`, {}, 8_000);
      const models = z.object({ models: z.array(z.object({ name: z.string(), size: z.number().optional(), details: z.object({ parameter_size: z.string().optional(), family: z.string().optional() }).partial().optional() })) }).parse(body).models;
      return models
        .filter((model) => !/embed/i.test(model.name))
        .map((model) => ({ id: model.name, label: model.name, detail: [model.details?.parameter_size, model.details?.family].filter(Boolean).join(" · ") || null }))
        .sort((a, b) => a.id.localeCompare(b.id));
    }
    const body = await fetchJson(`${target.endpoint.replace(/\/$/, "")}/models`, target.key ? { authorization: `Bearer ${target.key}` } : {}, 10_000, true);
    const parsed = z.object({ data: z.array(z.object({ id: z.string().max(200), context_length: z.number().optional(), owned_by: z.string().optional() }).passthrough()).max(2000) }).parse(body);
    return parsed.data
      .map((model) => ({ id: model.id, label: model.id, detail: model.context_length ? `${Math.round(model.context_length / 1000)}k context` : model.owned_by ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    if (error instanceof EvalError) throw error;
    throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Could not list models from this provider. Check the address and key, then try again.");
  } finally {
    target.key = undefined;
  }
}

// -------------------------------------------------------------------- write

const connectionSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  endpoint: z.url().max(500),
  apiKey: z.string().trim().min(8).max(8192).optional(),
});

/** Add an OpenAI-compatible provider (OpenAI, Anthropic, Mistral, OpenRouter, Groq, …). */
export async function addProviderConnection(identity: EvalIdentity, orgId: string, raw: unknown) {
  requireRecentAuthentication(identity);
  const input = connectionSchema.parse(raw);
  const url = new URL(input.endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new EvalError("INPUT_INVALID", 422, "Use the provider's HTTPS API base address, for example https://api.openai.com/v1.");
  await assertPublicHost(url.hostname);
  const { keys, version } = keyring();
  return asAdmin({ orgId, actorId: identity.user.id }, async (c) => {
    const account = (await c.query("INSERT INTO evals.provider_account(name,currency,ceiling,enabled) VALUES($1,'EUR',1000,true) RETURNING id", [input.name])).rows[0].id as string;
    const value = input.apiKey ? Buffer.from(input.apiKey, "utf8") : null;
    try {
      await c.query("INSERT INTO evals.provider_connection(account_id,adapter,endpoint,envelope,key_hint,created_by) VALUES($1,'openai_compatible',$2,$3,$4,$5)", [
        account, url.href.replace(/\/$/, ""), value ? encryptSecret(value, connectionSecretScope(account), version, keys) : null, input.apiKey ? `…${input.apiKey.slice(-4)}` : null, identity.user.id,
      ]);
    } finally {
      value?.fill(0);
    }
    await audit(c, orgId, identity.user.id, "provider.connection.created", account);
    return { id: account };
  });
}

/** Replace a provider's key or name. The old envelope is overwritten, never returned. */
export async function updateProviderConnection(identity: EvalIdentity, orgId: string, accountId: string, raw: unknown) {
  requireRecentAuthentication(identity);
  const input = z.strictObject({ name: z.string().trim().min(1).max(120).optional(), apiKey: z.string().trim().min(8).max(8192).optional() }).parse(raw);
  const { keys, version } = keyring();
  return asAdmin({ orgId, actorId: identity.user.id }, async (c) => {
    const row = (await c.query("SELECT adapter FROM evals.provider_connection WHERE account_id=$1", [accountId])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    if (input.name) await c.query("UPDATE evals.provider_account SET name=$2 WHERE id=$1", [accountId, input.name]);
    if (input.apiKey) {
      if (row.adapter === "dgx") throw new EvalError("INPUT_INVALID", 422, "The DGX Spark does not use a key.");
      const value = Buffer.from(input.apiKey, "utf8");
      try {
        await c.query("UPDATE evals.provider_connection SET envelope=$2,key_hint=$3,updated_at=now() WHERE account_id=$1", [accountId, encryptSecret(value, connectionSecretScope(accountId), version, keys), `…${input.apiKey.slice(-4)}`]);
      } finally {
        value.fill(0);
      }
      await c.query("UPDATE evals.provider_health SET state='unprobed',circuit_until=NULL WHERE provider_revision_id IN (SELECT id FROM evals.provider_revision WHERE account_id=$1)", [accountId]);
    }
    await audit(c, orgId, identity.user.id, "provider.connection.updated", accountId);
    return { id: accountId };
  });
}

/**
 * Remove a provider: disable its account, retire its models and delete the key.
 * Routes that pointed at it stop resolving, so those roles fall back to the
 * platform default (or ask for a model). Past runs keep their evidence.
 */
export async function removeProviderConnection(identity: EvalIdentity, orgId: string, accountId: string) {
  requireRecentAuthentication(identity);
  return asAdmin({ orgId, actorId: identity.user.id }, async (c) => {
    const row = (await c.query("SELECT account_id FROM evals.provider_connection WHERE account_id=$1", [accountId])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    await c.query("DELETE FROM evals.platform_model_route WHERE provider_revision_id IN (SELECT id FROM evals.provider_revision WHERE account_id=$1)", [accountId]);
    await c.query("UPDATE evals.provider_revision SET retired_at=now() WHERE account_id=$1 AND retired_at IS NULL", [accountId]);
    await c.query("UPDATE evals.provider_account SET enabled=false WHERE id=$1", [accountId]);
    await c.query("DELETE FROM evals.provider_connection WHERE account_id=$1", [accountId]);
    await audit(c, orgId, identity.user.id, "provider.connection.removed", accountId);
    return { id: accountId };
  });
}

const routeSchema = z.strictObject({
  scope: z.enum(["platform", "workspace"]),
  role: z.enum(ENGINE_ROLES),
  connectionId: z.string().min(1).max(64),
  modelId: z.string().trim().min(1).max(200),
  /** EUR per million tokens; zero on the DGX. */
  inputPrice: PRICE.default("0"),
  outputPrice: PRICE.default("0"),
  contextLimit: z.number().int().min(4096).max(2_000_000).optional(),
  /** Also use this model for every other role at the same scope. */
  allRoles: z.boolean().default(false),
});

/** Point one role (or all roles) at a model, registering its revision on first use. */
export async function setEngineRoute(identity: EvalIdentity, orgId: string, raw: unknown) {
  requireRecentAuthentication(identity, 60);
  const input = routeSchema.parse(raw);
  const target = await connectionTarget(identity, orgId, input.connectionId, false);
  const contextLimit = input.contextLimit ?? (target.adapter === "dgx" ? await dgxContextLimit(target.endpoint, input.modelId) : 128_000);
  return asAdmin({ orgId, actorId: identity.user.id }, async (c) => {
    const accountId = target.accountId ?? await ensureDgxConnection(c, identity.user.id, target.endpoint);
    const revision = await ensureRevision(c, identity.user.id, { accountId, adapter: target.adapter, endpoint: target.endpoint, modelId: input.modelId, contextLimit });
    const price = await ensurePrice(c, revision, target.adapter === "dgx" ? "0" : input.inputPrice, target.adapter === "dgx" ? "0" : input.outputPrice);
    const region = target.adapter === "dgx" ? DGX_REGION : API_REGION;
    const cost = target.adapter === "dgx" ? "0.0001" : "0";
    const roles = input.allRoles ? [...ENGINE_ROLES] : [input.role];
    for (const role of roles) {
      if (input.scope === "platform") {
        await c.query(`INSERT INTO evals.platform_model_route(role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(role) DO UPDATE SET provider_revision_id=excluded.provider_revision_id,price_revision_id=excluded.price_revision_id,
          data_class=excluded.data_class,region=excluded.region,internal_cost_per_second=excluded.internal_cost_per_second,updated_by=excluded.updated_by,updated_at=now()`,
        [role, revision, price, ROUTE_DATA_CLASS, region, cost, identity.user.id]);
      } else {
        await c.query(`INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(org_id,role) DO UPDATE SET provider_revision_id=excluded.provider_revision_id,price_revision_id=excluded.price_revision_id,
          data_class=excluded.data_class,region=excluded.region,internal_cost_per_second=excluded.internal_cost_per_second,updated_by=excluded.updated_by,updated_at=now()`,
        [orgId, role, revision, price, ROUTE_DATA_CLASS, region, cost, identity.user.id]);
      }
    }
    await audit(c, orgId, identity.user.id, `engine.route.${input.scope}`, revision);
    return { providerRevisionId: revision, roles, scope: input.scope };
  });
}

/** A workspace goes back to the platform default for one role (or all). */
export async function clearWorkspaceRoute(identity: EvalIdentity, orgId: string, role: EngineRoleName | "all") {
  requireRecentAuthentication(identity, 60);
  return asAdmin({ orgId, actorId: identity.user.id }, async (c) => {
    await c.query("DELETE FROM evals.generation_provider_route WHERE org_id=$1 AND ($2='all' OR role=$2)", [orgId, role]);
    await audit(c, orgId, identity.user.id, "engine.route.workspace_cleared", orgId);
    return { role };
  });
}

/** One tiny completion straight from the web process, to check address, key and model. */
export async function testConnection(identity: EvalIdentity, orgId: string, raw: unknown) {
  requirePlatformAdmin(identity);
  const input = z.strictObject({ connectionId: z.string().min(1).max(64), modelId: z.string().trim().min(1).max(200) }).parse(raw);
  const target = await connectionTarget(identity, orgId, input.connectionId);
  const started = Date.now();
  try {
    const openai = new URL(target.endpoint).hostname === "api.openai.com";
    const body = await fetchJson(`${target.endpoint.replace(/\/$/, "")}/chat/completions`, {
      "content-type": "application/json",
      ...(target.key ? { authorization: `Bearer ${target.key}` } : {}),
    }, 90_000, target.adapter !== "dgx", JSON.stringify({
      model: input.modelId,
      messages: [{ role: "user", content: 'Return the JSON object {"ok":true} and nothing else.' }],
      stream: false,
      response_format: { type: "json_object" },
      ...(openai ? { max_completion_tokens: 64 } : { max_tokens: 64, temperature: 0 }),
    }));
    const parsed = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional() }) })).min(1) }).safeParse(body);
    if (!parsed.success) {
      const message = z.object({ error: z.object({ message: z.string() }) }).safeParse(body);
      return { ok: false, latencyMs: Date.now() - started, message: message.success ? message.data.error.message.slice(0, 300) : "The provider answered in an unexpected format." };
    }
    const text = parsed.data.choices[0].message.content ?? "";
    let json = false;
    try {
      json = typeof JSON.parse(text) === "object";
    } catch {
      json = false;
    }
    return { ok: true, latencyMs: Date.now() - started, json, message: json ? "The model answered with valid JSON." : "The model answered, but not with clean JSON; generation may need retries." };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, message: error instanceof EvalError ? error.message : "The provider did not answer. Check the address, key and model name." };
  } finally {
    target.key = undefined;
  }
}

// ------------------------------------------------------------------ helpers

type Target = { accountId: string | null; adapter: "dgx" | "openai_compatible"; endpoint: string; key?: string };

async function connectionTarget(identity: EvalIdentity, orgId: string, connectionId: string, withKey = true): Promise<Target> {
  const dgx = dgxEndpoint();
  if (connectionId === "dgx") {
    if (!dgx) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "The DGX Spark is not connected in this environment.");
    return { accountId: null, adapter: "dgx", endpoint: dgx };
  }
  if (!z.uuid().safeParse(connectionId).success) throw new EvalError("SCOPE_DENIED", 404);
  const row = await asAdmin({ orgId, actorId: identity.user.id }, async (c) =>
    (await c.query("SELECT c.account_id,c.adapter,c.endpoint,c.envelope FROM evals.provider_connection c JOIN evals.provider_account a ON a.id=c.account_id WHERE c.account_id=$1 AND a.enabled", [connectionId])).rows[0]);
  if (!row) throw new EvalError("SCOPE_DENIED", 404);
  if (row.adapter === "dgx") {
    if (!dgx) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "The DGX Spark is not connected in this environment.");
    return { accountId: row.account_id, adapter: "dgx", endpoint: dgx };
  }
  let key: string | undefined;
  if (withKey && row.envelope) {
    const bytes = decryptSecret(row.envelope, connectionSecretScope(row.account_id), keyring().keys);
    key = bytes.toString("utf8");
    bytes.fill(0);
  }
  return { accountId: row.account_id, adapter: "openai_compatible", endpoint: row.endpoint, key };
}

async function ensureDgxConnection(c: PoolClient, actorId: string, endpoint: string): Promise<string> {
  const existing = (await c.query("SELECT c.account_id FROM evals.provider_connection c JOIN evals.provider_account a ON a.id=c.account_id WHERE c.adapter='dgx' AND a.enabled LIMIT 1")).rows[0];
  if (existing) return existing.account_id;
  const account = (await c.query("INSERT INTO evals.provider_account(name,currency,ceiling,enabled) VALUES('DGX Spark','EUR',100000,true) RETURNING id")).rows[0].id as string;
  await c.query("INSERT INTO evals.provider_connection(account_id,adapter,endpoint,created_by) VALUES($1,'dgx',$2,$3)", [account, endpoint, actorId]);
  return account;
}

async function ensureRevision(c: PoolClient, actorId: string, input: { accountId: string; adapter: "dgx" | "openai_compatible"; endpoint: string; modelId: string; contextLimit: number }): Promise<string> {
  const existing = (await c.query(`SELECT id FROM evals.provider_revision WHERE account_id=$1 AND adapter=$2 AND endpoint=$3 AND model_id=$4 AND context_limit=$5
      AND retired_at IS NULL AND roles @> $6::text[] AND data_classes @> $7::text[] AND (capabilities->>'jsonObject')::boolean AND (capabilities->>'boundedTokens')::boolean
    ORDER BY created_at DESC LIMIT 1`, [input.accountId, input.adapter, input.endpoint, input.modelId, input.contextLimit, [...ENGINE_ROLES], [ROUTE_DATA_CLASS]])).rows[0];
  if (existing) return existing.id;
  const dgx = input.adapter === "dgx";
  const id = (await c.query(`INSERT INTO evals.provider_revision(account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,concurrency_limit,rpm,tpm)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, [
    input.accountId, input.adapter, input.endpoint, input.modelId, actorId, [...ENGINE_ROLES],
    { text: true, boundedTokens: true, jsonObject: true, probeApproved: false },
    input.contextLimit, 8192, DATA_CLASSES, [dgx ? DGX_REGION : API_REGION], dgx ? 1 : 4, dgx ? 30 : 120, input.contextLimit * (dgx ? 20 : 40),
  ])).rows[0].id as string;
  await c.query("INSERT INTO evals.provider_health(provider_revision_id,state) VALUES($1,'unprobed') ON CONFLICT DO NOTHING", [id]);
  return id;
}

async function ensurePrice(c: PoolClient, revisionId: string, perMillionInput: string, perMillionOutput: string): Promise<string> {
  const input = perToken(perMillionInput), output = perToken(perMillionOutput);
  const existing = (await c.query(`SELECT id FROM evals.price_revision WHERE provider_revision_id=$1 AND effective_at<=now() AND input_price=$2::numeric AND output_price=$3::numeric
    ORDER BY effective_at DESC LIMIT 1`, [revisionId, input, output])).rows[0];
  if (existing) return existing.id;
  return (await c.query(`INSERT INTO evals.price_revision(provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source)
    VALUES($1,'EUR',now()-interval '1 second','token',$2,$3,0,0,1000,'Operator-entered in Settings → AI models') RETURNING id`, [revisionId, input, output])).rows[0].id as string;
}

/** EUR per million tokens → EUR per token, exact to nine decimals (the column scale). */
function perToken(perMillion: string) {
  const [whole, fraction = ""] = perMillion.split(".");
  const micro = BigInt(whole) * BigInt(1_000_000) + BigInt((fraction + "000000").slice(0, 6));
  // micro-EUR per million tokens == pico-EUR per token; round up to nano-EUR.
  const nano = (micro + BigInt(999)) / BigInt(1000);
  const text = nano.toString().padStart(10, "0");
  return `${text.slice(0, -9)}.${text.slice(-9)}`;
}

async function dgxContextLimit(endpoint: string, modelId: string) {
  try {
    const root = endpoint.replace(/\/v1\/?$/, "");
    const body = await fetchJson(`${root}/api/show`, { "content-type": "application/json" }, 8_000, false, JSON.stringify({ model: modelId }));
    const info = z.object({ model_info: z.record(z.string(), z.unknown()) }).parse(body).model_info;
    const length = Object.entries(info).find(([name]) => name.endsWith(".context_length"))?.[1];
    return typeof length === "number" && length >= 4096 ? Math.min(length, DGX_CONTEXT_CAP) : 32_768;
  } catch {
    return 32_768;
  }
}

async function assertPublicHost(hostname: string) {
  const addresses = await lookup(hostname.replace(/^\[|\]$/g, ""), { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((item) => !publicAddress(item.address))) {
    throw new EvalError("INPUT_INVALID", 422, "That address does not resolve to a public HTTPS API.");
  }
}

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs: number, requirePublic = false, body?: string): Promise<unknown> {
  if (requirePublic) await assertPublicHost(new URL(url).hostname);
  const response = await fetch(url, { method: body ? "POST" : "GET", headers, body, redirect: "error", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message = z.object({ error: z.union([z.string(), z.object({ message: z.string() })]) }).safeParse(parsed);
    const detail = message.success ? (typeof message.data.error === "string" ? message.data.error : message.data.error.message) : null;
    const hint = response.status === 401 || response.status === 403 ? "The provider rejected the key." : response.status === 404 ? "The provider does not know that address or model." : `The provider answered ${response.status}.`;
    throw new EvalError("PROVIDER_UNAVAILABLE", 503, detail ? `${hint} ${detail.slice(0, 200)}` : hint);
  }
  return parsed;
}
