import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { forkSuite } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  const input = z
    .strictObject({ orgId: z.uuid(), suiteVersionId: z.uuid(), title: z.string().min(1).max(200) })
    .parse(await jsonBody(request));
  const suiteId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "write");
  return forkSuite(
    { orgId: input.orgId, actorId: identity.user.id },
    suiteId,
    input.suiteVersionId,
    input.title,
    request.headers.get("idempotency-key") ?? "",
  );
});
