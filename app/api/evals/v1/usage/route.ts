import { z } from "zod";
import { api, EvalError } from "@/lib/evals/domain/http";
import { usageOverview } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

// Operator usage and funded limits for one workspace (spec §13.3 GET /usage).
export const GET = api(async (request, identity) => {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return usageOverview({ orgId: z.uuid().parse(new URL(request.url).searchParams.get("orgId")), actorId: identity.user.id });
});
