import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { readExpertAssignment, resolveSubmissionConflict, revealReviewPhase } from "@/lib/evals/experts/store";

export const runtime = "nodejs";
const id = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
export const GET = api(async (request, identity) => {
  requireStageEEnabled(); if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  return readExpertAssignment({ orgId, actorId: identity.user.id }, id(request));
});
export const PATCH = api(async (request, identity) => {
  requireStageEEnabled(); if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const input = z.discriminatedUnion("action", [
    z.strictObject({ orgId: z.uuid(), action: z.literal("reveal_review") }),
    z.strictObject({ orgId: z.uuid(), action: z.literal("resolve_conflict"), revisionId: z.uuid() }),
  ]).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "manage");
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  return input.action === "reveal_review"
    ? revealReviewPhase(scope, id(request))
    : resolveSubmissionConflict(scope, id(request), input.revisionId);
});
