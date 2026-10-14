import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { requirePackAuthorIdentity } from "@/lib/evals/sector-packs/http";
import { removePackItem } from "@/lib/evals/sector-packs/store";

export const runtime = "nodejs";

// Remove a question from an open version (staff and experts); audited.
export const DELETE = api(async (request, identity) => {
  await requirePackAuthorIdentity(identity);
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
  return removePackItem(identity.user.id, id);
});
