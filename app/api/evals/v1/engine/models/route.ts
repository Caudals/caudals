import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { listConnectionModels } from "@/lib/evals/repositories/engine-settings";
export const runtime = "nodejs";

export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  return listConnectionModels(identity, z.uuid().parse(url.searchParams.get("orgId")), z.string().min(1).max(64).parse(url.searchParams.get("connectionId")));
});
