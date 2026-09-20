import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { getWorkspaceSummary } from "@/lib/evals/repositories/stage-c";
import { customerWorkspaceView } from "@/lib/evals/domain/workspace-view";

export const runtime = "nodejs";
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  const value = await getWorkspaceSummary({ orgId, actorId: identity.user.id });
  return identity.platformRole ? value : customerWorkspaceView(value);
});
