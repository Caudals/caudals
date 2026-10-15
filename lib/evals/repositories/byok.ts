import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EvalError } from "../domain/errors";
import { requireRecentSignIn, requireWorkspace, type EvalIdentity } from "../domain/identity";
import { encryptSecret, loadKeyring } from "../security/envelope";
import { customerKeySecretScope } from "../security/secrets";
import { checkProviderKey, KeyCheckFailed, providerKeySchema, type CheckOptions } from "../providers/byok";
import { BYOK_PROVIDERS, BYOK_PROVIDER_LABELS, BYOK_ROLES, type ByokKeyState, type ByokProvider, type ByokRole } from "../byok/shared";
import { resumeKeyPausedWork } from "../queue/credit-pause";
import { withTenant } from "./db";

/**
 * Settings → AI models for workspace owners: bring your own provider key
 * (BYOK, launch L-27, spec v2 §6.11, D-11).
 *
 * - Who: owners (and platform admins for support) of a workspace on a paid
 *   plan (pay as you go, managed, partner). Free workspaces keep rejecting
 *   external API models. Behind BYOK_ENABLED / BYOK_WORKSPACE_IDS.
 * - The key is checked with the provider's free calls, encrypted here and
 *   saved through evals.byok_connect. It is write-only: no API returns it or
 *   any part of it, and only the inference worker can decrypt it, for this
 *   workspace's own calls (row-level security, envelope bound to the
 *   workspace, account and key version).
 * - Adding or replacing a key needs a sign-in from the last 15 minutes
 *   (L-08). Removing one never does: anyone who may add a key may remove it
 *   at once, even after the flag is switched off.
 * - No token credits on calls with the key (the revision is free in the
 *   price book's eyes); platform fees still apply.
 */

type Env = Record<string, string | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workspaces opened to BYOK before BYOK_ENABLED (design partners first). */
export function byokWorkspaceIds(env: Env = process.env): Set<string> {
  return new Set((env.BYOK_WORKSPACE_IDS ?? "").split(",").map((id) => id.trim().toLowerCase()).filter((id) => UUID.test(id)));
}
/** BYOK_ENABLED=true opens it to every eligible workspace; otherwise only the listed ones. Read at request time. */
export function byokEnabledFor(orgId: string, env: Env = process.env): boolean {
  return env.BYOK_ENABLED?.trim() === "true" || byokWorkspaceIds(env).has(orgId.toLowerCase());
}
/** Whether any workspace may see the screens (a hint for the settings page; the API decides per workspace). */
export function byokConfigured(env: Env = process.env): boolean {
  return env.BYOK_ENABLED?.trim() === "true" || byokWorkspaceIds(env).size > 0;
}

function keyring() {
  const file = process.env.EVALS_MASTER_KEYRING_FILE;
  if (!file) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Secret storage is not configured.");
  const keys = loadKeyring(file);
  const version = process.env.EVALS_MASTER_KEY_VERSION && keys.has(process.env.EVALS_MASTER_KEY_VERSION) ? process.env.EVALS_MASTER_KEY_VERSION : [...keys.keys()].sort().at(-1)!;
  return { keys, version };
}

const DATABASE_ERRORS: Record<string, () => EvalError> = {
  BYOK_EXISTS: () => new EvalError("CONFLICT", 409, "A key for this provider is already connected. Replace it instead."),
  BYOK_PLAN_REQUIRED: () => new EvalError("BYOK_PLAN_REQUIRED", 403, "Your own model keys are available on pay as you go and managed plans."),
  BYOK_OWNER_REQUIRED: () => new EvalError("SCOPE_DENIED", 404),
  BYOK_SCOPE_DENIED: () => new EvalError("SCOPE_DENIED", 404),
  BYOK_NOT_FOUND: () => new EvalError("SCOPE_DENIED", 404),
  BYOK_MODEL_UNKNOWN: () => new EvalError("INPUT_INVALID", 422, "That model is not available with this key. Choose one from the list."),
};
function databaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (DATABASE_ERRORS[message]) throw DATABASE_ERRORS[message]();
  throw error;
}

export type ByokConnection = {
  id: string; provider: ByokProvider; label: string; state: ByokKeyState; checkedAt: string | null; models: string[];
  createdAt: string; rotatedAt: string | null; revokedAt: string | null;
};
export type ByokRoute = { role: ByokRole; connectionId: string; provider: ByokProvider; modelId: string; webResearch: boolean; updatedAt: string };
export type ByokSettings = {
  /** Whether keys can be added here now (flag, plan). Removing is always possible. */
  available: boolean; plan: string | null; roles: readonly ByokRole[]; providers: Array<{ id: ByokProvider; label: string }>;
  connections: ByokConnection[]; routes: ByokRoute[];
};

type Access = { plan: string | null; enabled: boolean };
/** BYOK is off for the workspace and no key is left: nothing to show (GET answers `null`, every other route 404). */
class ByokClosed extends EvalError {
  constructor() { super("SCOPE_DENIED", 404); this.name = "ByokClosed"; }
}
/**
 * Owners and platform admins of a live workspace. While BYOK is off for the
 * workspace the screens answer 404, except where the workspace still has a
 * key: its owner can always see and remove it.
 */
async function access(identity: EvalIdentity, orgId: string, env: Env): Promise<Access> {
  if (!UUID.test(orgId)) throw new EvalError("SCOPE_DENIED", 404);
  const admin = identity.platformRole === "platform_admin";
  const role = identity.workspaces.find((workspace) => workspace.id === orgId)?.role ?? null;
  if (!admin && role !== "owner") throw new EvalError("SCOPE_DENIED", 404);
  await requireWorkspace(identity, orgId, "read");
  const enabled = byokEnabledFor(orgId, env);
  return withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    const plan = ((await db.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [orgId])).rows[0]?.plan as string | undefined) ?? null;
    if (!enabled) {
      const live = (await db.query("SELECT 1 FROM evals.byok_connections($1) WHERE revoked_at IS NULL", [orgId]).catch(databaseError)).rowCount;
      if (!live) throw new ByokClosed();
    }
    return { plan, enabled };
  });
}
/** Adding a key or choosing a model: the flag, a paid plan and, for keys, a recent sign-in. */
async function writer(identity: EvalIdentity, orgId: string, env: Env, recent: boolean) {
  const scope = await access(identity, orgId, env);
  if (!scope.enabled) throw new EvalError("SCOPE_DENIED", 404);
  if (!scope.plan || scope.plan === "free") throw DATABASE_ERRORS.BYOK_PLAN_REQUIRED();
  if (recent) requireRecentSignIn(identity);
  return scope;
}

function view(rows: { connections: Array<Record<string, unknown>>; routes: Array<Record<string, unknown>> }, scope: Access): ByokSettings {
  const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
  return {
    available: scope.enabled && !!scope.plan && scope.plan !== "free",
    plan: scope.plan,
    roles: BYOK_ROLES,
    providers: BYOK_PROVIDERS.map((id) => ({ id, label: BYOK_PROVIDER_LABELS[id] })),
    connections: rows.connections.map((row) => ({
      id: row.account_id as string, provider: row.provider as ByokProvider, label: BYOK_PROVIDER_LABELS[row.provider as ByokProvider],
      state: row.check_state as ByokKeyState, checkedAt: iso(row.checked_at),
      models: Array.isArray(row.models) ? (row.models as unknown[]).filter((item): item is string => typeof item === "string") : [],
      createdAt: iso(row.created_at)!, rotatedAt: iso(row.rotated_at), revokedAt: iso(row.revoked_at),
    })),
    routes: rows.routes.map((row) => ({
      role: row.role as ByokRole, connectionId: row.account_id as string, provider: row.provider as ByokProvider, modelId: row.model_id as string,
      webResearch: row.web_research === true, updatedAt: iso(row.updated_at)!,
    })),
  };
}

async function read(identity: EvalIdentity, orgId: string, scope: Access) {
  return withTenant({ orgId, actorId: identity.user.id }, async (db) => ({
    connections: (await db.query("SELECT * FROM evals.byok_connections($1)", [orgId])).rows,
    routes: (await db.query("SELECT * FROM evals.byok_routes($1)", [orgId])).rows,
  })).catch(databaseError).then((rows) => view(rows, scope));
}

/**
 * GET: the workspace's keys (state only, never the key) and which roles use
 * them. `null` to an owner or platform admin while BYOK is off here and no key
 * is left, so Settings' probe on every tab is not a 404 in the console (R3);
 * 404 for everyone else.
 */
export async function getByokSettings(identity: EvalIdentity, orgId: string, env: Env = process.env): Promise<ByokSettings | null> {
  let scope: Access;
  try {
    scope = await access(identity, orgId, env);
  } catch (error) {
    if (error instanceof ByokClosed) return null;
    throw error;
  }
  return read(identity, orgId, scope);
}

const keyInput = z.strictObject({ apiKey: providerKeySchema });
const connectInput = z.strictObject({ provider: z.enum(BYOK_PROVIDERS), apiKey: providerKeySchema });

/** Checks a typed key with its provider; a rejected or unreachable key is never saved. */
async function checked(provider: ByokProvider, key: string, check?: CheckOptions) {
  try {
    return await checkProviderKey(provider, key, check);
  } catch (error) {
    const reason = error instanceof KeyCheckFailed ? error.reason : "unexpected";
    // The provider, the outcome and the status only: never the key or the provider's message.
    console.warn(JSON.stringify({ event: "byok_key_check_failed", provider, reason, status: error instanceof KeyCheckFailed ? error.status ?? null : null }));
    if (reason === "rejected") throw new EvalError("BYOK_KEY_REJECTED", 422, `${BYOK_PROVIDER_LABELS[provider]} rejected this key. Check that it is complete and active, then try again.`);
    if (reason === "unreachable") throw new EvalError("PROVIDER_UNAVAILABLE", 503, `Could not check the key with ${BYOK_PROVIDER_LABELS[provider]} right now. Try again in a minute.`);
    throw new EvalError("PROVIDER_UNAVAILABLE", 503, `${BYOK_PROVIDER_LABELS[provider]} answered in an unexpected way. Try again in a minute.`);
  }
}

/** The key, encrypted for this workspace, this account and a fresh key version. The clear copy is zeroed. */
function seal(orgId: string, accountId: string, apiKey: string) {
  const { keys, version } = keyring();
  const keyVersion = randomUUID();
  const value = Buffer.from(apiKey, "utf8");
  try {
    return { keyVersion, envelope: encryptSecret(value, customerKeySecretScope(orgId, accountId, keyVersion), version, keys) };
  } finally {
    value.fill(0);
  }
}

/** POST: connect a key for one provider (checked, encrypted, audited). Work paused on a key resumes when it works. */
export async function connectByokKey(identity: EvalIdentity, orgId: string, raw: unknown, env: Env = process.env, check?: CheckOptions): Promise<ByokSettings> {
  const scope = await writer(identity, orgId, env, true);
  const input = connectInput.parse(raw);
  const result = await checked(input.provider, input.apiKey, check);
  const accountId = randomUUID();
  const { keyVersion, envelope } = seal(orgId, accountId, input.apiKey);
  await withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    await db.query("SELECT evals.byok_connect($1,$2,$3,$4,$5,$6,$7)", [orgId, accountId, input.provider, envelope, keyVersion, result.state, JSON.stringify(result.models)]);
    if (result.state === "valid") await resumeKeyPausedWork(db, orgId);
  }).catch(databaseError);
  return read(identity, orgId, scope);
}

/** PATCH: replace a key. The old envelope is overwritten and can never be decrypted again. */
export async function rotateByokKey(identity: EvalIdentity, orgId: string, accountId: string, raw: unknown, env: Env = process.env, check?: CheckOptions): Promise<ByokSettings> {
  const scope = await writer(identity, orgId, env, true);
  if (!UUID.test(accountId)) throw new EvalError("SCOPE_DENIED", 404);
  const input = keyInput.parse(raw);
  const current = await withTenant({ orgId, actorId: identity.user.id }, async (db) =>
    (await db.query("SELECT provider FROM evals.byok_connections($1) WHERE account_id=$2 AND revoked_at IS NULL", [orgId, accountId])).rows[0]).catch(databaseError);
  if (!current) throw new EvalError("SCOPE_DENIED", 404);
  const provider = current.provider as ByokProvider;
  const result = await checked(provider, input.apiKey, check);
  const { keyVersion, envelope } = seal(orgId, accountId, input.apiKey);
  await withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    await db.query("SELECT evals.byok_rotate($1,$2,$3,$4,$5,$6)", [orgId, accountId, envelope, keyVersion, result.state, JSON.stringify(result.models)]);
    if (result.state === "valid") await resumeKeyPausedWork(db, orgId);
  }).catch(databaseError);
  return read(identity, orgId, scope);
}

/**
 * DELETE: remove a key. The envelope is erased, its models retired and the
 * workspace's routes to it removed, so the workspace goes back to Caudals'
 * models (charged in credits) by the owner's choice. Work already queued on
 * the key pauses with customer_key_revoked; it is never moved to a Caudals key.
 */
export async function revokeByokKey(identity: EvalIdentity, orgId: string, accountId: string, env: Env = process.env): Promise<ByokSettings & { routesRemoved: number }> {
  const scope = await access(identity, orgId, env);
  if (!UUID.test(accountId)) throw new EvalError("SCOPE_DENIED", 404);
  const removed = await withTenant({ orgId, actorId: identity.user.id }, async (db) =>
    Number((await db.query("SELECT evals.byok_revoke($1,$2) AS removed", [orgId, accountId])).rows[0].removed)).catch(databaseError);
  return { ...(await read(identity, orgId, scope)), routesRemoved: removed };
}

const routeInput = z.strictObject({
  connectionId: z.uuid(),
  modelId: z.string().trim().min(1).max(200),
  roles: z.array(z.enum(BYOK_ROLES)).min(1).max(4).default([...BYOK_ROLES]),
  contextLimit: z.number().int().min(4096).max(2_000_000).optional(),
});

/** PUT: run engine roles on a model through the workspace's key (frozen into each new run and job). */
export async function setByokRoute(identity: EvalIdentity, orgId: string, raw: unknown, env: Env = process.env): Promise<ByokSettings> {
  const scope = await writer(identity, orgId, env, false);
  const input = routeInput.parse(raw);
  await withTenant({ orgId, actorId: identity.user.id }, (db) =>
    db.query("SELECT evals.byok_set_route($1,$2,$3,$4,$5)", [orgId, input.connectionId, input.modelId, [...new Set(input.roles)], input.contextLimit ?? null])).catch(databaseError);
  return read(identity, orgId, scope);
}

/** DELETE route: one role (or all) back to Caudals' models. */
export async function clearByokRoute(identity: EvalIdentity, orgId: string, role: string, env: Env = process.env): Promise<ByokSettings> {
  const scope = await access(identity, orgId, env);
  const parsed = z.enum(["all", ...BYOK_ROLES]).parse(role);
  await withTenant({ orgId, actorId: identity.user.id }, (db) => db.query("SELECT evals.byok_clear_route($1,$2)", [orgId, parsed])).catch(databaseError);
  return read(identity, orgId, scope);
}
