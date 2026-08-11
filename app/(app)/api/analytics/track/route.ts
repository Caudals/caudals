import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOperatorSession } from "@/lib/auth/operator-session";
import {
  PRODUCT_EVENT_NAMES,
  type ProductEventName,
} from "@/lib/analytics/funnel-events";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getClientIpFromHeaders,
} from "@/lib/security/rate-limit";
import { recordAttributionConversion } from "@/lib/analytics/attribution-server";

const trackEventSchema = z.object({
  eventName: z.enum(PRODUCT_EVENT_NAMES),
  payload: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
  ).optional(),
  path: z.string().max(500).optional(),
  sessionId: z.string().max(120).optional(),
});

const TRACK_RATE_LIMIT = {
  limit: 120,
  windowMs: 15 * 60 * 1000,
};

function withHeaders(
  response: NextResponse,
  headers: Record<string, string>
) {
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIpFromHeaders(request.headers);
  const ipRateLimit = await consumeRateLimit({
    key: `analytics:ip:${clientIp}`,
    limit: TRACK_RATE_LIMIT.limit,
    windowMs: TRACK_RATE_LIMIT.windowMs,
  });
  const ipRateHeaders = buildRateLimitHeaders(ipRateLimit);

  if (!ipRateLimit.allowed) {
    return withHeaders(
      NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      ),
      ipRateHeaders
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = trackEventSchema.safeParse(body);

  if (!parsed.success) {
    return withHeaders(
      NextResponse.json({ error: "Invalid analytics payload" }, { status: 400 }),
      ipRateHeaders
    );
  }

  const operatorSession = await getCurrentOperatorSession(request.headers);

  const { eventName, payload, path, sessionId } = parsed.data;

  await recordProductEvent({
    eventName: eventName as ProductEventName,
    payload,
    path,
    sessionId,
    userId: operatorSession?.authUser.id ?? null,
    userRole: operatorSession?.operator.role ?? null,
    source: "client",
  });

  const parentEventId = payload?.["attribution_parent_event_id"];
  const visitorId = payload?.["attribution_visitor_id"];
  const shortCode = payload?.["attribution_short_code"];
  if (
    ["funnel_signup", "funnel_dataset_created", "funnel_fund"].includes(eventName) &&
    typeof parentEventId === "string" && typeof visitorId === "string" && typeof shortCode === "string"
  ) {
    await recordAttributionConversion({
      parentEventId,
      visitorId,
      shortCode,
      landingUrl: path ?? null,
      referrerUrl: request.headers.get("referer"),
      eventName,
    });
  }

  return withHeaders(NextResponse.json({ ok: true }), ipRateHeaders);
}
