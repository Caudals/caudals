import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { listActivity } from "@/lib/evals/repositories/notifications";
export const runtime = "nodejs";

// Queued, running and recent jobs for the workspace activity panel.
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  return listActivity({ orgId, actorId: identity.user.id });
});
