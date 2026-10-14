import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireExpertReviewOrders, requireStageEEnabled } from "@/lib/evals/domain/features";
import { reviewOrderInputSchema } from "@/lib/evals/experts/review-contracts";
import { cancelReviewOrder, createReviewOrder, publishReviewedRevision, reviewRequestWorkspace } from "@/lib/evals/experts/review-orders";

export const runtime = "nodejs";
const requestId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

async function scopeFor(request: Request, identity: Parameters<Parameters<typeof api>[0]>[1]) {
  requireExpertReviewOrders(); requireStageEEnabled();
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const id = requestId(request);
  const orgId = await reviewRequestWorkspace(identity.user.id, id);
  await requireWorkspace(identity, orgId, "manage");
  return { id, scope: { orgId, actorId: identity.user.id } };
}

/** Turn the request into an order: hand-written quote, experts, due date and redacted assignments (P-32). */
export const POST = api(async (request, identity) => {
  const { id, scope } = await scopeFor(request, identity);
  const input = reviewOrderInputSchema.parse(await jsonBody(request, 32_768));
  if (input.orgId !== scope.orgId) throw new EvalError("SCOPE_DENIED", 404);
  const key = z.string().min(8).max(160).parse(request.headers.get("Idempotency-Key"));
  return createReviewOrder(scope, id, input, key);
});

/** Publish the reviewed revision ("Reviewed by N experts on <date>, scope …") or cancel the order. */
export const PATCH = api(async (request, identity) => {
  const { scope } = await scopeFor(request, identity);
  const input = z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("publish"), orderId: z.uuid(), note: z.string().trim().max(1500).nullable().optional() }),
    z.strictObject({ action: z.literal("cancel"), orderId: z.uuid(), reason: z.string().trim().min(1).max(500) }),
  ]).parse(await jsonBody(request, 8_192));
  return input.action === "publish"
    ? publishReviewedRevision(scope, input.orderId, { note: input.note || null })
    : cancelReviewOrder(scope, input.orderId, input.reason);
});
