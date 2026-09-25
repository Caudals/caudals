import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { revokeProviderKey } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

export const DELETE = api(async (request, identity) => {
  const url = new URL(request.url);
  return revokeProviderKey(identity, z.uuid().parse(url.searchParams.get("orgId")), z.uuid().parse(url.pathname.split("/").at(-1)));
});
