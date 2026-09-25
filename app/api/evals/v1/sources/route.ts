import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { listSources } from "@/lib/evals/repositories/operator-actions";
export const runtime = "nodejs";

// Source library listing: provenance, revisions and extraction state; no content.
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "write");
  return listSources({ orgId, actorId: identity.user.id });
});
