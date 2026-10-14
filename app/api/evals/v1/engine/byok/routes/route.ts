import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { clearByokRoute, setByokRoute } from "@/lib/evals/repositories/byok";
export const runtime = "nodejs";

// Which engine roles run on a workspace key (launch L-27). DELETE goes back to Caudals' models.
export const PUT = api(async (request, identity) => {
  const { orgId, ...input } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request, 4096));
  return setByokRoute(identity, orgId, input);
});

export const DELETE = api(async (request, identity) => {
  const url = new URL(request.url);
  return clearByokRoute(identity, z.uuid().parse(url.searchParams.get("orgId")), url.searchParams.get("role") ?? "all");
});
