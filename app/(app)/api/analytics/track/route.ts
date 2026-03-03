import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = profile?.role ?? null;
  }

  const { eventName, payload, path, sessionId } = parsed.data;

  await recordProductEvent({
    eventName: eventName as ProductEventName,
    payload,
    path,
    sessionId,
    userId: user?.id ?? null,
    userRole: role,
    source: "client",
  });

  return withHeaders(NextResponse.json({ ok: true }), ipRateHeaders);
}
