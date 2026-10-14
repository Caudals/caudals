import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireSectorPacks } from "@/lib/evals/sector-packs/http";
import { SECTORS } from "@/lib/evals/sector-packs/sectors";
import { getLibrarySetting, setLibrarySetting } from "@/lib/evals/sector-packs/store";

export const runtime = "nodejs";

// The workspace's sector (for sector question suggestions) and its monthly new-questions opt-in.
export const GET = api(async (request, identity) => {
  requireSectorPacks();
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  return getLibrarySetting({ orgId, actorId: identity.user.id });
});

export const PUT = api(async (request, identity) => {
  requireSectorPacks();
  const input = z.strictObject({ orgId: z.uuid(), sector: z.enum(SECTORS).nullable().optional(), monthlyQuestions: z.boolean().optional() }).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "write");
  return setLibrarySetting({ orgId: input.orgId, actorId: identity.user.id }, { sector: input.sector, monthlyQuestions: input.monthlyQuestions });
});
