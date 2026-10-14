import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { connectByokKey, getByokSettings } from "@/lib/evals/repositories/byok";
export const runtime = "nodejs";

// Settings → AI models for workspace owners: their own provider keys (launch
// L-27, spec §6.11). Keys are write-only: no response carries one.
export const GET = api(async (request, identity) =>
  getByokSettings(identity, z.uuid().parse(new URL(request.url).searchParams.get("orgId"))));

export const POST = api(async (request, identity) => {
  const { orgId, ...input } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request, 4096));
  return connectByokKey(identity, orgId, input);
});
