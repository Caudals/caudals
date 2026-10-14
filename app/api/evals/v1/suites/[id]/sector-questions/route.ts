import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireSectorPacks } from "@/lib/evals/sector-packs/http";
import { addSectorQuestions, sectorSuggestion } from "@/lib/evals/sector-packs/store";

export const runtime = "nodejs";

// The "Add N sector questions" suggestion for a test set: published packs for the workspace's sector only.
export const GET = api(async (request, identity) => {
  requireSectorPacks();
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const suiteId = z.uuid().parse(url.pathname.split("/").at(-2));
  await requireWorkspace(identity, orgId, "write");
  return sectorSuggestion({ orgId, actorId: identity.user.id }, suiteId);
});

// Add a published pack's questions to the test set: a new version with sector_generic provenance.
export const POST = api(async (request, identity) => {
  requireSectorPacks();
  const input = z.strictObject({ orgId: z.uuid(), packVersionId: z.uuid() }).parse(await jsonBody(request));
  const suiteId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "write");
  const key = z.string().min(8).max(200).parse(request.headers.get("Idempotency-Key"));
  return addSectorQuestions({ orgId: input.orgId, actorId: identity.user.id }, suiteId, input.packVersionId, key);
});
