import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { createImprovementBatch, listImprovementBatches } from "@/lib/evals/improvements/store";

export const runtime = "nodejs";
function operator(role: string | null) { if (!role) throw new EvalError("SCOPE_DENIED", 404); }
export const GET = api(async (request, identity) => {
  requireStageEEnabled(); operator(identity.platformRole);
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  return listImprovementBatches({ orgId, actorId: identity.user.id });
});
export const POST = api(async (request, identity) => {
  requireStageEEnabled(); operator(identity.platformRole);
  const input = z.strictObject({ orgId: z.uuid(), projectId: z.uuid(), title: z.string().trim().min(1).max(200), objective: z.string().trim().max(12_000) }).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "manage");
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  const { orgId, ...batch } = input;
  return createImprovementBatch({ orgId, actorId: identity.user.id }, batch, key);
});
