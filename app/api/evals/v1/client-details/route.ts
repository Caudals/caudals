import { api, EvalError } from "@/lib/evals/domain/http";
import { getClientDetails } from "@/lib/analytics/ops-kpis";

export const runtime = "nodejs";
// Plan, credits, last activity and the owner's email domain per workspace
// (launch L-21, spec v2 §5.3 Clients). Platform operators and admins only;
// the database function returns only the workspaces the actor may see.
export const GET = api(async (_request, identity) => {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return getClientDetails(identity);
});
