import { z } from "zod";
import { api, EvalError, requireWorkspace } from "@/lib/evals/domain/http";
import { dataControlsEnabled } from "@/lib/evals/data-controls/flags";
import { deleteWorkspaceExport } from "@/lib/evals/operations/workspace-export";

export const runtime = "nodejs";

/** An owner deletes a workspace export; its stored file goes with the next retention pass (launch L-32). */
export const DELETE = api(async (request, identity) => {
  if (!dataControlsEnabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const id = z.uuid().parse(url.pathname.split("/").at(-1));
  await requireWorkspace(identity, orgId, "read");
  return deleteWorkspaceExport(identity, orgId, id);
});
