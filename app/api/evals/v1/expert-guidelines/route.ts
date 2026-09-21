import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { createGuidelineRevision } from "@/lib/evals/experts/store";

export const runtime = "nodejs";
const inputSchema = z.strictObject({
  orgId: z.uuid(), projectId: z.uuid(), title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(30_000),
  criteria: z.array(z.strictObject({ id: z.string().min(1).max(120), description: z.string().trim().min(1).max(4_000), required: z.boolean() })).min(1).max(100),
  supersedesRevisionId: z.uuid().nullable(),
});
export const POST = api(async (request, identity) => {
  requireStageEEnabled();
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const input = inputSchema.parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "manage");
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  const { orgId, ...guideline } = input;
  return createGuidelineRevision(
    { orgId, actorId: identity.user.id },
    guideline,
    key,
  );
});
