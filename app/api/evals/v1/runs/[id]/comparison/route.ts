import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { runComparison, runComparisonQuery } from "@/lib/evals/monitoring/run-comparison";
import { z } from "zod";

export const runtime = "nodejs";
/** The run against the previous finished run of its evaluation, or `baselineRunId` (launch L-18, P-19). Members. */
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const query = runComparisonQuery.parse({
    orgId: url.searchParams.get("orgId"),
    baselineRunId: url.searchParams.get("baselineRunId") ?? undefined,
    focus: url.searchParams.get("focus")?.split(",").filter(Boolean) ?? undefined,
  });
  const runId = z.uuid().parse(url.pathname.split("/").at(-2));
  await requireWorkspace(identity, query.orgId, "read");
  return runComparison({ orgId: query.orgId, actorId: identity.user.id }, runId, query.baselineRunId, query.focus);
});
