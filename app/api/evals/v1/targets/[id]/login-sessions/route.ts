import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { listLoginSessions } from "@/lib/evals/repositories/browser-sessions";
export const runtime = "nodejs";

// Saved website logins: listed here, created only from the live remote browser, revoked by ID.
function targetId(request: Request) { return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2)); }

export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  return listLoginSessions({ orgId, actorId: identity.user.id }, targetId(request));
});
