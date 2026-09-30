import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadKeyring } from "../security/envelope";
import { openBrowserMessage, sealBrowserMessage } from "../security/browser-wire";
import { EvalError } from "../domain/errors";

export const browserControlMessages: Record<string, string> = {
  browser_session_expired: "This remote browser session has expired. Reopen Teach Mode and sign in again.",
  browser_capacity: "The remote browser is in use. Close the other session or try again shortly.",
  browser_busy: "The browser is busy. Wait for the current action to finish.",
  control_required: "Choose Take control to interact with this browser.",
  teach_required: "Choose an element to teach, then select it in the browser.",
  selector_ambiguous: "This element has no unique stable locator. Select its button, input or response wrapper, or ask the app owner to add data-testid.",
  selector_unavailable: "The selected element is unavailable. Reopen Teach Mode to repair it.",
  teach_incomplete: "Select the prompt input and assistant response before saving.",
  completion_signal_required: "Select a send button that disables during streaming, or teach a loading indicator while it is visible.",
  selector_or_navigation_timeout: "The page or selected element timed out. Sign in again or repair the connector in Teach Mode.",
  capture_incomplete: "The response did not finish. Teach the app's loading indicator or a send button that disables during streaming, then test again.",
  recipe_probe_failed: "The connection could not capture distinct complete replies after a fresh-session reset. Repair the response or completion element in Teach Mode.",
  login_required: "Return to the target app after completing sign-in, then save the connector.",
  website_recipe_origin_mismatch: "Return to the configured app before teaching or saving its connector.",
  browser_session_unavailable: "The saved login is unavailable. Reopen Teach Mode and sign in again.",
};

export async function browserControlRequest(input: unknown) {
  const file = process.env.EVALS_BROWSER_SESSION_KEYRING_FILE;
  if (!file) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Remote browser sessions are not configured.");
  const keys = loadKeyring(file), requestId = randomUUID();
  const endpoint = process.env.EVALS_BROWSER_CONTROL_URL ?? "http://caudals-evals-browser-db-relay:8089/control";
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "X-Browser-Request": requestId }, body: JSON.stringify(sealBrowserMessage(input, keys, "request", requestId)), signal: AbortSignal.timeout(40_000), redirect: "error" });
  } catch { throw new EvalError("PROVIDER_UNAVAILABLE", 503, "The remote browser is unavailable. Try reopening Teach Mode shortly."); }
  if (!response.ok) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "The remote browser is unavailable.");
  const result = z.object({ data: z.unknown().optional(), error: z.string().optional() }).parse(openBrowserMessage(await response.json(), keys, "response", requestId));
  if (result.error) throw new EvalError("CONNECTION_UNSUPPORTED", 409, browserControlMessages[result.error] ?? "The browser could not complete this action. Reopen Teach Mode to sign in or repair the connector.");
  return result.data;
}
