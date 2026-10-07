import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { advanceEvaluationRestarts, controlEvaluation, getEvaluationControls } from "@/lib/evals/repositories/evaluation-controls";

export const runtime = "nodejs";
export const GET = api(async (request, identity) => {
  const url = new URL(request.url), orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const evaluationId = z.uuid().parse(url.pathname.split("/").at(-2));
  await requireWorkspace(identity, orgId, "read");
  return getEvaluationControls({ orgId, actorId: identity.user.id }, evaluationId);
});
export const POST = api(async (request, identity) => {
  const { orgId, ...input } = z.strictObject({ orgId: z.uuid(), action: z.enum(["pause", "resume", "stop", "restart"]), subjectId: z.uuid(), subjectKind: z.enum(["generation", "run"]), locale: z.enum(["en", "es"]).default("en") }).parse(await jsonBody(request));
  const evaluationId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, orgId, "write");
  const scope = { orgId, actorId: identity.user.id };
  const result = await controlEvaluation(scope, evaluationId, input, request.headers.get("idempotency-key") ?? "");
  if (input.action === "restart") {
    await advanceEvaluationRestarts(scope, evaluationId);
    return getEvaluationControls(scope, evaluationId);
  }
  return result;
});
