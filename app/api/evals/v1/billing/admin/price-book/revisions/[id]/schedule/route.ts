import { api, jsonBody } from "@/lib/evals/domain/http";
import { transitionForAdmin } from "@/lib/billing/api";
export const runtime = "nodejs";

export const POST = api(async (request, identity) =>
  transitionForAdmin(request, identity, new URL(request.url).pathname.split("/").at(-2) ?? "", "schedule", await jsonBody(request)));
