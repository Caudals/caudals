import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import { resolveOnboardingHelp } from "@/lib/evals/repositories/onboarding";

export const runtime = "nodejs";

/** An operator resolves a "Get help" request (launch L-06). The SQL function checks the operator role again. */
export const POST = api(async (request, identity) => {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  z.strictObject({ action: z.literal("resolve") }).parse(await jsonBody(request, 256));
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
  return { resolved: await resolveOnboardingHelp(identity.user.id, id) };
});
