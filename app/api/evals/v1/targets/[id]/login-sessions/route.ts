import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { listLoginSessions, storeLoginSession } from "@/lib/evals/repositories/browser-sessions";
export const runtime = "nodejs";

// Operator-assisted website login state: write-only, site-scoped, expiring.
function targetId(request: Request) { return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2)); }

export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  return listLoginSessions({ orgId, actorId: identity.user.id }, targetId(request));
});

export const POST = api(async (request, identity) => {
  const input = z.strictObject({ orgId: z.uuid(), storageState: z.unknown(), expiresInHours: z.number().int() }).parse(await jsonBody(request, 262144));
  await requireWorkspace(identity, input.orgId, "manage");
  return storeLoginSession({ orgId: input.orgId, actorId: identity.user.id }, targetId(request), input);
});
