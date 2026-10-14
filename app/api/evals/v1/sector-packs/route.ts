import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import { requirePackAuthorIdentity } from "@/lib/evals/sector-packs/http";
import { importPackFile, listPacks } from "@/lib/evals/sector-packs/store";

export const runtime = "nodejs";

// Sector packs with their versions and review counts (launch L-25): Caudals staff and experts.
export const GET = api(async (_request, identity) => {
  const role = await requirePackAuthorIdentity(identity);
  return { role, packs: await listPacks(identity.user.id) };
});

// Import a pack file (caudals.sector-pack/v1) into the pack's open version: staff only.
export const POST = api(async (request, identity) => {
  const role = await requirePackAuthorIdentity(identity);
  if (!role.staff) throw new EvalError("SCOPE_DENIED", 403, "Only Caudals staff import packs.");
  return importPackFile(identity.user.id, await jsonBody(request, 2_000_000));
});
