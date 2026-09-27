import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { renameWorkspace } from "@/lib/evals/repositories/lifecycle";
export const runtime = "nodejs";

export const PATCH = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
  await requireWorkspace(identity, orgId, "manage");
  return renameWorkspace({ orgId, actorId: identity.user.id }, await jsonBody(request));
});
