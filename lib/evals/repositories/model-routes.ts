import type { PoolClient } from "pg";

/**
 * Which model serves an internal engine role for a workspace.
 *
 * A workspace route (evals.generation_provider_route) wins; otherwise the
 * platform default (evals.platform_model_route) applies. Both point at a
 * registered provider revision and its price, so every call stays budgeted,
 * attributed and reproducible. DGX revisions run local-only; OpenAI-compatible
 * revisions run through the approved-provider path with the account's key.
 */
export type EngineRole = "context_analyzer" | "generator" | "judge" | "report_writer";
export type ModelRoute = {
  role: EngineRole;
  provider_revision_id: string;
  price_revision_id: string;
  data_class: string;
  region: string;
  internal_cost_per_second: string;
  output_limit: number;
  context_limit: number;
  tpm: number;
  adapter: "dgx" | "openai_compatible";
  model_id: string;
  currency: string;
  source: "workspace" | "platform";
};

const COLUMNS = `r.role,r.provider_revision_id,r.price_revision_id,r.data_class,r.region,r.internal_cost_per_second::text AS internal_cost_per_second,
  p.adapter,p.model_id,p.output_limit,p.context_limit,p.tpm,pr.currency`;
const JOINS = `JOIN evals.provider_revision p ON p.id=r.provider_revision_id AND (p.retired_at IS NULL OR p.retired_at>now())
  JOIN evals.provider_account a ON a.id=p.account_id AND a.enabled
  JOIN evals.price_revision pr ON (pr.id,pr.provider_revision_id)=(r.price_revision_id,r.provider_revision_id)`;

export async function resolveModelRoutes(db: PoolClient, orgId: string, roles: EngineRole[]): Promise<Map<EngineRole, ModelRoute>> {
  const found = new Map<EngineRole, ModelRoute>();
  const own = (await db.query(`SELECT ${COLUMNS},'workspace' AS source FROM evals.generation_provider_route r ${JOINS} WHERE r.org_id=$1 AND r.role=ANY($2::text[])`, [orgId, roles])).rows as ModelRoute[];
  for (const row of own) found.set(row.role, row);
  const missing = roles.filter((role) => !found.has(role));
  if (missing.length) {
    const platform = (await db.query(`SELECT ${COLUMNS},'platform' AS source FROM evals.platform_model_route r ${JOINS} WHERE r.role=ANY($1::text[])`, [missing])).rows as ModelRoute[];
    for (const row of platform) found.set(row.role, row);
  }
  return found;
}

export async function resolveModelRoute(db: PoolClient, orgId: string, role: EngineRole): Promise<ModelRoute | null> {
  return (await resolveModelRoutes(db, orgId, [role])).get(role) ?? null;
}

/** Invocation routing for a route: local DGX work never leaves the private network. */
export function routingFor(route: Pick<ModelRoute, "adapter" | "provider_revision_id">) {
  return route.adapter === "dgx"
    ? { routing: "local_only" as const, approvedProviderIds: [] as string[] }
    : { routing: "approved_providers" as const, approvedProviderIds: [route.provider_revision_id] };
}

/** Internal jobs on a commercial API get a bounded deadline; DGX may queue behind other work. */
export function internalTimeoutMs(route: Pick<ModelRoute, "adapter">, dgxMs: number) {
  return route.adapter === "dgx" ? dgxMs : Math.min(dgxMs, 300_000);
}

/**
 * The workspace budget every engine call reserves against. Created on first
 * use from the workspace entitlement's monthly limit, so a new client can
 * prepare tests without an operator step. Operators still amend it.
 */
export async function ensureWorkspaceBudget(db: PoolClient, orgId: string, currency: string): Promise<{ id: string; currency: string } | null> {
  const existing = (await db.query("SELECT id,currency FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace' AND scope_id=$1", [orgId])).rows[0];
  if (existing) return existing;
  const limit = (await db.query("SELECT monthly_spend_limit::text AS ceiling,currency FROM evals.workspace_entitlement WHERE org_id=$1", [orgId])).rows[0];
  const ceiling = limit && limit.currency === currency ? limit.ceiling : "500";
  await db.query(`INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,'workspace',$1,$2,$3)
    ON CONFLICT(org_id,kind,scope_id) DO NOTHING`, [orgId, currency, ceiling]);
  return (await db.query("SELECT id,currency FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace' AND scope_id=$1", [orgId])).rows[0] ?? null;
}

/**
 * Bytes available for source material in one prompt. Token accounting treats
 * one UTF-8 byte as one token (conservative), so this mirrors
 * boundedOutputTokens: context minus the output reservation, a safety margin
 * and the fixed prompt parts. Capped so a huge context does not mean a slow,
 * unfocused prompt.
 */
export function materialBudgetBytes(route: Pick<ModelRoute, "context_limit" | "output_limit" | "tpm">, outputCap: number, fixedBytes: number, cap = 200_000) {
  const output = Math.min(32768, outputCap, route.output_limit);
  return Math.max(0, Math.min(cap, route.context_limit - output - 1024 - fixedBytes - 512, route.tpm - output - 1024 - fixedBytes - 512));
}
