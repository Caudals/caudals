import "server-only";
import { PlanLimitError } from "./errors";
import { planLimitKind, plansV2Enabled } from "../../billing/plans";
import { plansV2For } from "../../billing/overrides";
import { withTenant } from "../repositories/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A plan limit raised by a database trigger (PLAN_LIMIT_SYSTEMS, _RUNS,
 * _MEMBERS; migrations 075 and 093) becomes a typed PlanLimitError when plans
 * v2 applies to its workspace (PLANS_V2_ENABLED or the workspace's override,
 * launch L-14). Otherwise it keeps today's generic PLAN_LIMIT answer
 * (inputError). Errors already typed pass through; anything else is null.
 */
export async function typedPlanLimit(error: unknown): Promise<PlanLimitError | null> {
  if (error instanceof PlanLimitError) return error;
  if (!(error instanceof Error)) return null;
  const kind = planLimitKind(error.message);
  if (!kind) return null;
  let detail: { org_id?: unknown; limit?: unknown } = {};
  try { detail = JSON.parse(String((error as { detail?: unknown }).detail ?? "{}")); } catch { return null; }
  const orgId = typeof detail.org_id === "string" && UUID.test(detail.org_id) ? detail.org_id : null;
  if (!orgId) return null;
  try {
    if (!plansV2Enabled() && !await withTenant({ orgId, actorId: "system:plan-limits" }, db => plansV2For(db, orgId))) return null;
  } catch { return null; }
  return new PlanLimitError(kind, orgId, typeof detail.limit === "number" ? detail.limit : null);
}
