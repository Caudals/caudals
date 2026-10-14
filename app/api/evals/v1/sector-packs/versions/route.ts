import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { requirePackAuthorIdentity } from "@/lib/evals/sector-packs/http";
import { openPackVersion } from "@/lib/evals/sector-packs/store";

export const runtime = "nodejs";

// Open the next version of a pack (a copy of the newest published version, or empty).
export const POST = api(async (request, identity) => {
  await requirePackAuthorIdentity(identity);
  const input = z.strictObject({ packId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/), notes: z.string().trim().max(2000).default("") }).parse(await jsonBody(request));
  return openPackVersion(identity.user.id, input.packId, input.notes);
});
