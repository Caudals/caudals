import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend/client";
import { collaborationFormSchema } from "@/lib/validators/collaboration";
import { ContactInquiryEmail } from "@/emails/contact-inquiry";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { routePublicBuyerBriefIntake } from "@/lib/public/buyer-brief-intake";
import {
  addContactEmailToSegment,
  ensureAudienceContact,
} from "@/lib/resend/subscribers";
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getClientIpFromHeaders,
} from "@/lib/security/rate-limit";
import { logError, logWarn } from "@/lib/security/structured-logger";

const CONTACT_IP_RATE_LIMIT = {
  limit: 6,
  windowMs: 15 * 60 * 1000,
};

const CONTACT_EMAIL_RATE_LIMIT = {
  limit: 3,
  windowMs: 60 * 60 * 1000,
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
    key: `contact:ip:${clientIp}`,
    limit: CONTACT_IP_RATE_LIMIT.limit,
    windowMs: CONTACT_IP_RATE_LIMIT.windowMs,
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

  const payload = await request.json().catch(() => null);

  if (!payload) {
    return withHeaders(
      NextResponse.json({ error: "Invalid request" }, { status: 400 }),
      ipRateHeaders
    );
  }

  if (typeof payload.website === "string" && payload.website.trim().length > 0) {
    return withHeaders(
      NextResponse.json({
        success: true,
        message: "Thanks for reaching out! We'll reply shortly.",
      }),
      ipRateHeaders
    );
  }

  const parsed = collaborationFormSchema.safeParse(payload);

  if (!parsed.success) {
    return withHeaders(
      NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten(),
        },
        { status: 422 }
      ),
      ipRateHeaders
    );
  }

  const data = parsed.data;
  const normalizedWorkEmail = data.workEmail.toLowerCase();
  const emailRateLimit = await consumeRateLimit({
    key: `contact:email:${normalizedWorkEmail}`,
    limit: CONTACT_EMAIL_RATE_LIMIT.limit,
    windowMs: CONTACT_EMAIL_RATE_LIMIT.windowMs,
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

  const resendFrom = process.env.RESEND_FROM_EMAIL;

  if (!resendFrom) {
    logError("contact.resend_from_missing");
    return withHeaders(
      NextResponse.json(
        { error: "Email service is not configured" },
        { status: 500 }
      ),
      ipRateHeaders
    );
  }

  const notificationEmail =
    process.env.CONTACT_NOTIFICATION_EMAIL ??
    process.env.COLLABORATION_NOTIFICATION_EMAIL ??
    process.env.WAITLIST_NOTIFICATION_EMAIL ??
    "hello@caudals.com";

  const resend = getResendClient();
  const submittedAt = new Date().toISOString();
  const userAgent = request.headers.get("user-agent");
  const referer = request.headers.get("referer");
  const contactAudienceId =
    process.env.RESEND_PARTNERSHIPS_AUDIENCE_ID ??
    process.env.RESEND_GENERAL_AUDIENCE_ID;
  const contactSegmentId = process.env.RESEND_PARTNERSHIPS_SEGMENT_ID;
  const resendApiKey = getSecretEnvValue("RESEND_API_KEY");
  const resendFallbackFrom = process.env.RESEND_FALLBACK_FROM_EMAIL;

  let audienceContactReady = false;
  let buyerBriefRouting: Awaited<
    ReturnType<typeof routePublicBuyerBriefIntake>
  > | null = null;

  try {
    buyerBriefRouting = await routePublicBuyerBriefIntake(data, {
      clientIp,
      referer,
      userAgent,
    });
  } catch (error) {
    logError("contact.buyer_brief_routing_failed", {
      error,
      email: normalizedWorkEmail,
    });
    return withHeaders(
      NextResponse.json(
        { error: "We couldn't route your brief. Please try again." },
        { status: 500 }
      ),
      ipRateHeaders
    );
  }

  if (contactAudienceId) {
    try {
      audienceContactReady = await ensureAudienceContact({
        resendClient: resend,
        audienceId: contactAudienceId,
        email: normalizedWorkEmail,
        fullName: data.fullName,
      });
    } catch (error) {
      logError("contact.contact_upsert_failed", {
        error,
        email: normalizedWorkEmail,
        audienceId: contactAudienceId,
      });
    }
  } else {
    logWarn("contact.audience_missing");
  }

  if (contactSegmentId) {
    if (!resendApiKey) {
      logWarn("contact.resend_api_key_missing");
    } else if (!audienceContactReady) {
      logWarn("contact.segment_skipped_contact_not_ready", {
        email: normalizedWorkEmail,
        segmentId: contactSegmentId,
      });
    } else {
      try {
        await addContactEmailToSegment({
          email: normalizedWorkEmail,
          segmentId: contactSegmentId,
          apiKey: resendApiKey,
        });
      } catch (error) {
        logError("contact.segment_add_failed", {
          error,
          email: normalizedWorkEmail,
          segmentId: contactSegmentId,
        });
      }
    }
  } else {
    logWarn("contact.segment_missing");
  }

  const baseEmailPayload = {
    to: notificationEmail,
    reply_to: normalizedWorkEmail,
    subject: `New contact inquiry: ${data.organization}`,
    react: ContactInquiryEmail({
      ...data,
      submittedAt,
      userAgent,
      referer,
      buyerBriefRouting,
    }),
    tags: [{ name: "source", value: "contact-form" }],
  };

  const primaryResult = await resend.emails.send({
    from: resendFrom,
    ...baseEmailPayload,
  });

  if (primaryResult.error) {
    logError("contact.notification_send_failed", {
      error: primaryResult.error,
      email: normalizedWorkEmail,
    });

    if (resendFallbackFrom && resendFallbackFrom !== resendFrom) {
      const fallbackResult = await resend.emails.send({
        from: resendFallbackFrom,
        ...baseEmailPayload,
      });

      if (fallbackResult.error) {
        logError("contact.notification_fallback_failed", {
          error: fallbackResult.error,
          email: normalizedWorkEmail,
        });
        return withHeaders(
          NextResponse.json(
            { error: "We couldn't deliver your message. Please try again." },
            { status: 500 }
          ),
          ipRateHeaders
        );
      }

      logWarn("contact.notification_fallback_used", {
        email: normalizedWorkEmail,
      });
    } else {
      return withHeaders(
        NextResponse.json(
          { error: "We couldn't deliver your message. Please try again." },
          { status: 500 }
        ),
        ipRateHeaders
      );
    }
  }

  return withHeaders(
    NextResponse.json({
      success: true,
      message: "Thanks for reaching out! We'll reply shortly.",
    }),
    ipRateHeaders
  );
}
