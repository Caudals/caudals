import { z } from "zod";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { clientHash, sha256 } from "@/lib/demo/client";
import { failure, json, sameOrigin, tokenFor, UUID } from "@/lib/demo/http";
import { emailConfigured } from "@/lib/demo/notify";
import { SHARE_LIMITS, sendShareEmail } from "@/lib/demo/share";
import { getRun } from "@/lib/demo/store";
import { jsonBody } from "@/lib/evals/domain/http";
import { checkSignupEmail } from "@/lib/evals/signup-domains";
import { demoPublicEnabled } from "@/lib/public/front-door";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consent is explicit: the box must be ticked. `key` names this send, so a retry is delivered once.
const input = z.strictObject({ email: z.string().trim().min(3).max(254), consent: z.literal(true), key: z.uuid() });

/**
 * Sharing a finished report.
 *
 * - Without a JSON body, "Copy private link" acknowledges a copy (launch L-02).
 * - With one, "Send to a colleague" (launch L-04, while `DEMO_PUBLIC` is on)
 *   emails the private link to one address: exactly one email per accepted
 *   request, limited per visitor (hashed IP) and per run, and only after the
 *   sender's consent is recorded. The address is never stored or logged.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return failure("forbidden", 403);
  const { id } = await context.params;
  if (!request.headers.get("content-type")?.startsWith("application/json")) return acknowledgeCopy(request, id);
  if (!demoPublicEnabled()) return failure("not_found", 404);

  const token = UUID.test(id) ? tokenFor(request, id) : null;
  const run = token ? await getRun(id, sha256(token)) : null;
  if (!run || !token || run.phase !== "done") return failure("not_found", 404);

  let body: z.infer<typeof input>;
  try {
    const raw = await jsonBody(request, 2048);
    if (raw && typeof raw === "object" && (raw as { consent?: unknown }).consent !== true) return failure("consent_required", 400);
    body = input.parse(raw);
  } catch {
    return failure("email_invalid", 400);
  }
  // A real, deliverable address: no reserved or disposable domains. Personal mail is fine for a colleague.
  const recipient = checkSignupEmail(body.email);
  if (recipient.kind === "invalid" || recipient.kind === "disposable") return failure("email_invalid", 400);
  if (!emailConfigured()) return failure("share_unavailable", 503);

  const visitor = await consumeRateLimit({ key: `demo-share-email:${clientHash(request.headers)}`, ...SHARE_LIMITS.visitor });
  if (!visitor.allowed) return failure("share_limit", 429);
  const perRun = await consumeRateLimit({ key: `demo-share-run:${run.id}`, ...SHARE_LIMITS.run });
  if (!perRun.allowed) return failure("share_limit", 429);

  // The consent record comes first: no record, no email.
  const consent = await recordProductEvent({
    eventName: "demo_report_shared",
    source: "server",
    runId: run.id,
    eventKey: `${run.id}:email:${body.key}`,
    payload: { channel: "email", consent: true },
    attribution: run.attribution,
  });
  if (!("ok" in consent)) return failure("share_unavailable", 503);

  try {
    await sendShareEmail(run, token, recipient.email, body.key);
  } catch (error) {
    const code = error instanceof Error && /^[a-z_]{1,40}$/.test(error.message) ? error.message : error instanceof Error ? error.name : typeof error;
    console.error("demo_share_failed", { run_id: run.id, code });
    return failure("share_unavailable", 503);
  }
  return json({ sent: true });
}

/** "Copy private link": counts the share once per run (launch L-02). */
async function acknowledgeCopy(request: Request, id: string) {
  const limit = await consumeRateLimit({ key: `demo-share:${clientHash(request.headers)}`, limit: 30, windowMs: 3600_000 });
  if (!limit.allowed) return failure("rate_limited", 429);
  const token = UUID.test(id) ? tokenFor(request, id) : null;
  const run = token ? await getRun(id, sha256(token)) : null;
  if (!run || run.phase !== "done") return failure("not_found", 404);
  await recordProductEvent({ eventName: "demo_report_shared", source: "server", runId: id, eventKey: id, attribution: run.attribution });
  return json({ ok: true });
}
