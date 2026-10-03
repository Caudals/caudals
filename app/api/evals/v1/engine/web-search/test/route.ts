import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { testWebSearch } from "@/lib/evals/repositories/engine-settings";
export const runtime = "nodejs";

// One live search with a stored engine key.
export const POST = api(async (request, identity) => {
  const { orgId, ...input } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  return testWebSearch(identity, orgId, input);
});
