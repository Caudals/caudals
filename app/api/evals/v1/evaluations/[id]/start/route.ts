import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { createSelfServiceRun } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  const body = z
    .strictObject({
      orgId: z.uuid(),
      targetRevisionId: z.uuid().optional(),
      suiteVersionId: z.uuid().optional(),
    })
    .parse(await jsonBody(request));
  const evaluationId = z.uuid().parse(
    new URL(request.url).pathname.split("/").at(-2),
  );
  await requireWorkspace(identity, body.orgId, "write");
  const { orgId, ...selection } = body;
  return createSelfServiceRun(
    { orgId, actorId: identity.user.id },
    { evaluationId, ...selection },
    request.headers.get("idempotency-key") ?? "",
  );
});
