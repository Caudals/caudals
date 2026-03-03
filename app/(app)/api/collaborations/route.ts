import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend/client";
import { collaborationFormSchema } from "@/lib/validators/collaboration";
import { CollaborationInquiryEmail } from "@/emails/collaboration-inquiry";
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

const COLLAB_IP_RATE_LIMIT = {
  limit: 6,
  windowMs: 15 * 60 * 1000,
};

const COLLAB_EMAIL_RATE_LIMIT = {
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
    key: `collaboration:ip:${clientIp}`,
    limit: COLLAB_IP_RATE_LIMIT.limit,
    windowMs: COLLAB_IP_RATE_LIMIT.windowMs,
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

  // Bot trap field: real form submissions should leave this empty.
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
    key: `collaboration:email:${normalizedWorkEmail}`,
    limit: COLLAB_EMAIL_RATE_LIMIT.limit,
    windowMs: COLLAB_EMAIL_RATE_LIMIT.windowMs,
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
    logError("collaboration.resend_from_missing");
    return withHeaders(
      NextResponse.json(
        { error: "Email service is not configured" },
        { status: 500 }
      ),
      ipRateHeaders
    );
  }

  const notificationEmail =
    process.env.COLLABORATION_NOTIFICATION_EMAIL ??
    process.env.CONTACT_NOTIFICATION_EMAIL ??
    process.env.WAITLIST_NOTIFICATION_EMAIL ??
    "contact@caudals.com";

  const resend = getResendClient();
  const submittedAt = new Date().toISOString();
  const userAgent = request.headers.get("user-agent");
  const referer = request.headers.get("referer");
  const partnershipsAudienceId =
    process.env.RESEND_PARTNERSHIPS_AUDIENCE_ID ??
    process.env.RESEND_GENERAL_AUDIENCE_ID;
  const partnershipsSegmentId = process.env.RESEND_PARTNERSHIPS_SEGMENT_ID;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFallbackFrom = process.env.RESEND_FALLBACK_FROM_EMAIL;

  let audienceContactReady = false;

  if (partnershipsAudienceId) {
    try {
      audienceContactReady = await ensureAudienceContact({
        resendClient: resend,
        audienceId: partnershipsAudienceId,
        email: normalizedWorkEmail,
        fullName: data.fullName,
      });
    } catch (error) {
      logError("collaboration.contact_upsert_failed", {
        error,
        email: normalizedWorkEmail,
        audienceId: partnershipsAudienceId,
      });
    }
  } else {
    logWarn("collaboration.partnerships_audience_missing");
  }

  if (partnershipsSegmentId) {
    if (!resendApiKey) {
      logWarn("collaboration.resend_api_key_missing");
    } else if (!audienceContactReady) {
      logWarn("collaboration.segment_skipped_contact_not_ready", {
        email: normalizedWorkEmail,
        segmentId: partnershipsSegmentId,
      });
    } else {
      try {
        await addContactEmailToSegment({
          email: normalizedWorkEmail,
          segmentId: partnershipsSegmentId,
          apiKey: resendApiKey,
        });
      } catch (error) {
        logError("collaboration.segment_add_failed", {
          error,
          email: normalizedWorkEmail,
          segmentId: partnershipsSegmentId,
        });
      }
    }
  } else {
    logWarn("collaboration.partnerships_segment_missing");
  }

  const baseEmailPayload = {
    to: notificationEmail,
    reply_to: normalizedWorkEmail,
    subject: `New collaboration inquiry: ${data.organization}`,
    react: CollaborationInquiryEmail({
      ...data,
      submittedAt,
      userAgent,
      referer,
    }),
    tags: [{ name: "source", value: "partnerships-form" }],
  };

  const primaryResult = await resend.emails.send({
    from: resendFrom,
    ...baseEmailPayload,
  });

  if (primaryResult.error) {
    logError("collaboration.notification_send_failed", {
      error: primaryResult.error,
      email: normalizedWorkEmail,
    });

    if (resendFallbackFrom && resendFallbackFrom !== resendFrom) {
      const fallbackResult = await resend.emails.send({
        from: resendFallbackFrom,
        ...baseEmailPayload,
      });

      if (fallbackResult.error) {
        logError("collaboration.notification_fallback_failed", {
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

      logWarn("collaboration.notification_fallback_used", {
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
