import "server-only";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { EvalError } from "../domain/errors";
import type { EvalIdentity } from "../domain/identity";
import {
  enqueueProbe, registerPrice, registerProvider, revokeSecret, setBudget, setGenerationProviderRoute, writeSecret,
} from "../providers/admin";
import { loadKeyring } from "../security/envelope";
import { withTenant } from "./db";

// Operator Platform section (spec §5.1 Platform, §13.3 operator-only
// /providers /models /inference /audit /usage /budgets, §14.1-§14.3).
//
// Registry, secret and funded-limit changes run on the dedicated
// evals_execution_admin login (never the web runtime role), require a recent
// sign-in, and are audited. Reads never return endpoints, secrets or envelopes;
// the DGX route is shown only as "private DGX route".

const MONEY = z.string().regex(/^(0|[1-9]\d{0,14})(\.\d{1,9})?$/);
const MAX_EVALUATION_CAP = 1000; // D-03: operator-authorized ceiling per evaluation.

let adminPool: Pool | null = null;
function getAdminPool(): Pool {
  if (adminPool) return adminPool;
  const file = process.env.EVALS_ADMIN_DATABASE_URL_FILE;
  if (!file) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Platform configuration is not connected in this environment.");
  adminPool = new Pool({ connectionString: readFileSync(file, "utf8").trim(), max: 2, idleTimeoutMillis: 30_000 });
  return adminPool;
}

export function requirePlatformAdmin(identity: EvalIdentity) {
  if (identity.platformRole !== "platform_admin") throw new EvalError("SCOPE_DENIED", 403, "A platform administrator is required.");
}

/** Sensitive admin changes need a sign-in from the last 15 minutes (spec §16.1). */
export function requireRecentAuthentication(identity: EvalIdentity, maxMinutes = 15) {
  requirePlatformAdmin(identity);
  const at = identity.sessionCreatedAt ? Date.parse(identity.sessionCreatedAt) : NaN;
  if (!Number.isFinite(at) || Date.now() - at > maxMinutes * 60_000) {
    throw new EvalError("REAUTHENTICATION_REQUIRED", 401, "Sign in again to confirm this platform change.");
  }
}

type AdminScope = { orgId: string; actorId: string };
function asAdmin<T>(scope: AdminScope, fn: (c: PoolClient) => Promise<T>) {
  return withTenant(scope, fn, getAdminPool());
}
function adminError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  const known: Record<string, string> = {
    budget_below_liability_or_currency_mismatch: "The new ceiling is below settled and reserved spend, or uses another currency.",
    endpoint_not_approved: "That endpoint is not approved. DGX revisions must use the protected DGX route; others must be HTTPS.",
    generation_provider_not_approved: "This model revision is not approved for that role, data class or region.",
    currency_mismatch: "The price currency must match the provider account.",
    probe_not_approved: "Probes run only on DGX revisions with approved zero-price probing.",
    platform_admin_required: "A platform administrator is required.",
  };
  if (known[message]) throw new EvalError("INPUT_INVALID", 422, known[message]);
  throw error;
}

// ---------------------------------------------------------------- reads

export async function listProviders(scope: AdminScope) {
  return asAdmin(scope, async (c) => {
    const accounts = (await c.query("SELECT id,name,currency,ceiling,settled,reserved,enabled,created_at FROM evals.provider_account ORDER BY created_at")).rows;
    const revisions = (await c.query(`SELECT p.id,p.account_id,p.adapter,p.model_id,p.roles,p.capabilities,p.context_limit,p.output_limit,
        p.data_classes,p.regions,p.rpm,p.tpm,p.concurrency_limit,p.retired_at,p.created_at,
        CASE WHEN p.adapter='dgx' THEN 'private DGX route' ELSE split_part(split_part(p.endpoint,'://',2),'/',1) END AS endpoint_host,
        h.state AS health,h.last_probe_at,h.circuit_until,
        (SELECT json_build_object('id',pr.id,'currency',pr.currency,'input',pr.input_price,'output',pr.output_price,'effective_at',pr.effective_at,'source',pr.source)
         FROM evals.price_revision pr WHERE pr.provider_revision_id=p.id AND pr.effective_at<=now() ORDER BY pr.effective_at DESC LIMIT 1) AS price
      FROM evals.provider_revision p LEFT JOIN evals.provider_health h ON h.provider_revision_id=p.id
      ORDER BY p.created_at DESC LIMIT 100`)).rows;
    const secrets = (await c.query(`SELECT r.id,r.scope_id AS provider_revision_id,r.created_at,r.revoked_at,
        (SELECT count(*)::int FROM evals.secret_version v WHERE v.org_id=r.org_id AND v.record_id=r.id) AS versions
      FROM evals.secret_record r WHERE r.org_id=$1 AND r.purpose='provider' ORDER BY r.created_at DESC LIMIT 100`, [scope.orgId])).rows;
    return { accounts, revisions, secrets };
  });
}

export async function listRoutes(identity: EvalIdentity) {
  const routes = [];
  for (const workspace of identity.workspaces.slice(0, 50)) {
    const rows = await asAdmin({ orgId: workspace.id, actorId: identity.user.id }, async (c) => (await c.query(
      "SELECT org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_at FROM evals.generation_provider_route WHERE org_id=$1 ORDER BY role",
      [workspace.id])).rows);
    routes.push(...rows.map((row) => ({ ...row, workspace: workspace.name })));
  }
  return routes;
}

/** DGX and provider health without reaching the private network from the web process. */
export async function inferenceStatus(scope: AdminScope) {
  return asAdmin(scope, async (c) => {
    const health = (await c.query(`SELECT p.id,p.adapter,p.model_id,p.roles,h.state,h.last_probe_at,h.circuit_until,
        (SELECT count(*)::int FROM evals.provider_slot s WHERE s.provider_revision_id=p.id AND s.released_at IS NULL) AS active_slots,
        (SELECT count(*)::int FROM evals.provider_slot s WHERE s.provider_revision_id=p.id AND s.acquired_at>now()-interval '24 hours') AS calls_24h,
        (SELECT round(avg(extract(epoch FROM s.released_at-s.acquired_at)))::int FROM evals.provider_slot s WHERE s.provider_revision_id=p.id AND s.released_at IS NOT NULL AND s.acquired_at>now()-interval '24 hours') AS avg_seconds_24h
      FROM evals.provider_revision p LEFT JOIN evals.provider_health h ON h.provider_revision_id=p.id
      WHERE p.retired_at IS NULL OR p.retired_at>now() ORDER BY p.adapter,p.model_id,p.created_at DESC`)).rows;
    const probes = (await c.query(`SELECT s.id,s.status,s.reason_code,s.created_at,s.input->>'providerRevisionId' AS provider_revision_id,s.input->>'probeKind' AS kind,
        r.output->'capabilityEvidence' AS evidence
      FROM evals.workflow_step s LEFT JOIN evals.execution_result r ON (r.org_id,r.step_id)=(s.org_id,s.id)
      WHERE s.org_id=$1 AND (s.input->>'probe')::boolean IS TRUE ORDER BY s.created_at DESC LIMIT 20`, [scope.orgId])).rows;
    return { health, probes };
  });
}

export async function usageOverview(scope: AdminScope) {
  return withTenant(scope, async (c) => {
    const budgets = (await c.query(`SELECT id,kind,scope_id,currency,ceiling,settled,reserved,created_at FROM evals.execution_budget
      WHERE org_id=$1 ORDER BY (kind='workspace') DESC,created_at DESC LIMIT 30`, [scope.orgId])).rows;
    const entitlement = (await c.query("SELECT * FROM evals.workspace_entitlement WHERE org_id=$1", [scope.orgId])).rows[0] ?? null;
    const evaluations = (await c.query("SELECT id,title,commercial_cap,currency,updated_at FROM evals.evaluation WHERE org_id=$1 ORDER BY updated_at DESC LIMIT 30", [scope.orgId])).rows;
    const amendments = (await c.query("SELECT id,target_kind,target_id,previous,next,reason,actor_id,created_at FROM evals.budget_amendment WHERE org_id=$1 ORDER BY created_at DESC LIMIT 30", [scope.orgId])).rows;
    const targetCalls = (await c.query(`SELECT count(*)::int AS calls, count(*) FILTER (WHERE state='unknown')::int AS unknown
      FROM evals.target_invocation_call WHERE org_id=$1 AND dispatched_at>date_trunc('month',now())`, [scope.orgId])).rows[0];
    return { budgets, entitlement, evaluations, amendments, targetCalls };
  });
}

export async function accountsOverview(scope: AdminScope) {
  return withTenant(scope, async (c) => ({
    platformRoles: (await c.query("SELECT * FROM evals.list_platform_roles()")).rows,
    memberships: (await c.query("SELECT * FROM evals.list_workspace_members()")).rows,
  }));
}

export async function auditLog(scope: AdminScope, before?: string) {
  return withTenant(scope, async (c) => (await c.query(`SELECT id,actor_id,action,subject_id,created_at FROM evals.audit_event
    WHERE org_id=$1 AND ($2::timestamptz IS NULL OR created_at<$2) ORDER BY created_at DESC,id DESC LIMIT 100`, [scope.orgId, before ?? null])).rows);
}

// ---------------------------------------------------------------- writes

const amendmentSchema = z.discriminatedUnion("targetKind", [
  z.strictObject({ targetKind: z.literal("workspace_budget"), ceiling: MONEY, currency: z.string().regex(/^[A-Z]{3}$/), reason: z.string().trim().min(3).max(2000) }),
  z.strictObject({ targetKind: z.literal("evaluation_cap"), targetId: z.uuid(), ceiling: MONEY, reason: z.string().trim().min(3).max(2000) }),
  z.strictObject({ targetKind: z.literal("provider_account"), targetId: z.uuid(), ceiling: MONEY, currency: z.string().regex(/^[A-Z]{3}$/), enabled: z.boolean(), reason: z.string().trim().min(3).max(2000) }),
  z.strictObject({
    targetKind: z.literal("entitlement"), reason: z.string().trim().min(3).max(2000),
    maxActiveRuns: z.number().int().min(0).max(100), monthlySpendLimit: MONEY,
    allowedConnectionTypes: z.array(z.enum(["website", "openai_compatible", "provider_native", "https_json", "imported_responses", "private_runner"])).max(6),
    canSchedule: z.boolean(), canExport: z.boolean(), reviewAllowance: z.number().int().min(0).max(100000),
  }),
]);

/** `POST /budgets/:id/amendments`: an attributed, reasoned change to a funded limit. */
export async function amendBudget(identity: EvalIdentity, orgId: string, raw: unknown) {
  requireRecentAuthentication(identity);
  const input = amendmentSchema.parse(raw);
  const scope = { orgId, actorId: identity.user.id };
  try {
    return await asAdmin(scope, async (c) => {
      let targetId = orgId, previous: unknown, next: unknown;
      if (input.targetKind === "workspace_budget") {
        previous = (await c.query("SELECT ceiling,currency FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace' AND scope_id=$1", [orgId])).rows[0] ?? null;
        const result = await setBudget(c, scope, { kind: "workspace", scopeId: orgId, currency: input.currency, ceiling: input.ceiling });
        targetId = result.id; next = { ceiling: input.ceiling, currency: input.currency };
      } else if (input.targetKind === "evaluation_cap") {
        if (Number(input.ceiling) > MAX_EVALUATION_CAP) throw new EvalError("INPUT_INVALID", 422, `Evaluation caps above ${MAX_EVALUATION_CAP} need a founder decision (D-03).`);
        const row = (await c.query("SELECT commercial_cap,currency FROM evals.evaluation WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, input.targetId])).rows[0];
        if (!row) throw new EvalError("SCOPE_DENIED", 404);
        await c.query("UPDATE evals.evaluation SET commercial_cap=$3,updated_at=now() WHERE org_id=$1 AND id=$2", [orgId, input.targetId, input.ceiling]);
        targetId = input.targetId; previous = row; next = { commercial_cap: input.ceiling, currency: row.currency };
      } else if (input.targetKind === "provider_account") {
        previous = (await c.query("SELECT ceiling,currency,enabled FROM evals.provider_account WHERE id=$1", [input.targetId])).rows[0] ?? null;
        if (!previous) throw new EvalError("SCOPE_DENIED", 404);
        await setBudget(c, scope, { kind: "provider", scopeId: input.targetId, currency: input.currency, ceiling: input.ceiling, enabled: input.enabled });
        targetId = input.targetId; next = { ceiling: input.ceiling, currency: input.currency, enabled: input.enabled };
      } else {
        previous = (await c.query("SELECT max_active_runs,monthly_spend_limit,allowed_connection_types,can_schedule,can_export,review_allowance,version FROM evals.workspace_entitlement WHERE org_id=$1 FOR UPDATE", [orgId])).rows[0] ?? null;
        if (!previous) throw new EvalError("SCOPE_DENIED", 404);
        await c.query(`UPDATE evals.workspace_entitlement SET max_active_runs=$2,monthly_spend_limit=$3,allowed_connection_types=$4,can_schedule=$5,can_export=$6,
            review_allowance=$7,version=version+1,updated_by=$8,updated_at=now() WHERE org_id=$1`,
        [orgId, input.maxActiveRuns, input.monthlySpendLimit, input.allowedConnectionTypes, input.canSchedule, input.canExport, input.reviewAllowance, identity.user.id]);
        next = { max_active_runs: input.maxActiveRuns, monthly_spend_limit: input.monthlySpendLimit, allowed_connection_types: input.allowedConnectionTypes, can_schedule: input.canSchedule, can_export: input.canExport, review_allowance: input.reviewAllowance };
      }
      const amendment = (await c.query(`INSERT INTO evals.budget_amendment(org_id,target_kind,target_id,previous,next,reason,actor_id)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at`, [orgId, input.targetKind, targetId, JSON.stringify(previous ?? {}), JSON.stringify(next), input.reason, identity.user.id])).rows[0];
      await c.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,$3,$4)", [orgId, identity.user.id, `budget.amended.${input.targetKind}`, amendment.id]);
      return { amendmentId: amendment.id, targetKind: input.targetKind, targetId };
    });
  } catch (error) { adminError(error); }
}

export async function setModelRoute(identity: EvalIdentity, orgId: string, raw: unknown) {
  requireRecentAuthentication(identity);
  try { return await asAdmin({ orgId, actorId: identity.user.id }, (c) => setGenerationProviderRoute(c, { orgId, actorId: identity.user.id }, raw)); }
  catch (error) { adminError(error); }
}

export async function registerModelRevision(identity: EvalIdentity, orgId: string, raw: unknown) {
  requireRecentAuthentication(identity);
  const dgxFile = process.env.EVALS_DGX_ENDPOINT_FILE;
  const approved = dgxFile ? readFileSync(dgxFile, "utf8").trim() : undefined;
  const input = z.object({ endpoint: z.string() }).passthrough().parse(raw);
  // The browser never sees or sends the private DGX address.
  const config = input.endpoint === "dgx" && approved ? { ...input, endpoint: approved } : input;
  try { return await asAdmin({ orgId, actorId: identity.user.id }, (c) => registerProvider(c, { orgId, actorId: identity.user.id }, config, approved)); }
  catch (error) { adminError(error); }
}

export async function registerModelPrice(identity: EvalIdentity, orgId: string, raw: unknown) {
  requireRecentAuthentication(identity);
  try { return await asAdmin({ orgId, actorId: identity.user.id }, (c) => registerPrice(c, { orgId, actorId: identity.user.id }, raw)); }
  catch (error) { adminError(error); }
}

/** Write-only provider key: stored as an envelope, never returned. Rotation appends a version. */
export async function writeProviderKey(identity: EvalIdentity, orgId: string, raw: unknown) {
  requireRecentAuthentication(identity);
  const input = z.strictObject({ providerRevisionId: z.uuid(), recordId: z.uuid().optional(), value: z.string().min(8).max(8192) }).parse(raw);
  const file = process.env.EVALS_MASTER_KEYRING_FILE;
  if (!file) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Secret storage is not configured.");
  const keys = loadKeyring(file);
  const keyVersion = process.env.EVALS_MASTER_KEY_VERSION && keys.has(process.env.EVALS_MASTER_KEY_VERSION) ? process.env.EVALS_MASTER_KEY_VERSION : [...keys.keys()].sort().at(-1)!;
  const value = Buffer.from(input.value, "utf8");
  try {
    return await asAdmin({ orgId, actorId: identity.user.id }, (c) => writeSecret(c, { orgId, actorId: identity.user.id },
      { recordId: input.recordId, purpose: "provider", scopeId: input.providerRevisionId }, value, keyVersion, keys));
  } catch (error) { adminError(error); } finally { value.fill(0); }
}

export async function revokeProviderKey(identity: EvalIdentity, orgId: string, recordId: string) {
  requireRecentAuthentication(identity);
  try { return await asAdmin({ orgId, actorId: identity.user.id }, (c) => revokeSecret(c, { orgId, actorId: identity.user.id }, recordId)); }
  catch (error) { adminError(error); }
}

/** Bounded capability probe (spec §5.5 "Test connection", §14.2): tiny, zero-price, DGX-only. */
export async function probeModel(identity: EvalIdentity, orgId: string, raw: unknown) {
  requireRecentAuthentication(identity);
  const input = z.strictObject({ providerRevisionId: z.uuid(), kind: z.enum(["text", "json_object", "tools"]) }).parse(raw);
  const scope = { orgId, actorId: identity.user.id };
  try {
    return await asAdmin(scope, async (c) => {
      const route = (await c.query(`SELECT p.id,p.roles[1] AS role,p.data_classes[1] AS data_class,p.regions[1] AS region,pr.id AS price_id,a.currency
        FROM evals.provider_revision p JOIN evals.provider_account a ON a.id=p.account_id
        JOIN LATERAL (SELECT id FROM evals.price_revision x WHERE x.provider_revision_id=p.id AND x.effective_at<=now() ORDER BY x.effective_at DESC LIMIT 1) pr ON true
        WHERE p.id=$1`, [input.providerRevisionId])).rows[0];
      if (!route) throw new EvalError("INPUT_INVALID", 422, "Register a price revision before probing this model.");
      const workspace = (await c.query("SELECT id FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace' AND scope_id=$1", [orgId])).rows[0];
      if (!workspace) throw new EvalError("BUDGET_UNAVAILABLE", 409, "Set a workspace budget before probing.");
      const runScope = randomUUID();
      const run = await setBudget(c, scope, { kind: "run", scopeId: runScope, currency: route.currency, ceiling: "0.01" });
      const messages = input.kind === "text" ? [{ role: "user", content: "Reply with the single word: ok" }]
        : input.kind === "json_object" ? [{ role: "user", content: 'Return the JSON object {"ok":true} and nothing else.' }]
          : [{ role: "user", content: "Call the probe_echo tool with value ok." }];
      return enqueueProbe(c, scope, {
        probeKind: input.kind, outputFormat: input.kind === "json_object" ? "json_object" : "text",
        providerRevisionId: route.id, priceRevisionId: route.price_id, workspaceBudgetId: workspace.id, runBudgetId: run.id,
        role: route.role, dataClass: route.data_class, region: route.region, routing: "local_only", approvedProviderIds: [],
        messages, maxOutputTokens: 128, timeoutMs: 120000, internalCostPerSecond: "0.0001",
      });
    });
  } catch (error) { adminError(error); }
}
