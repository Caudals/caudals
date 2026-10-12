import { privateHeaders } from "@/lib/evals/domain/http";
import { isEvaluationHost } from "@/lib/evals/domain/routing";
import { webhookHealth } from "@/lib/observability/webhook-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated webhook health for the uptime check on arctic
 * (launch L-08): 200 when every check passes, 503 otherwise. The body names
 * the checks and their state only.
 */
export async function GET(request: Request) {
  if (!isEvaluationHost(request.headers.get("host"))) return new Response("Not Found", { status: 404 });
  const health = await webhookHealth();
  return Response.json(health, { status: health.status === "ok" ? 200 : 503, headers: privateHeaders });
}
