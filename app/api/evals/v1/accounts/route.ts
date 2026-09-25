import { api, EvalError } from "@/lib/evals/domain/http";
import { accountsOverview } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

// Platform roles and workspace memberships (spec §5.1 Accounts). Admin only.
export const GET = api(async (_request, identity) => {
  if (identity.platformRole !== "platform_admin") throw new EvalError("SCOPE_DENIED", 404);
  const orgId = identity.workspaces[0]?.id ?? "";
  return accountsOverview({ orgId, actorId: identity.user.id });
});
