import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { recordInterventionValidation } from "@/lib/evals/improvements/store";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  requireStageEEnabled(); if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const input = z.strictObject({
    orgId: z.uuid(), releaseId: z.uuid(), baselineRunId: z.uuid(), followupRunId: z.uuid(), comparisonId: z.uuid(),
    description: z.string().trim().min(1).max(12_000), evidenceReference: z.string().trim().min(1).max(2_000),
    expectedVersion: z.int().nonnegative(),
  }).parse(await jsonBody(request, 32_000));
  await requireWorkspace(identity, input.orgId, "manage");
  const batchId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  const { orgId, ...validation } = input;
  return recordInterventionValidation({ orgId, actorId: identity.user.id }, batchId, validation, key);
});
