import { clientHash, sha256 } from "@/lib/demo/client";
import { fallbackEnabled, queueEnabled } from "@/lib/demo/config";
import { cookieValue, json } from "@/lib/demo/http";
import { capacityOpen } from "@/lib/demo/limits";
import { notifyAvailable } from "@/lib/demo/notify";
import { issueChallenge } from "@/lib/demo/pow";
import { queueState, recentDurations } from "@/lib/demo/queue";
import { demoEnabled, ensureDemoRunner } from "@/lib/demo/runner";
import { serviceLevel, slots } from "@/lib/demo/status";
import { getRun } from "@/lib/demo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A fresh proof-of-work challenge, whether a demo can start, this browser's
 * last run and, with the queue, how busy the service is.
 */
export async function GET(request: Request) {
  if (!demoEnabled()) return json({ open: false, reason: "closed", challenge: null, last: null, service: "ok", queue: null, notify: false, fallback: false });
  ensureDemoRunner();
  const cookie = cookieValue(request);
  const queued = queueEnabled();
  const [open, last, service, state, durations] = await Promise.all([
    // With the queue a test can always start; it waits when nothing can run it.
    queued ? Promise.resolve(true) : capacityOpen().catch(() => false),
    cookie ? getRun(cookie.id, sha256(cookie.token)).catch(() => null) : Promise.resolve(null),
    serviceLevel(),
    queued ? queueState().catch(() => null) : Promise.resolve(null),
    queued ? recentDurations().catch(() => null) : Promise.resolve(null),
  ]);
  return json({
    open,
    reason: open ? null : "capacity",
    challenge: issueChallenge(clientHash(request.headers)),
    last: last && cookie ? { id: last.id, token: cookie.token, host: last.target_host, phase: last.phase, createdAt: new Date(last.created_at).toISOString() } : null,
    service,
    queue: state && durations ? { waiting: state.waiting, active: state.active, slots: slots(), durations: { p50: durations.p50, p90: durations.p90 } } : null,
    notify: queued && notifyAvailable(),
    // Pages may reach the third-party backup model: the start form says so.
    fallback: fallbackEnabled(),
  });
}
