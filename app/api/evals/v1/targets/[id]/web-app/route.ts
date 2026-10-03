import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { remoteActionSchema } from "@/lib/evals/contracts/remote-browser";
import { browserControlMessages, browserControlRequest } from "@/lib/evals/connectors/browser-control-client";
import { EvalError } from "@/lib/evals/domain/errors";
import { websiteControlEndpoint, websiteControlTarget, persistTaughtRecipe } from "@/lib/evals/repositories/web-app-connectors";
import { storeLoginSession } from "@/lib/evals/repositories/browser-sessions";
import { browserProbeEvidenceSchema, browserStorageStateSchema, websiteRecipeSchema } from "@/lib/evals/contracts/browser";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  const input = z.strictObject({ orgId: z.uuid(), command: remoteActionSchema }).parse(await jsonBody(request, 20_000));
  const targetId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "manage");
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  if (!["open", "save", "result", "checkpoint", "autoteach", "close"].includes(input.command.action)) {
    // Live input is latency-sensitive: the attested endpoint is looked up once
    // per short interval, and the browser service rebinds it to the session.
    const endpoint = await websiteControlEndpoint(scope, targetId);
    return browserControlRequest({ at: Date.now(), scope: { ...scope, targetId, endpoint }, action: input.command });
  }
  const target = await websiteControlTarget(scope, targetId);
  const controlScope = { ...scope, targetId, endpoint: target.config.endpoint };
  async function checkpoint(sessionId: string) {
    const data = await browserControlRequest({ at: Date.now(), scope: controlScope, action: { action: "checkpoint", sessionId } });
    const login = z.object({ storageState: browserStorageStateSchema, endpoint: z.url() }).parse(data);
    await storeLoginSession(scope, targetId, { storageState: login.storageState, startUrl: login.endpoint });
    return { saved: true };
  }
  if (input.command.action === "checkpoint") return checkpoint(input.command.sessionId);
  if (input.command.action === "autoteach" || input.command.action === "close") {
    // Keep a successful sign-in even when detection fails before finding a
    // reply. Closing a browser must also release it if capture is unavailable.
    try { await checkpoint(input.command.sessionId); }
    catch (error) {
      if (input.command.action !== "close" && !(error instanceof EvalError &&
        error.message === browserControlMessages.login_required)) throw error;
    }
  }
  const data = await browserControlRequest({ at: Date.now(), scope: { ...scope, targetId, endpoint: target.config.endpoint }, action: input.command,
    ...(input.command.action === "open" ? { initial: { recipe: target.recipe, loginSessionId: target.loginSessionId, startUrl: target.config.login_start_url } } : {}) });
  if (input.command.action === "save" || input.command.action === "result") {
    const result = z.object({ recipe: websiteRecipeSchema, storageState: browserStorageStateSchema, evidence: browserProbeEvidenceSchema.optional(), response: z.string().max(50_000).optional() }).parse(data);
    // Plaintext state never crosses the customer API. Saving reuses the
    // target-scoped envelope registry; the login lasts until revoked or replaced.
    await storeLoginSession(scope, targetId, { storageState: result.storageState, startUrl: result.recipe.start_url });
    const saved = await persistTaughtRecipe(scope, targetId, result.recipe, result.evidence);
    return { ...saved, response: result.response, saved: true };
  }
  return input.command.action === "open" ? { ...(data as object), sessionExpired: target.sessionExpired } : data;
});
