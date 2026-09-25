import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { listReportNarratives, requestReportNarrative } from "@/lib/evals/repositories/narratives";
export const runtime = "nodejs";

// Optional model-written takeaways for a report revision. The deterministic
// report stands on its own; accepted narrative becomes a new revision that an
// operator still has to publish explicitly.
function reportId(request: Request) {
  return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
}

export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "write");
  return listReportNarratives({ orgId, actorId: identity.user.id }, reportId(request));
});

export const POST = api(async (request, identity) => {
  const { orgId, revisionId } = z.strictObject({ orgId: z.uuid(), revisionId: z.uuid() }).parse(await jsonBody(request));
  await requireWorkspace(identity, orgId, "write");
  return requestReportNarrative({ orgId, actorId: identity.user.id }, reportId(request), revisionId);
});
