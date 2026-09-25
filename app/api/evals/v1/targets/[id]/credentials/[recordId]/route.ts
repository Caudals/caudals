import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { revokeTargetCredential } from "@/lib/evals/repositories/credentials";
export const runtime = "nodejs";

export const DELETE = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const recordId = z.uuid().parse(url.pathname.split("/").at(-1));
  await requireWorkspace(identity, orgId, "write");
  return revokeTargetCredential({ orgId, actorId: identity.user.id }, recordId);
});
