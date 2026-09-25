import { z } from "zod";
import { api, EvalError } from "@/lib/evals/domain/http";
import { inferenceStatus } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

// DGX and provider health as recorded by the workers (spec §14.2). The web
// process never contacts the private inference network.
export const GET = api(async (request, identity) => {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return inferenceStatus({ orgId: z.uuid().parse(new URL(request.url).searchParams.get("orgId")), actorId: identity.user.id });
});
