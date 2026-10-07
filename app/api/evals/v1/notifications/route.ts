import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { listNotifications } from "@/lib/evals/repositories/notifications";
export const runtime = "nodejs";

export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  const params = new URL(request.url).searchParams;
  const beforeAt = params.get("beforeAt"), beforeId = params.get("beforeId");
  const unreadOnly = z.enum(["true", "false"]).optional().parse(params.get("unreadOnly") ?? undefined);
  return listNotifications({ orgId, actorId: identity.user.id }, {
    limit: params.has("limit") ? z.coerce.number().int().min(1).max(100).parse(params.get("limit")) : undefined,
    unreadOnly: unreadOnly === "true",
    ...(beforeAt !== null || beforeId !== null ? { before: { createdAt: beforeAt, id: beforeId } } : {}),
  });
});
