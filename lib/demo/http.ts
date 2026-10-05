import "server-only";
import { randomBytes } from "node:crypto";
import { sha256 } from "./client";

export const DEMO_COOKIE = "caudals_demo";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return Response.json(body, { status: init.status ?? 200, headers: { ...headers, ...init.headers } });
}

export function failure(code: string, status: number) {
  return json({ error: { code } }, { status });
}

/** Same-origin check for state-changing requests (no CSRF from other sites). */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return url.host === host && (process.env.NODE_ENV !== "production" || url.protocol === "https:" || url.hostname === "localhost");
  } catch { return false; }
}

export function newToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: sha256(token) };
}

/** The run's capability token: from the link's fragment (sent as a header) or this browser's cookie. */
export function tokenFor(request: Request, id: string): string | null {
  const header = request.headers.get("x-demo-token");
  if (header && /^[A-Za-z0-9_-]{32}$/.test(header)) return header;
  const cookie = cookieValue(request);
  return cookie && cookie.id === id ? cookie.token : null;
}

export function cookieValue(request: Request): { id: string; token: string } | null {
  const raw = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${DEMO_COOKIE}=`));
  const match = raw && /^[^=]+=([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/.exec(raw);
  return match ? { id: match[1], token: match[2] } : null;
}

export function setCookie(id: string, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${DEMO_COOKIE}=${id}.${token}; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax${secure}`;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
