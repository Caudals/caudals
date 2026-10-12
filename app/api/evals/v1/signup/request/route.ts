import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requestAttribution } from "@/lib/analytics/attribution-request";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { clientHash, hmac } from "@/lib/demo/client";
import { EvalError } from "@/lib/evals/domain/errors";
import { jsonBody, privateHeaders } from "@/lib/evals/domain/http";
import { isEvaluationHost } from "@/lib/evals/domain/routing";
import { directSignupEnabled, requestDirectSignup } from "@/lib/evals/signup";
import { checkSignupEmail } from "@/lib/evals/signup-domains";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.strictObject({
  email: z.string().trim().min(3).max(254),
  company: z.string().trim().max(160).optional(),
  locale: z.enum(["en", "es"]).optional(),
});

// Requests per hashed visitor address, per registrable domain and per address.
const LIMITS = { visitor: 5, visitorWindowMs: 3600_000, domain: 5, address: 3, dayMs: 24 * 3600_000 };

type Code = "NOT_FOUND" | "SCOPE_DENIED" | "INPUT_INVALID" | "WORK_EMAIL_REQUIRED" | "RATE_LIMITED" | "SIGNUP_UNAVAILABLE";
const MESSAGES: Record<Code, string> = {
  NOT_FOUND: "Not found.",
  SCOPE_DENIED: "This request is not allowed.",
  INPUT_INVALID: "Enter a valid work email.",
  WORK_EMAIL_REQUIRED: "Use your work email. Personal and temporary addresses cannot open a workspace; the public demo needs no account.",
  RATE_LIMITED: "Too many requests. Try again later.",
  SIGNUP_UNAVAILABLE: "The link could not be sent. Try again in a few minutes.",
};

function failure(requestId: string, status: number, code: Code, details?: Record<string, string>) {
  return Response.json(
    { error: { code, message: MESSAGES[code], request_id: requestId, retryable: status === 429 || status === 503, ...(details ? { details } : {}) } },
    { status, headers: privateHeaders },
  );
}

/**
 * Direct work-email sign-up (launch L-05, behind `SELF_SERVE_DIRECT_SIGNUP`).
 * `{email, company?, locale?}` emails the next step to the address: a one-time
 * link to `/workspace/signup`, a sign-in note when an account already uses
 * the address, or "ask your workspace owner for an invitation" when the
 * company already has a free workspace. The response is the same `{sent:
 * true}` in all three cases, so it never reveals whether an account or a
 * workspace exists. Personal free-mail and disposable addresses are refused
 * with `WORK_EMAIL_REQUIRED` (the page points to the public demo).
 */
export async function POST(request: Request) {
  const requestId = randomUUID();
  if (!directSignupEnabled()) return failure(requestId, 404, "NOT_FOUND");
  try {
    const host = request.headers.get("host");
    const origin = new URL(request.headers.get("origin") ?? "invalid");
    if (!isEvaluationHost(host) || origin.host !== host || (process.env.NODE_ENV === "production" && origin.protocol !== "https:")) {
      return failure(requestId, 403, "SCOPE_DENIED");
    }
  } catch {
    return failure(requestId, 403, "SCOPE_DENIED");
  }
  const limited = async () => {
    await recordProductEvent({ eventName: "limit_hit", source: "server", payload: { kind: "signup_rate" } });
    return failure(requestId, 429, "RATE_LIMITED");
  };
  try {
    const visitor = await consumeRateLimit({ key: `signup-request:visitor:${clientHash(request.headers)}`, limit: LIMITS.visitor, windowMs: LIMITS.visitorWindowMs });
    if (!visitor.allowed) return await limited();
    const body = input.parse(await jsonBody(request, 2048));
    if (!z.email().safeParse(body.email.toLowerCase()).success) return failure(requestId, 400, "INPUT_INVALID");
    const check = checkSignupEmail(body.email);
    if (check.kind === "invalid") return failure(requestId, 400, "INPUT_INVALID");
    if (check.kind === "free_mail" || check.kind === "disposable") {
      await recordProductEvent({ eventName: "limit_hit", source: "server", payload: { kind: `signup_${check.kind}` } });
      return failure(requestId, 422, "WORK_EMAIL_REQUIRED", { reason: check.kind });
    }
    // Both limits count every request, whether or not the address has an
    // account, so a refusal says nothing about it.
    const domain = await consumeRateLimit({ key: `signup-request:domain:${check.domain}`, limit: LIMITS.domain, windowMs: LIMITS.dayMs });
    const address = await consumeRateLimit({ key: `signup-request:address:${hmac(`signup-address:${check.email}`)}`, limit: LIMITS.address, windowMs: LIMITS.dayMs });
    if (!domain.allowed || !address.allowed) return await limited();

    let outcome: Awaited<ReturnType<typeof requestDirectSignup>> | "address_limit";
    try {
      outcome = await requestDirectSignup({
        email: check.email,
        company: body.company,
        domain: check.domain,
        domainRule: !check.exception,
        locale: body.locale ?? "en",
        attribution: requestAttribution(request),
      });
    } catch (error) {
      // Three live links already exist for this address today; they still
      // work. Answer as if sent, so the limit cannot reveal that the address
      // has no account (an existing account is never counted).
      if (error instanceof Error && error.message.includes("SIGNUP_LIMIT")) outcome = "address_limit";
      else throw error;
    }
    if (outcome === "domain_taken") {
      await recordProductEvent({ eventName: "limit_hit", source: "server", payload: { kind: "signup_domain_taken" } });
    }
    return Response.json({ data: { sent: true }, meta: { request_id: requestId } }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return failure(requestId, 400, "INPUT_INVALID");
    if (error instanceof EvalError && error.code === "INPUT_INVALID") return failure(requestId, error.status === 413 || error.status === 415 ? error.status : 400, "INPUT_INVALID");
    if (error instanceof Error && error.message.includes("INPUT_INVALID")) return failure(requestId, 400, "INPUT_INVALID");
    // Never log the address or the error text, which may quote it.
    console.error("direct_signup_failed", { request_id: requestId, error_type: error instanceof Error ? error.name : typeof error });
    return failure(requestId, 503, "SIGNUP_UNAVAILABLE");
  }
}
