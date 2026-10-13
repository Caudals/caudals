import { api } from "@/lib/evals/domain/http";
import { runCreditsForPlatform } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform roles (L-16, run inspector): credits charged next to our cost per engine attempt (?orgId=).
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  return runCreditsForPlatform(identity, url.pathname.split("/").at(-1) ?? "", url.searchParams);
});
