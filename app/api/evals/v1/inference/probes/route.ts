import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { probeModel } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

export const POST = api(async (request, identity: EvalIdentity) => {
  const { orgId, ...probe } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return probeModel(identity, orgId, probe);
});
