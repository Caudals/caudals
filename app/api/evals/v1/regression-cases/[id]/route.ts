import { z } from "zod";
import { api, EvalError, requireWorkspace } from "@/lib/evals/domain/http";
import { getRegressionDraft } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";

export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const regressionId = z.uuid().parse(url.pathname.split("/").at(-1));
  await requireWorkspace(identity, orgId, "read");
  if (!identity.platformRole) {
    throw new EvalError("SCOPE_DENIED", 403, "Only a Caudals operator can inspect regression drafts.");
  }
  return getRegressionDraft({ orgId, actorId: identity.user.id }, regressionId);
});
