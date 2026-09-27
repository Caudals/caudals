import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { ENGINE_ROLES, clearWorkspaceRoute, setEngineRoute } from "@/lib/evals/repositories/engine-settings";
export const runtime = "nodejs";

export const PUT = api(async (request, identity) => {
  const { orgId, ...route } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  return setEngineRoute(identity, orgId, route);
});

// The workspace inherits the platform default again.
export const DELETE = api(async (request, identity) => {
  const url = new URL(request.url);
  return clearWorkspaceRoute(identity, z.uuid().parse(url.searchParams.get("orgId")), z.enum([...ENGINE_ROLES, "all"]).parse(url.searchParams.get("role")));
});
