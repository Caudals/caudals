import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { createBetterAuthId } from "@/lib/auth/better-auth-ids";
import { clientHash, sha256 } from "@/lib/demo/client";
import { importDemo } from "@/lib/demo/import";
import { getRun } from "@/lib/demo/store";
import { isEvaluationHost } from "@/lib/evals/domain/routing";
import { jsonBody, privateHeaders } from "@/lib/evals/domain/http";
import { withTenant } from "@/lib/evals/repositories/db";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

// Bound expensive password hashing in the web process; invalid links never hash.
let enrolling = 0;

const lookup = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const complete = lookup.extend({ name: z.string().trim().min(1).max(120), password: z.string().min(12).max(128) });

function denied(requestId: string, status = 400) {
  return Response.json({ error: { code: "SIGNUP_UNAVAILABLE", message: "This link has expired or was already used.", request_id: requestId, retryable: false } }, { status, headers: privateHeaders });
}

/**
 * Self-serve sign-up from the public demo (docs/ARCHITECTURE.md, Public demo).
 * `{token}` returns the address and workspace name the link was issued for;
 * `{token, name, password}` creates the account and a free-plan workspace,
 * imports the demo, and returns where to go after signing in.
 */
export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const host = request.headers.get("host");
    const origin = new URL(request.headers.get("origin") ?? "invalid");
    if (!isEvaluationHost(host) || origin.host !== host || (process.env.NODE_ENV === "production" && origin.protocol !== "https:")) return denied(requestId, 403);
    const limit = await consumeRateLimit({ key: `signup:${clientHash(request.headers)}`, limit: 20, windowMs: 3600_000 });
    if (!limit.allowed) return denied(requestId, 429);
    const body = await jsonBody(request, 2048);
    const digest = (token: string) => sha256(token);

    if (body && typeof body === "object" && !("password" in body)) {
      const { token } = lookup.parse(body);
      const row = await withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query("SELECT email, workspace_name, locale FROM evals.self_serve_signup_lookup($1)", [digest(token)])).rows[0]);
      if (!row) return denied(requestId, 404);
      return Response.json({ data: { email: row.email, workspaceName: row.workspace_name, locale: row.locale }, meta: { request_id: requestId } }, { headers: privateHeaders });
    }

    const { token, name, password } = complete.parse(body);
    const live = await withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query("SELECT 1 FROM evals.self_serve_signup_lookup($1)", [digest(token)])).rows[0]);
    if (!live || enrolling >= 2) return denied(requestId, live ? 503 : 404);
    enrolling++;
    let created: { org_id: string; demo_run_id: string | null; email: string };
    const userId = String(createBetterAuthId({ model: "user" }));
    try {
      const passwordHash = await hashPassword(password);
      created = await withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query(
        "SELECT org_id, demo_run_id, email FROM evals.enroll_self_serve($1, $2, $3, $4, $5)",
        [digest(token), name, passwordHash, userId, createBetterAuthId({ model: "account" })],
      )).rows[0]);
    } finally {
      enrolling--;
    }

    // The account exists now; a failed import only means an empty workspace.
    let evaluationId: string | null = null;
    if (created.demo_run_id) {
      try {
        const run = await getRun(created.demo_run_id);
        if (run?.phase === "done") evaluationId = (await importDemo({ orgId: created.org_id, actorId: userId }, run)).evaluationId;
      } catch {
        console.error("demo_import_failed", { request_id: requestId, org_id: created.org_id });
      }
    }
    return Response.json({ data: { email: created.email, orgId: created.org_id, evaluationId }, meta: { request_id: requestId } }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: { code: "INPUT_INVALID", message: "Check the supplied fields.", request_id: requestId, retryable: false } }, { status: 400, headers: privateHeaders });
    return denied(requestId);
  }
}
