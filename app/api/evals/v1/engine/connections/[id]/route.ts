import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { removeProviderConnection, updateProviderConnection } from "@/lib/evals/repositories/engine-settings";
export const runtime = "nodejs";

export const PATCH = api(async (request, identity) => {
  const { orgId, ...changes } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  return updateProviderConnection(identity, orgId, z.uuid().parse(new URL(request.url).pathname.split("/").at(-1)), changes);
});

export const DELETE = api(async (request, identity) => {
  const url = new URL(request.url);
  return removeProviderConnection(identity, z.uuid().parse(url.searchParams.get("orgId")), z.uuid().parse(url.pathname.split("/").at(-1)));
});
