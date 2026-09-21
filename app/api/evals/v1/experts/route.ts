import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { expertProfileInputSchema } from "@/lib/evals/experts/contracts";
import { createExpertProfile, listExpertProfiles } from "@/lib/evals/experts/store";

export const runtime = "nodejs";
function operator(role: string | null) { if (!role) throw new EvalError("SCOPE_DENIED", 404); }
export const GET = api(async (_request, identity) => {
  requireStageEEnabled(); operator(identity.platformRole);
  return listExpertProfiles(identity.user.id);
});
export const POST = api(async (request, identity) => {
  requireStageEEnabled(); operator(identity.platformRole);
  const input = expertProfileInputSchema.parse(await jsonBody(request));
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  return createExpertProfile(identity.user.id, input, key);
});
