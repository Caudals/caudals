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
      email: z.boolean(),
    })
    .parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "read");
  const { orgId, ...preferences } = input;
  return setNotificationPreferences(
    { orgId, actorId: identity.user.id },
    preferences,
  );
});
