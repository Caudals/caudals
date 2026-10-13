import { sha256 } from "@/lib/demo/client";
import { queueEnabled } from "@/lib/demo/config";
import { failure, json, tokenFor, UUID } from "@/lib/demo/http";
import { notifyAvailable } from "@/lib/demo/notify";
import { queuePosition, recentDurations } from "@/lib/demo/queue";
import { ensureDemoRunner } from "@/lib/demo/runner";
import { serviceLevel, slots } from "@/lib/demo/status";
import { getRun, isWaiting } from "@/lib/demo/store";
import { viewOf } from "@/lib/demo/view";
import { aiDisclosureCheckEnabled } from "@/lib/evals/scoring/disclosure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One run, for the holder of its token. Answers 304 while nothing changed, including its place in line. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = UUID.test(id) ? tokenFor(request, id) : null;
  if (!token) return failure("not_found", 404);
  ensureDemoRunner();
  const run = await getRun(id, sha256(token));
  if (!run) return failure("not_found", 404);
  const terminal = run.phase === "done" || run.phase === "failed";
  const [position, durations, service] = await Promise.all([
    isWaiting(run) ? queuePosition(run.id) : Promise.resolve(null),
    terminal ? Promise.resolve({ p50: 240, p90: 480, samples: 0 }) : recentDurations().catch(() => ({ p50: 240, p90: 480, samples: 0 })),
    terminal ? Promise.resolve("ok" as const) : serviceLevel(),
  ]);
  const disclosure = aiDisclosureCheckEnabled();
  const etag = `"${run.version}.${position ?? 0}.${service}${disclosure ? ".d" : ""}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-store" } });
  return json(viewOf(run, { position, slots: slots(), durations, service, notifyAvailable: !terminal && queueEnabled() && notifyAvailable(), disclosure }), { headers: { ETag: etag } });
}
