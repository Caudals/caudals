import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { getWebsitePreview } from "@/lib/evals/repositories/intake";
import { intakeV2Enabled } from "@/lib/evals/intake/flags";
import { EvalError } from "@/lib/evals/domain/errors";

export const runtime = "nodejs";

// A help-centre page list: status, pages, what robots.txt or the prefix left
// out, the plan's page cap and the credits per page read (launch L-34).
export const GET = api(async (request, identity) => {
  if (!intakeV2Enabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const previewId = z.uuid().parse(url.pathname.split("/").at(-1));
  await requireWorkspace(identity, orgId, "write");
  return getWebsitePreview({ orgId, actorId: identity.user.id }, previewId);
});
