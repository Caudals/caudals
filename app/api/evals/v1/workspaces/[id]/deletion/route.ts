import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { getDeletionRequest, requestWorkspaceDeletion } from "@/lib/evals/operations/lifecycle";
export const runtime = "nodejs";

// Workspace data deletion (spec §16.4): access stops immediately; objects are
// deleted by the lifecycle worker and a tombstone plus recovery ledger remain.
function orgId(request: Request) { return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2)); }

export const GET = api(async (request, identity) => {
  const id = orgId(request);
  await requireWorkspace(identity, id, "manage");
  return getDeletionRequest({ orgId: id, actorId: identity.user.id });
});

export const POST = api(async (request, identity) => {
  const id = orgId(request);
  const { reason, confirmName } = z.strictObject({ reason: z.string().trim().min(3).max(2000), confirmName: z.string() }).parse(await jsonBody(request));
  await requireWorkspace(identity, id, "manage");
  const workspace = identity.workspaces.find((item) => item.id === id);
  if (!workspace || workspace.name !== confirmName) throw new EvalError("INPUT_INVALID", 422, "Type the workspace name exactly to confirm deletion.");
  return requestWorkspaceDeletion({ orgId: id, actorId: identity.user.id }, reason);
});
