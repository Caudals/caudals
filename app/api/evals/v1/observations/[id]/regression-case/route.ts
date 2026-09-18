import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { createRegressionDraft } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  const { orgId } = z
    .strictObject({ orgId: z.uuid() })
    .parse(await jsonBody(request));
  const observationId = z.uuid().parse(
    new URL(request.url).pathname.split("/").at(-2),
  );
  await requireWorkspace(identity, orgId, "write");
  return createRegressionDraft(
    { orgId, actorId: identity.user.id },
    observationId,
  );
});
