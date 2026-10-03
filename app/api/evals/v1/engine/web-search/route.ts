import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { removeWebSearchEngine, setWebSearchEngine } from "@/lib/evals/repositories/engine-settings";
export const runtime = "nodejs";

// Connect a web search engine (Tavily, Exa) or replace its key; keys are write-only.
export const PUT = api(async (request, identity) => {
  const { orgId, ...input } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  return setWebSearchEngine(identity, orgId, input);
});

export const DELETE = api(async (request, identity) => {
  const url = new URL(request.url);
  return removeWebSearchEngine(identity, z.uuid().parse(url.searchParams.get("orgId")), z.string().max(20).parse(url.searchParams.get("engine")));
});
