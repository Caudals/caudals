import { api, EvalError } from "@/lib/evals/domain/http";
import { requireExpertReviewOrders } from "@/lib/evals/domain/features";
import { listReviewRequests } from "@/lib/evals/experts/review-orders";

export const runtime = "nodejs";
/** Every expert-review request with its order and SLA facts (launch L-26; platform operators only). */
export const GET = api(async (_request, identity) => {
  requireExpertReviewOrders();
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return listReviewRequests(identity.user.id);
});
