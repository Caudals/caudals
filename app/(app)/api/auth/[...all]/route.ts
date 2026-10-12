import { toNextJsHandler } from "better-auth/next-js";

import { getBetterAuth } from "@/lib/auth/better-auth";
import { guardAuthRequest } from "@/lib/auth/request-guard";
import { adminMfaRequired, isPlatformStaff, requireIdentity } from "@/lib/evals/domain/identity";

export const runtime = "nodejs";

const handler = toNextJsHandler((request) => getBetterAuth().handler(request));

/** While TOTP is required, platform staff cannot turn it off (launch L-08). */
async function staffMayNotDisable(request: Request) {
  if (request.method !== "POST" || !adminMfaRequired() || !new URL(request.url).pathname.endsWith("/two-factor/disable")) return null;
  try {
    const identity = await requireIdentity(request.headers, { allowMfaEnrolment: true });
    if (!isPlatformStaff(identity)) return null;
  } catch {
    return null;
  }
  return Response.json(
    { code: "MFA_REQUIRED", message: "Staff accounts keep two-factor authentication on." },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  );
}

// Every auth request is labelled with the visitor's proven address and passes
// the durable sign-in, two-factor and reset limits first (launch L-08).
function guarded(method: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const denied = await staffMayNotDisable(request);
    if (denied) return denied;
    const next = await guardAuthRequest(request);
    return next instanceof Response ? next : method(next);
  };
}

export const GET = guarded(handler.GET);
export const POST = guarded(handler.POST);
export const PATCH = guarded(handler.PATCH);
export const PUT = guarded(handler.PUT);
export const DELETE = guarded(handler.DELETE);
