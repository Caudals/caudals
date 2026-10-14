import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { reportQuestionsEnabledFor } from "@/lib/evals/reports/question-flags";
import { QUESTION_MAX_CHARS } from "@/lib/evals/reports/questions";
import { askReportQuestion, reportQuestionsState } from "@/lib/evals/repositories/report-questions";
import { consumeRateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";

/**
 * "Ask your report" (launch L-36, REPORT_QUESTIONS_ENABLED or
 * REPORT_QUESTIONS_WORKSPACE_IDS): the panel's state for one revision (any
 * member) and asking a question (owners, editors and operators). Workspace
 * sessions only: a share link never reaches this route.
 */
function reportId(request: Request) {
  return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
}

export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const revisionId = z.uuid().parse(url.searchParams.get("revisionId"));
  await requireWorkspace(identity, orgId, "read");
  return reportQuestionsState({ orgId, actorId: identity.user.id }, reportId(request), revisionId,
    { enabled: reportQuestionsEnabledFor(orgId), admin: identity.platformRole === "platform_admin" });
});

const askSchema = z.strictObject({
  orgId: z.uuid(),
  revisionId: z.uuid(),
  question: z.string().trim().min(1).max(QUESTION_MAX_CHARS),
  locale: z.enum(["en", "es"]).default("en"),
});

export const POST = api(async (request, identity) => {
  const input = askSchema.parse(await jsonBody(request, 8192));
  await requireWorkspace(identity, input.orgId, "write");
  if (!reportQuestionsEnabledFor(input.orgId)) throw new EvalError("SCOPE_DENIED", 404, "This surface is not available.");
  const limited = await consumeRateLimit({ key: `report-questions:${input.orgId}:${identity.user.id}`, limit: 10, windowMs: 60_000 });
  if (!limited.allowed) throw new EvalError("RATE_LIMITED", 429, "Too many questions at once. Try again in a minute.");
  return askReportQuestion({ orgId: input.orgId, actorId: identity.user.id }, reportId(request),
    { revisionId: input.revisionId, question: input.question, locale: input.locale, admin: identity.platformRole === "platform_admin" });
});
