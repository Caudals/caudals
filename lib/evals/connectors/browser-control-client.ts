import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadKeyring } from "../security/envelope";
import { openBrowserMessage, sealBrowserMessage } from "../security/browser-wire";
import { EvalError } from "../domain/errors";

export const browserControlMessages: Record<string, string> = {
  browser_session_expired: "This remote browser session has expired. Reopen the live browser and sign in again.",
  browser_capacity: "The remote browser is in use. Close the other session or try again shortly.",
  browser_busy: "The browser is busy. Wait for the current action to finish.",
  control_required: "Choose Take control to interact with this browser.",
  teach_required: "Choose an element to teach, then select it in the browser.",
  selector_ambiguous: "This element has no unique stable locator. Select its button, input or response wrapper, or ask the app owner to add data-testid.",
  selector_unavailable: "The selected element is unavailable. Reopen the live browser to repair it.",
  teach_incomplete: "Select the prompt input and assistant response before saving.",
  completion_signal_required: "Select a send button that disables during streaming, or teach a loading indicator while it is visible.",
  selector_or_navigation_timeout: "The page or selected element timed out. Sign in again or repair the connector in the live browser.",
  capture_incomplete: "The response did not finish. Teach the app's loading indicator or a send button that disables during streaming, then test again.",
  recipe_probe_failed: "The connection could not capture complete replies after a fresh-session reset. Repair the response or completion element in the live browser.",
  login_required: "The app is asking you to sign in. Use the live browser to sign in, then run Connect system again.",
  website_recipe_origin_mismatch: "Return to the configured app before teaching or saving its connector.",
  browser_session_unavailable: "The saved login is unavailable. Reopen the live browser and sign in again.",
  chat_input_not_found: "No chat box was found on this page. Open the chatbot in the live browser, then run Connect system again.",
  chat_launcher_not_found: "Caudals could not find how to open the chat on a fresh page load. Use Fix next to Chat launcher and click the button that opens it.",
  launcher_unavailable: "The chat launcher was not found on a fresh page load. Repair it in the live browser.",
  response_not_identified: "Caudals could not identify the assistant's reply. Use Fix next to Reply and click the assistant's answer.",
  submit_unverified: "The message was not sent. Use Fix next to Send button and click the app's Send button.",
  target_execution_aborted: "Stopped.",
  browser_state_too_large: "The app's saved login data is too large to store securely.",
  browser_control_denied: "This remote browser belongs to another session. Reopen the live browser.",
};

function controlEndpoint() {
  return process.env.EVALS_BROWSER_CONTROL_URL ?? "http://caudals-evals-browser-db-relay:8089/control";
}

export async function browserControlRequest(input: unknown) {
  const file = process.env.EVALS_BROWSER_SESSION_KEYRING_FILE;
  if (!file) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Remote browser sessions are not configured.");
  const keys = loadKeyring(file), requestId = randomUUID();
  const endpoint = controlEndpoint();
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "X-Browser-Request": requestId }, body: JSON.stringify(sealBrowserMessage(input, keys, "request", requestId)), signal: AbortSignal.timeout(40_000), redirect: "error" });
  } catch { throw new EvalError("PROVIDER_UNAVAILABLE", 503, "The remote browser is unavailable. Try reopening the live browser shortly."); }
  if (!response.ok) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "The remote browser is unavailable.");
  const result = z.object({ data: z.unknown().optional(), error: z.string().optional() }).parse(openBrowserMessage(await response.json(), keys, "response", requestId));
  if (result.error) throw new EvalError("CONNECTION_UNSUPPORTED", 409, browserControlMessages[result.error] ?? "The browser could not complete this action. Reopen the live browser to sign in or repair the connector.");
  return result.data;
}

/**
 * Opens the live frame/state stream for one session. Each line is sealed with
 * the request ID and its sequence number; a missing, reordered or forged line
 * ends the stream.
 */
export async function* browserControlStream(input: { at: number; scope: unknown; sessionId: string }, signal: AbortSignal): AsyncGenerator<unknown> {
  const file = process.env.EVALS_BROWSER_SESSION_KEYRING_FILE;
  if (!file) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Remote browser sessions are not configured.");
  const keys = loadKeyring(file), requestId = randomUUID();
  const endpoint = controlEndpoint().replace(/\/control$/, "/stream");
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "X-Browser-Request": requestId }, body: JSON.stringify(sealBrowserMessage(input, keys, "request", requestId)), signal, redirect: "error" });
  } catch { throw new EvalError("PROVIDER_UNAVAILABLE", 503, "The remote browser is unavailable. Try reopening the live browser shortly."); }
  if (!response.ok || !response.body) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "The remote browser is unavailable.");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "", sequence = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += value;
      if (buffer.length > 8_000_000) throw new Error("browser_stream_overflow");
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (line) yield openBrowserMessage(JSON.parse(line), keys, "response", `${requestId}:${sequence++}`);
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
}
