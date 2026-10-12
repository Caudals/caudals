import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPostgresPool } from "@/lib/db/client";
import { privateHeaders } from "@/lib/evals/domain/http";
import { isEvaluationHost } from "@/lib/evals/domain/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{64}$/;

function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, request_id: randomUUID(), retryable: status >= 500 } }, { status, headers: privateHeaders });
}

/**
 * Unsubscribe from lifecycle ("getting started") email (launch L-07).
 *
 * - `POST ?token=…` with `List-Unsubscribe=One-Click` is the RFC 8058
 *   one-click request mail providers send from the List-Unsubscribe header.
 * - `POST {token}` (JSON) is the confirmation button on
 *   `/workspace/unsubscribe`.
 * - `GET ?token=…` changes nothing: it redirects to that page, so link
 *   scanners cannot unsubscribe anyone.
 *
 * No sign-in: the 256-bit token in the email is the authority, and it can
 * only switch lifecycle email off. Idempotent. An unknown token answers
 * `{unsubscribed: false}`.
 */
export async function POST(request: Request) {
  if (!isEvaluationHost(request.headers.get("host"))) return failure(404, "NOT_FOUND", "Not found.");
  const url = new URL(request.url);
  let token = url.searchParams.get("token");
  if (!token) {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(400, "INPUT_INVALID", "A token is required.");
    const text = await request.text();
    if (text.length > 512) return failure(413, "INPUT_INVALID", "Request is too large.");
    try {
      token = z.strictObject({ token: z.string() }).parse(JSON.parse(text)).token;
    } catch {
      return failure(400, "INPUT_INVALID", "A token is required.");
    }
  }
  if (!TOKEN.test(token)) return failure(400, "INPUT_INVALID", "This unsubscribe link is not valid.");
  try {
    const { rows } = await getPostgresPool().query<{ locale: string | null }>("SELECT evals.email_unsubscribe($1) AS locale", [token]);
    const unsubscribed = rows[0]?.locale != null;
    return Response.json({ data: { unsubscribed } }, { headers: privateHeaders });
  } catch {
    console.error("email_unsubscribe_failed");
    return failure(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.");
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  // Relative, so the redirect stays on the host the request came to.
  const target = `/workspace/unsubscribe${TOKEN.test(token) ? `#${token}` : ""}`;
  return new Response(null, { status: 303, headers: { ...privateHeaders, Location: target } });
}
