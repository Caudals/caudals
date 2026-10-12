import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { revisionForAdmin } from "@/lib/billing/api";
export const runtime = "nodejs";

export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  return revisionForAdmin(identity, z.uuid().parse(url.searchParams.get("orgId")), url.pathname.split("/").at(-1) ?? "");
});
