import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { getDemoSettings, setDemoModel } from "@/lib/evals/repositories/demo-settings";
export const runtime = "nodejs";

export const GET = api(async (request, identity) =>
  getDemoSettings(identity, z.uuid().parse(new URL(request.url).searchParams.get("orgId"))));

export const PUT = api(async (request, identity) => {
  const { orgId, ...input } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request));
  return setDemoModel(identity, orgId, input);
});
