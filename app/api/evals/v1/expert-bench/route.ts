import { api, EvalError } from "@/lib/evals/domain/http";
import { requireExpertReviewOrders, requireStageEEnabled } from "@/lib/evals/domain/features";
import { listExpertBench } from "@/lib/evals/experts/review-orders";

export const runtime = "nodejs";
/** The expert bench: every profile with its onboarding checklist and readiness (launch L-26, P-33; platform operators only). */
export const GET = api(async (_request, identity) => {
  requireExpertReviewOrders(); requireStageEEnabled();
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return listExpertBench(identity.user.id);
});
