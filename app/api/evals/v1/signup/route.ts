import { recordProductEvent, analyticsV2Enabled } from "@/lib/analytics/funnel-events-server";
import { sanitizeAttribution } from "@/lib/analytics/events";
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
import { advanceOnboardingAutostarts, onboardingEnabled, queueOnboardingAutostart, startWorkspaceOnboarding } from "@/lib/evals/repositories/onboarding";
import { recordTermsAcceptance, signupTermsRequired } from "@/lib/legal/acceptance";
import { signupAcceptance } from "@/lib/legal/versions";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

// Bound expensive password hashing in the web process; invalid links never hash.
let enrolling = 0;

const lookup = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const complete = lookup.extend({
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
  // Terms and Privacy acceptance (launch L-01): required when SIGNUP_TERMS_REQUIRED=true.
  acceptTerms: z.boolean().optional(),
  locale: z.enum(["en", "es"]).optional(),
});

function denied(requestId: string, status = 400) {
  return Response.json({ error: { code: "SIGNUP_UNAVAILABLE", message: "This link has expired or was already used.", request_id: requestId, retryable: false } }, { status, headers: privateHeaders });
}

function domainTaken(requestId: string) {
  return Response.json({ error: { code: "SIGNUP_DOMAIN_TAKEN", message: "Someone at your company already created a Caudals workspace. Ask its owner to invite you.", request_id: requestId, retryable: false } }, { status: 409, headers: privateHeaders });
}

function termsMissing(requestId: string) {
  return Response.json({ error: { code: "TERMS_REQUIRED", message: "Accept the Terms of Service and the Privacy Policy to create your account.", request_id: requestId, retryable: false } }, { status: 400, headers: privateHeaders });
}

/**
 * Self-serve sign-up from the public demo or from direct work-email sign-up
 * (`/workspace/start`, launch L-05; docs/ARCHITECTURE.md, Public demo).
 * `{token}` returns the address, workspace name and source the link was issued for;
 * `{token, name, password, acceptTerms, locale}` creates the account and a
 * free-plan workspace, records the Terms and Privacy versions accepted
 * (required when `SIGNUP_TERMS_REQUIRED=true`), imports the demo, and returns
 * where to go after signing in. With `ONBOARDING_AUTOSTART=true` (launch
 * L-06) it also starts the workspace's onboarding checklist and welcome and,
 * for an imported demo, records the automatic start of the full test set.
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
      const row = await withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query("SELECT email, workspace_name, locale, signup_source FROM evals.self_serve_signup_lookup($1)", [digest(token)])).rows[0]);
      if (!row) return denied(requestId, 404);
      return Response.json({ data: { email: row.email, workspaceName: row.workspace_name, locale: row.locale, source: row.signup_source === "direct" ? "direct" : "demo" }, meta: { request_id: requestId } }, { headers: privateHeaders });
    }

    const { token, name, password, acceptTerms, locale } = complete.parse(body);
    if (signupTermsRequired() && acceptTerms !== true) return termsMissing(requestId);
    const live = await withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query("SELECT 1 FROM evals.self_serve_signup_lookup($1)", [digest(token)])).rows[0]);
    if (!live || enrolling >= 2) return denied(requestId, live ? 503 : 404);
    enrolling++;
    let created: { org_id: string; demo_run_id: string | null; email: string; signup_source?: string; attribution?: unknown };
    const userId = String(createBetterAuthId({ model: "user" }));
    try {
      const passwordHash = await hashPassword(password);
      // The new person is the actor, so the acceptance is recorded for them in
      // the same transaction that creates the account: no account without it.
      created = await withTenant({ orgId: "", actorId: userId }, async (db) => {
        const row = (await db.query(
          "SELECT org_id, demo_run_id, email, signup_source, attribution FROM evals.enroll_self_serve($1, $2, $3, $4, $5)",
          [digest(token), name, passwordHash, userId, createBetterAuthId({ model: "account" })],
        )).rows[0];
        if (acceptTerms === true) {
          await recordTermsAcceptance(db, { orgId: row.org_id, documents: signupAcceptance(), context: "signup", locale: locale ?? null, requestId });
        }
        if (analyticsV2Enabled()) {
          // A direct link carries the first touch its request saw; a demo link, the demo's.
          const direct = row.signup_source ? row.signup_source === "direct" : !row.demo_run_id;
          const demo = !direct && row.demo_run_id ? await getRun(row.demo_run_id) : null;
          const attribution = sanitizeAttribution(direct ? row.attribution : demo?.attribution);
          await db.query("SELECT evals.set_acquisition_attribution($1,$2::jsonb)", [row.org_id, JSON.stringify(attribution)]);
          await recordProductEvent({ eventName: "account_created", source: "server", orgId: row.org_id, runId: row.demo_run_id, eventKey: row.org_id, attribution, payload: { acquisition: direct ? "direct" : "demo", plan: "free" } }, db);
        }
        await startWorkspaceOnboarding(db, row.org_id);
        return row;
      });
    } finally {
      enrolling--;
    }

    // The account exists now; a failed import only means an empty workspace.
    let evaluationId: string | null = null;
    if (created.demo_run_id) {
      const scope = { orgId: created.org_id, actorId: userId };
      try {
        const run = await getRun(created.demo_run_id);
        if (run?.phase === "done") {
          evaluationId = (await importDemo(scope, run)).evaluationId;
          // The import queued the connection check and the site reading; the
          // test set starts once both allow it (lib/evals/repositories/onboarding.ts).
          if (onboardingEnabled()) {
            await queueOnboardingAutostart(scope, evaluationId, { demoRunId: run.id, locale: locale ?? run.locale });
            await advanceOnboardingAutostarts(scope, evaluationId).catch(() => {
              console.error("onboarding_autostart_deferred", { request_id: requestId, org_id: created.org_id });
            });
          }
        }
      } catch {
        console.error("demo_import_failed", { request_id: requestId, org_id: created.org_id });
      }
    }
    return Response.json({ data: { email: created.email, orgId: created.org_id, evaluationId }, meta: { request_id: requestId } }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: { code: "INPUT_INVALID", message: "Check the supplied fields.", request_id: requestId, retryable: false } }, { status: 400, headers: privateHeaders });
    // Only the holder of a direct link reaches this: the company got a workspace after the link was sent.
    if (error instanceof Error && error.message.includes("SIGNUP_DOMAIN_TAKEN")) return domainTaken(requestId);
    return denied(requestId);
  }
}
