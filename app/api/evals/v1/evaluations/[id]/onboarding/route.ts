import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { getFirstEvaluation, helpReason, markOnboardingHelpNotified, onboardingEnabled, requestOnboardingHelp } from "@/lib/evals/repositories/onboarding";
import { notifyOperatorsOfHelp } from "@/lib/evals/onboarding/help-email";

export const runtime = "nodejs";
const evaluationId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

/**
 * The evaluation's "first evaluation" state (launch L-06): connection check,
 * reading the site, the automatic test set and any open help request. Reading
 * it also advances a pending automatic start, so an open page starts
 * preparation as soon as the site is read. Off (empty) without ONBOARDING_AUTOSTART.
 */
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  return getFirstEvaluation({ orgId, actorId: identity.user.id }, evaluationId(request));
});

/** "Get help": opens one ops task per evaluation and emails the operators once. */
export const POST = api(async (request, identity) => {
  if (!onboardingEnabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
  const { orgId } = z.strictObject({ orgId: z.uuid(), action: z.literal("help") }).parse(await jsonBody(request, 1024));
  const id = evaluationId(request);
  await requireWorkspace(identity, orgId, "read");
  const scope = { orgId, actorId: identity.user.id };
  const reason = helpReason(await getFirstEvaluation(scope, id));
  const help = await requestOnboardingHelp(scope, id, reason);
  if (!help.notified) {
    try {
      await notifyOperatorsOfHelp({ requestId: help.id, orgId, evaluationId: id, workspace: help.workspace, evaluation: help.evaluation, reason });
      await markOnboardingHelpNotified(scope, help.id);
    } catch {
      // The task exists and is listed in Ops → Growth; the next click retries the email.
      console.error("onboarding_help_notify_failed", { request_id: help.id });
    }
  }
  return { id: help.id, status: "open", created: help.created, reason };
});
