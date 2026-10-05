import { clientHash } from "@/lib/demo/client";
import { cookieValue, json } from "@/lib/demo/http";
import { capacityOpen } from "@/lib/demo/limits";
import { issueChallenge } from "@/lib/demo/pow";
import { demoEnabled, ensureDemoRunner } from "@/lib/demo/runner";
import { getRun } from "@/lib/demo/store";
import { sha256 } from "@/lib/demo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A fresh proof-of-work challenge, whether today's demo capacity is open, and this browser's last run. */
export async function GET(request: Request) {
  if (!demoEnabled()) return json({ open: false, reason: "closed", challenge: null, last: null });
  ensureDemoRunner();
  const cookie = cookieValue(request);
  const [open, last] = await Promise.all([
    capacityOpen().catch(() => false),
    cookie ? getRun(cookie.id, sha256(cookie.token)).catch(() => null) : Promise.resolve(null),
  ]);
  return json({
    open,
    reason: open ? null : "capacity",
    challenge: issueChallenge(clientHash(request.headers)),
    last: last && cookie ? { id: last.id, token: cookie.token, host: last.target_host, phase: last.phase, createdAt: new Date(last.created_at).toISOString() } : null,
  });
}
