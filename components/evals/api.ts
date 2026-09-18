import { t } from "@/lib/evals/messages/en";
export class EvalRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(
      status === 401
        ? t("expired")
        : status === 403
          ? t("forbidden")
          : [
                "INVITATION_INVALID",
                "INVITATION_EXPIRED",
                "INVITATION_REVOKED",
                "INVITATION_UNAVAILABLE",
              ].includes(code)
            ? t("invalidInvite")
            : t("error"),
    );
  }
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
    );
  if (!result || !("data" in result)) throw new Error(t("error"));
  return result.data as T;
}
