import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { getWebDiscovery, requestWebDiscovery } from "@/lib/evals/repositories/web-discovery";
export const runtime = "nodejs";

// "Find sources on the web": start a search, then read its suggestions.
const evaluationId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "write");
  return getWebDiscovery({ orgId, actorId: identity.user.id }, evaluationId(request));
});

export const POST = api(async (request, identity) => {
  const { orgId } = z.strictObject({ orgId: z.uuid() }).parse(await jsonBody(request));
  await requireWorkspace(identity, orgId, "write");
  return requestWebDiscovery({ orgId, actorId: identity.user.id }, evaluationId(request));
});
