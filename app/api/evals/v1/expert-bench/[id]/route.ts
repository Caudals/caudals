import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import { requireExpertReviewOrders, requireStageEEnabled } from "@/lib/evals/domain/features";
import { expertOnboardingInputSchema } from "@/lib/evals/experts/review-contracts";
import { saveExpertOnboarding } from "@/lib/evals/experts/review-orders";

export const runtime = "nodejs";
/** Save an expert's onboarding checklist: credentials, contract with IP assignment, DPA, paid trial, roster, availability. */
export const PUT = api(async (request, identity) => {
  requireExpertReviewOrders(); requireStageEEnabled();
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
  return saveExpertOnboarding(identity.user.id, id, expertOnboardingInputSchema.parse(await jsonBody(request, 8_192)));
});
