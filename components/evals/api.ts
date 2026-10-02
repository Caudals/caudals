import { t } from "@/lib/evals/messages/en";
import { trServer } from "@/lib/evals/messages/phrases";
export class EvalRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
    serverMessage?: string,
  ) {
    const message = getSafeErrorMessage(status, code, serverMessage);
    super(status >= 500 && requestId && !["PROVIDER_UNAVAILABLE", "BUDGET_UNAVAILABLE"].includes(code) ? `${message} Reference: ${requestId}.` : message);
    this.name = "EvalRequestError";
  }
}

/**
 * The API only ever returns curated messages (a known EvalError sentence or a
 * generic fallback), so a 4xx message is safe to show and far more useful than
 * a generic one. Sessions, permissions and server faults keep fixed wording.
 */
function getSafeErrorMessage(status: number, code: string, serverMessage?: string): string {
  if (code === "REAUTHENTICATION_REQUIRED") return t("reauthRequired");
  if (status === 401) return t("expired");
  if (status === 403) return t("forbidden");
  if (status === 404) return t("notFound");
  if (status >= 400 && status < 500 && serverMessage && !/^Check the supplied fields\.?$/.test(serverMessage) && !code.startsWith("INVITATION_")) return trServer(serverMessage);
  if (
    [
      "INVITATION_INVALID",
      "INVITATION_EXPIRED",
      "INVITATION_REVOKED",
      "INVITATION_UNAVAILABLE",
    ].includes(code)
  ) return t("invalidInvite");
  if (status === 409) return t("reloadAndRetry");
  if (status === 429) return t("tryAgainShortly");
  // Configuration gaps (no model, no budget) carry a curated sentence that tells the person what to do.
  if (status === 503 && serverMessage && ["PROVIDER_UNAVAILABLE", "BUDGET_UNAVAILABLE"].includes(code)) return trServer(serverMessage);
  if (status >= 500) return t("error");
  return t("checkDetails");
}
/** Fired when the API reports that the session is gone; the shell offers sign-in. */
export const SESSION_EXPIRED_EVENT = "caudals:session-expired";

export async function evalRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`/api/evals/v1${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null);
  // A request for a fresh confirmation is not an expired session.
  if (response.status === 401 && result?.error?.code !== "REAUTHENTICATION_REQUIRED" && typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  if (!response.ok)
    throw new EvalRequestError(
      response.status,
      result?.error?.code ?? "UNKNOWN",
      result?.error?.request_id,
      typeof result?.error?.message === "string" ? result.error.message : undefined,
    );
  if (!result || !("data" in result)) throw new Error(t("error"));
  return result.data as T;
}
