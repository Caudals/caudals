import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import { changeReviewAssignment, listReviewAssignments } from "@/lib/evals/repositories/review-assignments";

export const runtime = "nodejs";

/**
 * Review queue assignments (launch G1, spec v2 §5.3 "Assign to me"). Platform
 * staff only; the SQL functions (migration 113) check the staff role and
 * write access to the live workspace again, and audit every change.
 */
export const GET = api(async (request, identity) => {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  return listReviewAssignments({ orgId, actorId: identity.user.id });
});

export const POST = api(async (request, identity) => {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const input = z.strictObject({
    orgId: z.uuid(), subjectKind: z.enum(["evaluation", "assessment"]), subjectId: z.uuid(),
    action: z.enum(["assign", "release"]), takeOver: z.boolean().optional(),
  }).parse(await jsonBody(request, 1024));
  const { orgId, ...change } = input;
  return { assignment: await changeReviewAssignment({ orgId, actorId: identity.user.id }, change) };
});
