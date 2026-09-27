import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { markNotificationsRead } from "@/lib/evals/repositories/notifications";
export const runtime = "nodejs";

export const POST = api(async (request, identity) => {
  const { orgId, ...input } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  await requireWorkspace(identity, orgId, "read");
  return markNotificationsRead({ orgId, actorId: identity.user.id }, input);
});
