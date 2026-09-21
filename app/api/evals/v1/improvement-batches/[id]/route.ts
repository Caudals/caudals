import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { createImprovementTask, getImprovementBatch } from "@/lib/evals/improvements/store";

export const runtime = "nodejs";
const id = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
function operator(role: string | null) { if (!role) throw new EvalError("SCOPE_DENIED", 404); }
export const GET = api(async (request, identity) => {
  requireStageEEnabled(); operator(identity.platformRole);
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  return getImprovementBatch({ orgId, actorId: identity.user.id }, id(request));
});
export const POST = api(async (request, identity) => {
  requireStageEEnabled(); operator(identity.platformRole);
  const input = z.strictObject({
    orgId: z.uuid(), findingId: z.uuid(), expertAssignmentId: z.uuid(),
    kind: z.enum(["grounded_qa", "corrected_response", "preference_pair", "retrieval_content"]),
    familyId: z.string().trim().min(1).max(200), split: z.enum(["development", "training", "validation", "holdout"]),
    rightsBasis: z.enum(["caudals_owned_synthetic", "caudals_owned", "customer_owned", "licensed", "public_domain"]),
  }).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "manage");
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  const { orgId, ...task } = input;
  return createImprovementTask({ orgId, actorId: identity.user.id }, id(request), task, key);
});
