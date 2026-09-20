import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { releaseRegressionCase } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";

export const POST = api(async (request, identity) => {
  const input = z.strictObject({
    orgId: z.uuid(),
    candidateRevisionId: z.uuid(),
    redactionConfirmed: z.literal(true),
    validationConfirmed: z.literal(true),
  }).parse(await jsonBody(request));
  const regressionId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "write");
  if (!identity.platformRole) {
    throw new EvalError("SCOPE_DENIED", 403, "A Caudals operator must review and release regression cases.");
  }
  return releaseRegressionCase(
    { orgId: input.orgId, actorId: identity.user.id },
    regressionId,
    input.candidateRevisionId,
    request.headers.get("Idempotency-Key") ?? "",
  );
});
