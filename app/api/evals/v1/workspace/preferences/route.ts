import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { setNotificationPreferences } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";
export const PATCH = api(async (request, identity) => {
  const input = z
    .strictObject({
      orgId: z.uuid(),
      completion: z.boolean(),
      requiredInput: z.boolean(),
      failure: z.boolean(),
      // Legacy single email switch; clients since launch L-07 send the categories.
      email: z.boolean().optional(),
      emailCompletion: z.boolean().optional(),
      emailRequiredInput: z.boolean().optional(),
      emailFailure: z.boolean().optional(),
      emailBilling: z.boolean().optional(),
      emailRegressions: z.boolean().optional(),
      lifecycle: z.boolean().optional(),
      locale: z.enum(["en", "es"]).optional(),
    })
    .parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "read");
  const { orgId, ...preferences } = input;
  return setNotificationPreferences(
    { orgId, actorId: identity.user.id },
    preferences,
  );
});
