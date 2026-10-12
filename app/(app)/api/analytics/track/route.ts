import { z } from "zod";
import { CLIENT_EVENT_NAMES } from "@/lib/analytics/events";
import { analyticsV2Enabled, recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { clientHash } from "@/lib/demo/client";
import { jsonBody } from "@/lib/evals/domain/http";
import { consumeRateLimit } from "@/lib/security/rate-limit";
const schema = z.strictObject({
  eventName: z.enum(CLIENT_EVENT_NAMES), consent: z.literal(true),
  payload: z.record(z.string().max(60), z.union([z.string().max(200),z.number(),z.boolean(),z.null()])).optional(),
  attribution: z.record(z.string().max(60),z.string().max(200)).optional(),
  path: z.string().max(500).nullable().optional(), sessionId: z.uuid().nullable().optional(),
});
export async function POST(request: Request) {
  if (!analyticsV2Enabled()) return new Response(null, { status: 204 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || (new URL(origin).host !== request.headers.get("host") || (process.env.NODE_ENV === "production" && new URL(origin).protocol !== "https:"))) return Response.json({ error: "Origin denied" }, { status: 403 });
    const limit = await consumeRateLimit({ key: `analytics:${clientHash(request.headers)}`, limit: 120, windowMs: 15 * 60_000 });
    if (!limit.allowed) return Response.json({ error: "Rate limited" }, { status: 429 });
    const { eventName, payload, attribution, path, sessionId } = schema.parse(await jsonBody(request, 8192));
    await recordProductEvent({ eventName, payload, attribution, path, sessionId, source: "client" });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Invalid analytics payload" }, { status: 400 }); }
}
