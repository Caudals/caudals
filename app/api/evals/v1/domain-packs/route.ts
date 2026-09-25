import { api, EvalError } from "@/lib/evals/domain/http";
import { DOMAIN_PACKS } from "@/lib/evals/generation/pack-registry";
export const runtime = "nodejs";

// Internal pack registry (spec §9.4); operators only.
export const GET = api(async (_request, identity) => {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return DOMAIN_PACKS;
});
