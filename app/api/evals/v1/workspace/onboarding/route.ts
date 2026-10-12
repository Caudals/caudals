import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { getWorkspaceOnboarding, onboardingEnabled, updateWorkspaceOnboarding } from "@/lib/evals/repositories/onboarding";
import { exampleEvaluationEnabled } from "@/lib/evals/example/flags";
import { GOALS, SYSTEM_TYPES } from "@/lib/evals/onboarding/config";

export const runtime = "nodejs";

/**
 * The workspace's onboarding state (launch L-06), from real workspace state:
 * the activation checklist, the two-question welcome and whether the example
 * evaluation (launch L-33) is hidden from the workspace's lists.
 */
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "read");
  return getWorkspaceOnboarding({ orgId, actorId: identity.user.id });
});

const update = z.discriminatedUnion("action", [
  z.strictObject({ orgId: z.uuid(), action: z.enum(["dismiss", "restore", "skip"]) }),
  z.strictObject({ orgId: z.uuid(), action: z.enum(["hide_example", "show_example"]) }),
  z.strictObject({ orgId: z.uuid(), action: z.literal("answer"), systemType: z.enum(SYSTEM_TYPES).nullable(), goal: z.enum(GOALS).nullable() })
    .refine((value) => value.systemType !== null || value.goal !== null, "Answer at least one question, or skip."),
]);

/**
 * Dismiss or restore the checklist, answer or skip the welcome
 * (ONBOARDING_AUTOSTART, writers), or hide or show the example evaluation
 * (EXAMPLE_EVALUATION_ENABLED, owners and operators). Roles are checked again in SQL.
 */
export const PATCH = api(async (request, identity) => {
  const { orgId, ...input } = update.parse(await jsonBody(request, 1024));
  const example = input.action === "hide_example" || input.action === "show_example";
  if (!(example ? exampleEvaluationEnabled() : onboardingEnabled())) throw new EvalError("NOT_FOUND", 404, "Not found.");
  await requireWorkspace(identity, orgId, example ? "manage" : "write");
  return updateWorkspaceOnboarding({ orgId, actorId: identity.user.id }, input);
});
