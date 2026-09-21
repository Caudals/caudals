import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { expertAssignmentInputSchema } from "@/lib/evals/experts/contracts";
import { createExpertAssignment, listExpertAssignments } from "@/lib/evals/experts/store";

export const runtime = "nodejs";
const inputSchema = z.strictObject({ orgId: z.uuid(), projectId: z.uuid(), assignment: expertAssignmentInputSchema });
export const GET = api(async (request, identity) => {
  requireStageEEnabled(); if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  return listExpertAssignments({ orgId, actorId: identity.user.id });
});
export const POST = api(async (request, identity) => {
  requireStageEEnabled(); if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const input = inputSchema.parse(await jsonBody(request, 300_000));
  await requireWorkspace(identity, input.orgId, "manage");
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  return createExpertAssignment(
    { orgId: input.orgId, actorId: identity.user.id },
    { projectId: input.projectId, ...input.assignment }, key,
  );
});
