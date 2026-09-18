import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { submitWebsiteRecipe } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  const input = z
    .strictObject({
      orgId: z.uuid(),
      candidateId: z.uuid(),
      source: z.enum(["model_proposed", "operator_authored"]),
      recipe: z.unknown(),
    })
    .parse(await jsonBody(request, 131_072));
  const targetRevisionId = z.uuid().parse(
    new URL(request.url).pathname.split("/").at(-2),
  );
  await requireWorkspace(identity, input.orgId, "write");
  return submitWebsiteRecipe(
    { orgId: input.orgId, actorId: identity.user.id },
    targetRevisionId,
    input,
    request.headers.get("idempotency-key") ?? "",
  );
});
