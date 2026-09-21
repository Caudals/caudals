import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { datasetSigningKey, releaseDataset } from "@/lib/evals/improvements/store";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  requireStageEEnabled(); if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const input = z.strictObject({ orgId: z.uuid(), expectedVersion: z.int().nonnegative() }).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "manage");
  const batchId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  return releaseDataset({ orgId: input.orgId, actorId: identity.user.id }, batchId, datasetSigningKey(), undefined, { key, expectedVersion: input.expectedVersion });
});
