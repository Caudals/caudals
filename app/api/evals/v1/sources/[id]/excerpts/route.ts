import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { editSourceExcerpts } from "@/lib/evals/repositories/evidence";

export const runtime = "nodejs";
// Edit or remove extracted excerpts; saved as a new revision of the material.
export const POST = api(async (request, identity) => {
  const input = z.strictObject({
    orgId: z.uuid(),
    baseRevisionId: z.uuid(),
    edits: z.array(z.strictObject({ anchorId: z.uuid(), excerpt: z.string().max(4096) })).max(2000),
    removals: z.array(z.uuid()).max(2000),
  }).parse(await jsonBody(request));
  const sourceId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "write");
  const { orgId, ...edit } = input;
  return editSourceExcerpts({ orgId, actorId: identity.user.id }, sourceId, edit, request.headers.get("Idempotency-Key") ?? "");
});
