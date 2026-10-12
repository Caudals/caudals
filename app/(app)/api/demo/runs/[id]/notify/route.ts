import { z } from "zod";
import { clientHash, sha256 } from "@/lib/demo/client";
import { queueEnabled } from "@/lib/demo/config";
import { failure, json, sameOrigin, tokenFor, UUID } from "@/lib/demo/http";
import { notifyAvailable, requestNotify } from "@/lib/demo/notify";
import { getRun } from "@/lib/demo/store";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { jsonBody } from "@/lib/evals/domain/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consent is explicit: the box must be ticked.
const input = z.strictObject({ email: z.email().max(254), consent: z.literal(true) });

/**
 * "Email me the report when it's ready." The address is stored encrypted
 * until the email is sent, then deleted (lib/demo/notify.ts).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return failure("forbidden", 403);
  const { id } = await context.params;
  const token = UUID.test(id) ? tokenFor(request, id) : null;
  const run = token ? await getRun(id, sha256(token)) : null;
  if (!run || !token) return failure("not_found", 404);
  if (run.phase === "done" || run.phase === "failed") return failure("already_finished", 409);
  let body: z.infer<typeof input>;
  try { body = input.parse(await jsonBody(request, 2048)); } catch { return failure("email_invalid", 400); }
  // The option ships with the queue (DEMO_QUEUE_ENABLED).
  if (!queueEnabled() || !notifyAvailable()) return failure("notify_unavailable", 503);
  const limit = await consumeRateLimit({ key: `demo-notify:${clientHash(request.headers)}`, limit: 3, windowMs: 24 * 3600_000 });
  if (!limit.allowed) return failure("notify_limit", 429);
  try {
    const result = await requestNotify(run.id, body.email, token);
    if (result === "finished") return failure("already_finished", 409);
  } catch (error) {
    console.error("demo_notify_request_failed", { run_id: run.id, error_type: error instanceof Error ? error.name : typeof error });
    return failure("notify_unavailable", 503);
  }
  return json({ requested: true });
}
