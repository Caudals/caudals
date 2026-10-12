import "server-only";
import { createHash } from "node:crypto";
import { addressBucket, clientAddress } from "@/lib/demo/client";
import { consumeRateLimit } from "@/lib/security/rate-limit";

/**
 * Front door for better-auth's `/api/auth/*` (launch L-08, spec P-43).
 *
 * 1. The visitor's address. Traefik trusts no forwarded headers, so
 *    `X-Forwarded-For` holds only the immediate peer, which is a Cloudflare
 *    edge for public traffic. better-auth would rate-limit per edge. The
 *    request is re-labelled with the address `clientAddress` can prove
 *    (Cloudflare's `cf-connecting-ip` only when the peer is a Cloudflare
 *    range), so better-auth's own limits and session records are per visitor.
 *    Spoofed headers from non-Cloudflare peers are ignored.
 * 2. Durable limits on top of better-auth's in-memory ones (3 per 10 s),
 *    counted in PostgreSQL so they survive restarts: sign-in per visitor and
 *    per account, two-factor checks, password checks and reset requests.
 */
type Rule = { name: string; limit: number; windowMs: number; byAccount?: boolean };

const MINUTE = 60_000;
const RULES: Array<{ match: (path: string) => boolean; rules: Rule[] }> = [
  {
    match: (path) => path === "/sign-in/email",
    rules: [
      { name: "signin-visitor", limit: 20, windowMs: 15 * MINUTE },
      { name: "signin-account", limit: 10, windowMs: 15 * MINUTE, byAccount: true },
    ],
  },
  {
    match: (path) => path === "/two-factor/verify-totp" || path === "/two-factor/verify-backup-code",
    rules: [{ name: "2fa-verify", limit: 20, windowMs: 15 * MINUTE }],
  },
  {
    match: (path) => ["/two-factor/enable", "/two-factor/disable", "/two-factor/generate-backup-codes"].includes(path),
    rules: [{ name: "2fa-manage", limit: 10, windowMs: 15 * MINUTE }],
  },
  {
    match: (path) => path === "/request-password-reset" || path.startsWith("/forget-password"),
    rules: [{ name: "password-reset", limit: 5, windowMs: 60 * MINUTE }],
  },
];

function authPath(request: Request) {
  const pathname = new URL(request.url).pathname;
  const index = pathname.indexOf("/api/auth");
  return index >= 0 ? pathname.slice(index + "/api/auth".length) || "/" : pathname;
}

async function accountKey(request: Request) {
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    return typeof body.email === "string" && body.email.length <= 320
      ? createHash("sha256").update(body.email.trim().toLowerCase()).digest("hex")
      : null;
  } catch {
    return null;
  }
}

function tooMany(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return Response.json(
    {
      code: "TOO_MANY_REQUESTS",
      message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "private, no-store",
      },
    },
  );
}

/** The request with `X-Forwarded-For` set to the visitor's proven address. */
export function withVisitorAddress(request: Request): Request {
  const headers = new Headers(request.headers);
  const address = clientAddress(request.headers);
  if (address === "unknown") headers.delete("x-forwarded-for");
  else headers.set("x-forwarded-for", address);
  const init: RequestInit & { duplex?: "half" } = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(request.url, init);
}

/** A 429 response when a durable limit is exhausted, else null. */
export async function authRateLimit(request: Request): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const path = authPath(request);
  const entry = RULES.find((candidate) => candidate.match(path));
  if (!entry) return null;
  const visitor = addressBucket(clientAddress(request.headers));
  for (const rule of entry.rules) {
    const subject = rule.byAccount ? await accountKey(request) : visitor;
    if (!subject) continue;
    const result = await consumeRateLimit({ key: `auth:${rule.name}:${subject}`, limit: rule.limit, windowMs: rule.windowMs });
    if (!result.allowed) return tooMany(result.retryAfterSeconds);
  }
  return null;
}

/** Applies the durable limits, then hands better-auth the visitor-labelled request. */
export async function guardAuthRequest(request: Request): Promise<Request | Response> {
  const limited = await authRateLimit(request);
  return limited ?? withVisitorAddress(request);
}
