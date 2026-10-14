import { z } from "zod";
import { api, EvalError, requireWorkspace } from "@/lib/evals/domain/http";
import { dataControlsEnabled } from "@/lib/evals/data-controls/flags";
import { openWorkspaceExport } from "@/lib/evals/operations/workspace-export";

export const runtime = "nodejs";

/** Streams a finished workspace export to an owner (launch L-32); the stream fails rather than end on altered bytes. */
export const GET = api(async (request, identity) => {
  if (!dataControlsEnabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const id = z.uuid().parse(url.pathname.split("/").at(-2));
  await requireWorkspace(identity, orgId, "read");
  const file = await openWorkspaceExport(identity, orgId, id);
  return new Response(file.stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Length": String(file.byteSize),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
