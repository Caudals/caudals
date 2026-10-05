import { z } from "zod";
import { clientHash, sha256 } from "@/lib/demo/client";
import { failure, json, sameOrigin, tokenFor, UUID } from "@/lib/demo/http";
import { getRun, markClaimed } from "@/lib/demo/store";
import { requestSignup } from "@/lib/demo/signup";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.strictObject({ email: z.email().max(254), company: z.string().trim().max(160).optional() });

/** Emails a one-time link that creates a free account with this demo inside it. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return failure("forbidden", 403);
  const { id } = await context.params;
  const token = UUID.test(id) ? tokenFor(request, id) : null;
  const run = token ? await getRun(id, sha256(token)) : null;
  if (!run) return failure("not_found", 404);
  if (run.phase !== "done") return failure("not_ready", 409);
  let body: z.infer<typeof input>;
  try { body = input.parse(await request.json()); } catch { return failure("email_invalid", 400); }
  const limit = await consumeRateLimit({ key: `demo-signup:${clientHash(request.headers)}`, limit: 3, windowMs: 24 * 3600_000 });
  if (!limit.allowed) return failure("signup_limit", 429);
  try {
    await requestSignup({ email: body.email, company: body.company, runId: run.id, host: run.docs_host, locale: run.locale });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SIGNUP_LIMIT")) return failure("signup_limit", 429);
    if (message.includes("INPUT_INVALID")) return failure("email_invalid", 400);
    console.error("demo_signup_failed", { run_id: run.id, error_type: error instanceof Error ? error.name : typeof error });
    return failure("signup_unavailable", 503);
  }
  await markClaimed(run.id);
  return json({ sent: true });
}
