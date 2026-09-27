import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { addProviderConnection } from "@/lib/evals/repositories/engine-settings";
export const runtime = "nodejs";

export const POST = api(async (request, identity) => {
  const { orgId, ...connection } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  return addProviderConnection(identity, orgId, connection);
});
