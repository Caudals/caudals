import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { requirePlatformAdmin } from "@/lib/evals/repositories/platform";
import { withTenant } from "@/lib/evals/repositories/db";
export const runtime = "nodejs";

export const GET = api(async (request, identity) => {
  requirePlatformAdmin(identity);
  const orgId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, orgId, "manage");
  return withTenant({ orgId, actorId: identity.user.id }, async (c) =>
    (await c.query("SELECT user_id,email,role,created_at FROM evals.list_workspace_members($1)", [orgId])).rows);
});
