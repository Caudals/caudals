import type { PoolClient } from "pg";
import type { DataRouting } from "../reports/contracts";

/** The roles a run itself calls: grading and the report's takeaways. */
const RUN_ROLES = ["judge", "report_writer"] as const;

/**
 * How a run's grading and report models sent customer content (launch L-27,
 * spec §6.11), from the routes the run froze: the workspace's own provider
 * key (`customer_provider`), a commercial provider Caudals uses
 * (`approved_providers`) or only the private DGX (`local_only`). Undefined
 * when the run froze no routes (runs from before migration 078).
 */
export async function runDataRouting(db: PoolClient, modelRoutes: unknown): Promise<DataRouting | undefined> {
  const routes = modelRoutes && typeof modelRoutes === "object" ? modelRoutes as Record<string, { provider_revision_id?: unknown } | undefined> : {};
  const ids = RUN_ROLES.map((role) => routes[role]?.provider_revision_id).filter((id): id is string => typeof id === "string");
  if (!ids.length) return undefined;
  const rows = (await db.query("SELECT adapter,org_id FROM evals.provider_revision WHERE id=ANY($1::uuid[])", [ids])).rows as Array<{ adapter: string; org_id: string | null }>;
  if (rows.some((row) => row.org_id)) return "customer_provider";
  return rows.some((row) => row.adapter !== "dgx") ? "approved_providers" : "local_only";
}
