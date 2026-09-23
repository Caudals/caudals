import { t } from "@/lib/evals/messages/en";
export class EvalRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    const message = getSafeErrorMessage(status, code);
    super(status >= 500 && requestId ? `${message} Reference: ${requestId}.` : message);
    this.name = "EvalRequestError";
  }
}

function getSafeErrorMessage(status: number, code: string): string {
  if (status === 401) return t("expired");
  if (status === 403) return t("forbidden");
  if (status === 404) return t("notFound");
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
  if (status >= 500) return t("error");
  return t("checkDetails");
}
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
  if (!response.ok)
    throw new EvalRequestError(
      response.status,
      result?.error?.code ?? "UNKNOWN",
      result?.error?.request_id,
    );
  if (!result || !("data" in result)) throw new Error(t("error"));
  return result.data as T;
}
