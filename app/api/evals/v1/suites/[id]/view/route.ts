import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { getTestSetView } from "@/lib/evals/repositories/evidence";
export const runtime = "nodejs";

// Read a test set: versions, the editable draft and the cases of one version with their source excerpts.
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const suiteId = z.uuid().parse(url.pathname.split("/").at(-2));
  const version = url.searchParams.get("version");
  await requireWorkspace(identity, orgId, "read");
  return getTestSetView({ orgId, actorId: identity.user.id }, suiteId, version === "draft" || !version ? version ?? undefined : z.uuid().parse(version));
});
