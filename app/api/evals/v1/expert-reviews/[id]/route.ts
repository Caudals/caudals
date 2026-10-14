import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireExpertReviewOrders } from "@/lib/evals/domain/features";
import { readReviewRequest, reviewRequestWorkspace, updateReviewRequest } from "@/lib/evals/experts/review-orders";

export const runtime = "nodejs";
const requestId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));

/** One request in full: CRM draft, order, assignments and the report's results (platform operators with workspace-manage authority). */
export const GET = api(async (request, identity) => {
  requireExpertReviewOrders();
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const id = requestId(request);
  const orgId = await reviewRequestWorkspace(identity.user.id, id);
  await requireWorkspace(identity, orgId, "manage");
  return readReviewRequest({ orgId, actorId: identity.user.id }, id);
});

/** Record the hand-written reply (quote sent) or decline the request. */
export const PATCH = api(async (request, identity) => {
  requireExpertReviewOrders();
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const input = z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("quoted") }),
    z.strictObject({ action: z.literal("declined"), reason: z.string().trim().min(1).max(500) }),
  ]).parse(await jsonBody(request, 4_096));
  const id = requestId(request);
  await requireWorkspace(identity, await reviewRequestWorkspace(identity.user.id, id), "manage");
  return updateReviewRequest(identity.user.id, id, input.action, input.action === "declined" ? input.reason : null);
});
