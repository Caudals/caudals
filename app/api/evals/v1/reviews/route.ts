import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { reviewAssessment } from "@/lib/evals/repositories/managed";
import { listReviewQueue } from "@/lib/evals/repositories/operator-actions";
export const runtime = "nodejs";

// Exception-first result review (spec §5.5, §13.3 `POST /reviews`).
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "write");
  return listReviewQueue({ orgId, actorId: identity.user.id });
});

export const POST = api(async (request, identity) => {
  const input = z.strictObject({
    orgId: z.uuid(), assessmentId: z.uuid(), decision: z.enum(["approve", "dispute", "override"]), reason: z.string().trim().min(1).max(4000),
    outcome: z.enum(["pass", "partial", "fail", "unscorable"]).optional(),
    criteria: z.array(z.strictObject({ criterion_id: z.string().min(1).max(200), score: z.number().nonnegative().nullable(), rationale: z.string().min(1).max(4000) })).optional(),
  }).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "write");
  const { orgId, assessmentId, ...decision } = input;
  return reviewAssessment({ orgId, actorId: identity.user.id }, assessmentId, decision);
});
