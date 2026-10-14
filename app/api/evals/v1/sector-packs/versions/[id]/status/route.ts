import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import { requirePackAuthorIdentity } from "@/lib/evals/sector-packs/http";
import { transitionPackVersion } from "@/lib/evals/sector-packs/store";

export const runtime = "nodejs";

// Submit for review, return to draft or publish (staff). Publishing needs every question approved by an expert.
export const POST = api(async (request, identity) => {
  const role = await requirePackAuthorIdentity(identity);
  if (!role.staff) throw new EvalError("SCOPE_DENIED", 403, "Only Caudals staff move a pack version.");
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  const input = z.strictObject({ to: z.enum(["draft", "in_review", "published"]) }).parse(await jsonBody(request));
  return transitionPackVersion(identity.user.id, id, input.to);
});
