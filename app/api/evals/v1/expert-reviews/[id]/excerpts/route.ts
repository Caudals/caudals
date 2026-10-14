import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireExpertReviewOrders, requireStageEEnabled } from "@/lib/evals/domain/features";
import { previewOrderExcerpts, reviewRequestWorkspace } from "@/lib/evals/experts/review-orders";

export const runtime = "nodejs";
/** The redacted excerpts an order would give its experts, to check before creating it (nothing is written). */
export const POST = api(async (request, identity) => {
  requireExpertReviewOrders(); requireStageEEnabled();
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  const { resultIds } = z.strictObject({ resultIds: z.array(z.string().min(1).max(200)).min(1).max(100) }).parse(await jsonBody(request, 16_384));
  const orgId = await reviewRequestWorkspace(identity.user.id, id);
  await requireWorkspace(identity, orgId, "manage");
  return previewOrderExcerpts({ orgId, actorId: identity.user.id }, id, resultIds);
});
