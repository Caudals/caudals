import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { listNotifications } from "@/lib/evals/repositories/notifications";
export const runtime = "nodejs";

export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  return listNotifications({ orgId, actorId: identity.user.id });
});
