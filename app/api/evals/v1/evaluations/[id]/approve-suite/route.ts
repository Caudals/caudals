import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { approvePreparedSuite } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  const input = z.strictObject({ orgId: z.uuid(), suiteVersionId: z.uuid() }).parse(await jsonBody(request));
  const evaluationId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "write");
  return approvePreparedSuite(
    { orgId: input.orgId, actorId: identity.user.id },
    evaluationId,
    input.suiteVersionId,
    request.headers.get("idempotency-key") ?? "",
  );
});
