import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { amendWorkspaceMemberRole } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

export const PATCH = api(async (request, identity) => {
  const path = new URL(request.url).pathname.split("/");
  const orgId = z.uuid().parse(path.at(-3));
  const userId = z.string().min(1).max(256).parse(decodeURIComponent(path.at(-1)!));
  await requireWorkspace(identity, orgId, "manage");
  return amendWorkspaceMemberRole(identity, orgId, userId, await jsonBody(request));
});
