import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { promoteApprovedSubmission, reviewDatasetItem } from "@/lib/evals/improvements/store";

export const runtime = "nodejs";
const bodySchema = z.discriminatedUnion("action", [
  z.strictObject({ orgId: z.uuid(), action: z.literal("promote"), taskId: z.uuid(), submissionRevisionId: z.uuid() }),
  z.strictObject({ orgId: z.uuid(), action: z.literal("review"), itemRevisionId: z.uuid(), reviewerProfileId: z.uuid(),
    decision: z.enum(["approve", "reject", "changes_requested"]), rightsStatus: z.enum(["pending", "permitted", "restricted"]),
    redactionStatus: z.enum(["pending", "approved", "rejected"]), rationale: z.string().trim().min(1).max(12_000) }),
]);
export const POST = api(async (request, identity) => {
  requireStageEEnabled(); if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const input = bodySchema.parse(await jsonBody(request, 32_000));
  await requireWorkspace(identity, input.orgId, "manage");
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  if (input.action === "promote") return promoteApprovedSubmission(scope, input.taskId, input.submissionRevisionId, key);
  const { orgId: _orgId, action: _action, itemRevisionId, ...review } = input;
  void _orgId; void _action;
  return reviewDatasetItem(scope, itemRevisionId, review, key);
});
