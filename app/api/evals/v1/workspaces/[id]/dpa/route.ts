import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { acceptDpa, getDpaStatus } from "@/lib/legal/dpa";

export const runtime = "nodejs";

/** `/api/evals/v1/workspaces/:id/dpa` (launch L-30, P-42): the workspace's DPA status, and an owner's click-through acceptance. */
function workspaceId(request: Request) {
  return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
}

export const GET = api(async (request, identity) => {
  const orgId = workspaceId(request);
  await requireWorkspace(identity, orgId, "read");
  return getDpaStatus(identity, orgId);
});

export const POST = api(async (request, identity) => {
  const orgId = workspaceId(request);
  const input = z
    .strictObject({
      version: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}([.-][a-z0-9]{1,16})?$/),
      locale: z.enum(["en", "es"]).optional(),
      requestId: z.string().min(8).max(200),
    })
    .parse(await jsonBody(request));
  await requireWorkspace(identity, orgId, "read");
  return acceptDpa(identity, orgId, { version: input.version, locale: input.locale ?? null, requestId: input.requestId });
});
