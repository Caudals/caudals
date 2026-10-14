import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { dataControlsEnabled } from "@/lib/evals/data-controls/flags";
import { listWorkspaceExports, requestWorkspaceExport } from "@/lib/evals/operations/workspace-export";

export const runtime = "nodejs";

/** "Export all workspace data" (launch L-32, P-44): owners ask for a ZIP built in the background and list their exports. */
function enabled() {
  if (!dataControlsEnabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
}

export const GET = api(async (request, identity) => {
  enabled();
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  return listWorkspaceExports(identity, orgId);
});

export const POST = api(async (request, identity) => {
  enabled();
  const input = z.strictObject({ orgId: z.uuid(), locale: z.enum(["en", "es"]).default("en") }).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "read");
  return requestWorkspaceExport(identity, input.orgId, input.locale);
});
