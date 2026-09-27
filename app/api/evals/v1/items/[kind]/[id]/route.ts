import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { ITEM_KINDS, deleteItem, renameItem } from "@/lib/evals/repositories/lifecycle";
export const runtime = "nodejs";

// Rename or delete (archive) an evaluation, system, test set, report or source.
function target(request: Request) {
  const [kind, id] = new URL(request.url).pathname.split("/").slice(-2);
  return { kind: z.enum(ITEM_KINDS).parse(kind), id: z.uuid().parse(id) };
}

export const PATCH = api(async (request, identity) => {
  const { kind, id } = target(request);
  const { orgId, ...changes } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  await requireWorkspace(identity, orgId, "write");
  return renameItem({ orgId, actorId: identity.user.id }, kind, id, changes);
});

export const DELETE = api(async (request, identity) => {
  const { kind, id } = target(request);
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "write");
  return deleteItem({ orgId, actorId: identity.user.id }, kind, id);
});
