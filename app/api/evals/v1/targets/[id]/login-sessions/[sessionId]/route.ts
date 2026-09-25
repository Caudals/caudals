import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { revokeLoginSession } from "@/lib/evals/repositories/browser-sessions";
export const runtime = "nodejs";

export const DELETE = api(async (request, identity) => {
  const url = new URL(request.url), parts = url.pathname.split("/");
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  return revokeLoginSession({ orgId, actorId: identity.user.id }, z.uuid().parse(parts.at(-3)), z.uuid().parse(parts.at(-1)));
});
