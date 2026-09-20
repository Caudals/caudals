import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { recordWebsiteAuthorization } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  const input = z.strictObject({ orgId: z.uuid(), targetId: z.uuid(), confirmed: z.literal(true) }).parse(await jsonBody(request));
  const projectId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "write");
  return recordWebsiteAuthorization(
    { orgId: input.orgId, actorId: identity.user.id }, projectId, input.targetId,
    request.headers.get("idempotency-key") ?? "",
  );
});
