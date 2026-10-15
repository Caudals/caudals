import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { listWorkspacePeople } from "@/lib/evals/repositories/identity";
export const runtime = "nodejs";

/**
 * The people in a workspace and their roles (Settings → Members, launch U1).
 * Owners and operators of the workspace and platform admins, the same rule as
 * its invitations; changing a role stays with platform admins (PATCH …/:userId).
 */
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  return listWorkspacePeople(identity, orgId);
});
