import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { setRouteWebResearch } from "@/lib/evals/repositories/engine-settings";
export const runtime = "nodejs";

// Public web search on or off for one engine role (platform default or workspace override).
export const PUT = api(async (request, identity) => {
  const { orgId, ...input } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  return setRouteWebResearch(identity, orgId, input);
});
