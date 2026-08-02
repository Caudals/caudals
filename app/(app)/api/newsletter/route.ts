import { NextRequest, NextResponse } from "next/server";
import { newsletterFormSchema } from "@/lib/validators/newsletter";
import { subscribeToNewsletter } from "@/lib/newsletter/client";
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getClientIpFromHeaders,
} from "@/lib/security/rate-limit";
import { logError } from "@/lib/security/structured-logger";

/**
 * The one public signup path: hero box and newsletter archive both post here.
 *
 * All this route owns is abuse control and shape validation. The subscriber
 * record, consent trail and confirmation email belong to the Leads Node API,
 * which is the only public surface allowed to write to the list.
 */

const NEWSLETTER_IP_RATE_LIMIT = {
  limit: 50,
  windowMs: 15 * 60 * 1000,
};

const NEWSLETTER_EMAIL_RATE_LIMIT = {
  limit: 20,
  windowMs: 60 * 60 * 1000,
};

function withHeaders(response: NextResponse, headers: Record<string, string>) {
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIpFromHeaders(request.headers);
  const ipRateLimit = await consumeRateLimit({
    key: `newsletter:ip:${clientIp}`,
    limit: NEWSLETTER_IP_RATE_LIMIT.limit,
    windowMs: NEWSLETTER_IP_RATE_LIMIT.windowMs,
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

  const requestBody = await request.json().catch(() => null);

  if (!requestBody) {
    return withHeaders(
      NextResponse.json({ error: "Invalid request body" }, { status: 400 }),
      ipRateHeaders
    );
  }

  // Bot trap field: real clients should never submit this value. Answering with
  // success rather than a rejection keeps the trap worth having.
  if (
    typeof requestBody.website === "string" &&
    requestBody.website.trim().length > 0
  ) {
    return withHeaders(
      NextResponse.json({ success: true, newsletter: "pending" }),
      ipRateHeaders
    );
  }

  const parsed = newsletterFormSchema.safeParse(requestBody);

  if (!parsed.success) {
    return withHeaders(
      NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 }
      ),
      ipRateHeaders
    );
  }

  const { fullName, email } = parsed.data;
  const emailLower = email.toLowerCase();

  const emailRateLimit = await consumeRateLimit({
    key: `newsletter:email:${emailLower}`,
    limit: NEWSLETTER_EMAIL_RATE_LIMIT.limit,
    windowMs: NEWSLETTER_EMAIL_RATE_LIMIT.windowMs,
  });

  if (!emailRateLimit.allowed) {
    return withHeaders(
      NextResponse.json(
        { error: "Too many attempts for this email. Please try again later." },
        { status: 429 }
      ),
      ipRateHeaders
    );
  }

  const userAgent = request.headers.get("user-agent");
  const referer = request.headers.get("referer");
  const source =
    typeof requestBody.source === "string" && requestBody.source.trim().length > 0
      ? requestBody.source.trim().slice(0, 60)
      : "landing_hero";

  const newsletter = await subscribeToNewsletter({
    email: emailLower,
    source,
    sourceUrl: referer ?? undefined,
    fullName,
    ip: clientIp,
    userAgent: userAgent ?? undefined,
  });

  // A signup that never reached the list is a failure, and the form has to say
  // so. Reporting success here is what previously hid a completely dead box.
  if (newsletter.status === "unavailable") {
    logError("newsletter.subscribe_unavailable", { email: emailLower, source });
    return withHeaders(
      NextResponse.json(
        { error: "We couldn't complete your subscription. Please try again." },
        { status: 502 }
      ),
      ipRateHeaders
    );
  }

  return withHeaders(
    NextResponse.json({
      success: true,
      newsletter: newsletter.status,
      emailSent: newsletter.emailSent ?? false,
    }),
    ipRateHeaders
  );
}
