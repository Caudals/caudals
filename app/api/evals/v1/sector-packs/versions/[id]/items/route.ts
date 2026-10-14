import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { requirePackAuthorIdentity } from "@/lib/evals/sector-packs/http";
import { savePackItem } from "@/lib/evals/sector-packs/store";

export const runtime = "nodejs";

// Add or edit one question of an open version (staff and experts). An edited question needs a new review.
export const POST = api(async (request, identity) => {
  await requirePackAuthorIdentity(identity);
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  const input = z.strictObject({ item: z.unknown() }).parse(await jsonBody(request, 200_000));
  return savePackItem(identity.user.id, id, input.item);
});
