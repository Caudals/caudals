import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { controlRun } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  const input = z
    .strictObject({ orgId: z.uuid(), action: z.enum(["pause", "resume", "cancel"]) })
    .parse(await jsonBody(request));
  const runId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "write");
  return controlRun(
    { orgId: input.orgId, actorId: identity.user.id },
    runId,
    input.action,
  );
});
