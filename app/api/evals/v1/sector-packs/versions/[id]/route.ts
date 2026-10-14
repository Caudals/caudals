import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { requirePackAuthorIdentity } from "@/lib/evals/sector-packs/http";
import { getPackVersion } from "@/lib/evals/sector-packs/store";

export const runtime = "nodejs";

// One version with its items, sources, rights, reviews and anonymous results.
export const GET = api(async (request, identity) => {
  const role = await requirePackAuthorIdentity(identity);
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
  return { role, ...(await getPackVersion(identity.user.id, id, role)) };
});
