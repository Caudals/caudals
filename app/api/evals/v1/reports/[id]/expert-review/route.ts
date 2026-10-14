import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireExpertReviewOrders } from "@/lib/evals/domain/features";
import { reviewRequestInputSchema } from "@/lib/evals/experts/review-contracts";
import { getReportReviewRequest, markReviewRequestNotified, requestExpertReview } from "@/lib/evals/experts/review-orders";
import { notifyFoundersOfReviewRequest } from "@/lib/evals/experts/review-email";

export const runtime = "nodejs";
const reportId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

/** The report's expert-review request as its members see it (launch L-26). */
export const GET = api(async (request, identity) => {
  requireExpertReviewOrders();
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  return { request: await getReportReviewRequest({ orgId, actorId: identity.user.id }, reportId(request)) };
});

/**
 * "Have an expert review this" (P-10): one request per report, with an ops
 * task (the request), a Warmbly CRM draft (never sent) and one email to the
 * founders at the internal address. A second click returns the open request.
 */
export const POST = api(async (request, identity) => {
  requireExpertReviewOrders();
  const input = reviewRequestInputSchema.parse(await jsonBody(request, 8_192));
  await requireWorkspace(identity, input.orgId, "manage");
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  const result = await requestExpertReview(scope, reportId(request), input, { name: identity.user.name, email: identity.user.email });
  if (!result.notified) {
    try {
      await notifyFoundersOfReviewRequest({
        requestId: result.request.id, workspace: result.context.workspace, report: result.context.report, scopeKind: input.scopeKind,
        sector: input.sector, deadline: input.deadline ?? null, replyDueAt: result.request.replyDueAt, hasNote: Boolean(input.scopeNote),
      });
      await markReviewRequestNotified(scope, result.request.id);
    } catch {
      // The request and its CRM draft exist and are listed in Ops → Expert work; the next click retries the email.
      console.error("review_request_notify_failed", { request_id: result.request.id });
    }
  }
  return { request: result.request, created: result.created };
});
