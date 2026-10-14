import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { deleteReportQuestion, getReportQuestion } from "@/lib/evals/repositories/report-questions";
export const runtime = "nodejs";

/**
 * One question about a report (launch L-36): read it while the engine answers
 * (any member), or erase it with its answer (owners and operators; works
 * whatever REPORT_QUESTIONS_ENABLED says).
 */
function ids(request: Request) {
  const parts = new URL(request.url).pathname.split("/");
  return { reportId: z.uuid().parse(parts.at(-3)), questionId: z.uuid().parse(parts.at(-1)) };
}

export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  const { reportId, questionId } = ids(request);
  return getReportQuestion({ orgId, actorId: identity.user.id }, reportId, questionId);
});

export const DELETE = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  const { reportId, questionId } = ids(request);
  return deleteReportQuestion({ orgId, actorId: identity.user.id }, reportId, questionId, identity.platformRole === "platform_admin");
});
