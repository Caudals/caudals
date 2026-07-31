import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend/client";
import { WaitlistConfirmationEmail } from "@/emails/waitlist-confirmation";
import type { QueryResultRow } from "pg";
import { generatePrefixedUlid } from "@/lib/db/ids";
import { queryRows } from "@/lib/db/client";
import { waitlistFormSchema } from "@/lib/validators/waitlist";
import { ensureAudienceContact } from "@/lib/resend/subscribers";
import { subscribeToNewsletter } from "@/lib/newsletter/client";
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getClientIpFromHeaders,
} from "@/lib/security/rate-limit";
import { logError, logWarn } from "@/lib/security/structured-logger";

const WAITLIST_IP_RATE_LIMIT = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
};

const WAITLIST_EMAIL_RATE_LIMIT = {
  limit: 4,
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

type ResendEmailPayload = Parameters<
  ReturnType<typeof getResendClient>["emails"]["send"]
>[0];

type WaitlistSignupRow = QueryResultRow & {
  id: string;
  created_at: string;
  status: string;
};

async function sendEmailWithFallback({
  resend,
  fallbackFrom,
  payload,
  primaryErrorEvent,
  fallbackErrorEvent,
  fallbackUsedEvent,
  logContext,
}: {
  resend: ReturnType<typeof getResendClient>;
  fallbackFrom?: string;
  payload: ResendEmailPayload;
  primaryErrorEvent: string;
  fallbackErrorEvent: string;
  fallbackUsedEvent: string;
  logContext: Record<string, string | boolean | number | null | undefined>;
}) {
  const primaryResult = await resend.emails.send(payload);

  if (!primaryResult.error) {
    return true;
  }

  logError(primaryErrorEvent, {
    ...logContext,
    error: primaryResult.error,
  });

  if (!fallbackFrom || fallbackFrom === payload.from) {
    return false;
  }

  const fallbackResult = await resend.emails.send({
    ...payload,
    from: fallbackFrom,
  });

  if (fallbackResult.error) {
    logError(fallbackErrorEvent, {
      ...logContext,
      error: fallbackResult.error,
    });
    return false;
  }

  logWarn(fallbackUsedEvent, logContext);
  return true;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIpFromHeaders(request.headers);
  const ipRateLimit = await consumeRateLimit({
    key: `waitlist:ip:${clientIp}`,
    limit: WAITLIST_IP_RATE_LIMIT.limit,
    windowMs: WAITLIST_IP_RATE_LIMIT.windowMs,
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
      NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      ),
      ipRateHeaders
    );
  }

  // Bot trap field: real clients should never submit this value.
  if (
    typeof requestBody.website === "string" &&
    requestBody.website.trim().length > 0
  ) {
    return withHeaders(
      NextResponse.json({
        success: true,
        message: "You're on the waitlist! We'll be in touch soon.",
      }),
      ipRateHeaders
    );
  }

  const parsed = waitlistFormSchema.safeParse(requestBody);

  if (!parsed.success) {
    return withHeaders(
      NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 }
      ),
      ipRateHeaders
    );
  }

  const { fullName, email, company, useCase } = parsed.data;
  const emailLower = email.toLowerCase();
  const emailRateLimit = await consumeRateLimit({
    key: `waitlist:email:${emailLower}`,
    limit: WAITLIST_EMAIL_RATE_LIMIT.limit,
    windowMs: WAITLIST_EMAIL_RATE_LIMIT.windowMs,
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

  const generalAudienceId = process.env.RESEND_GENERAL_AUDIENCE_ID;
  const metadata: Record<string, unknown> = {
    source: "landing-page",
  };

  if (generalAudienceId) {
    metadata.resendAudienceId = generalAudienceId;
  }

  const userAgent = request.headers.get("user-agent");
  if (userAgent) {
    metadata.userAgent = userAgent;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    metadata.referer = referer;
  }

  let existingRecord: WaitlistSignupRow | undefined;

  try {
    const existingRows = await queryRows<WaitlistSignupRow>(
      `
        SELECT id, created_at, status
        FROM waitlist_signup
        WHERE email = $1
        LIMIT 1
      `,
      [emailLower]
    );
    existingRecord = existingRows[0];
  } catch (error) {
    logError("waitlist.lookup_failed", { error, email: emailLower });
    return withHeaders(
      NextResponse.json(
        { error: "Failed to save waitlist entry" },
        { status: 500 }
      ),
      ipRateHeaders
    );
  }

  const timestamp = new Date().toISOString();

  if (existingRecord) {
    try {
      await queryRows(
        `
          UPDATE waitlist_signup
          SET full_name = $1,
              company = $2,
              use_case = $3,
              metadata = $4::jsonb,
              updated_at = $5
          WHERE id = $6
        `,
        [
          fullName ?? null,
          company ?? null,
          useCase ?? null,
          JSON.stringify(metadata),
          timestamp,
          existingRecord.id,
        ]
      );
    } catch (error) {
      logError("waitlist.update_failed", {
        error,
        email: emailLower,
        recordId: existingRecord.id,
      });
      return withHeaders(
        NextResponse.json(
          { error: "Failed to update waitlist entry" },
          { status: 500 }
        ),
        ipRateHeaders
      );
    }

    // Already on the waitlist, but possibly not on the newsletter — the box
    // does both jobs now, and someone who signed up before the newsletter
    // existed should still get the chance to confirm.
    const newsletter = await subscribeToNewsletter({
      email: emailLower,
      source: "landing_hero",
      sourceUrl: referer ?? undefined,
      fullName,
      ip: clientIp,
      userAgent: userAgent ?? undefined,
    });

    return withHeaders(
      NextResponse.json({
        success: true,
        message: "You're already on the waitlist!",
        alreadyRegistered: true,
        newsletter: newsletter.status,
      }),
      ipRateHeaders
    );
  }

  let insertedRecord: { id: string } | undefined;

  try {
    const insertedRows = await queryRows<QueryResultRow & { id: string }>(
      `
        INSERT INTO waitlist_signup (
          id,
          full_name,
          email,
          company,
          use_case,
          metadata,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
        RETURNING id
      `,
      [
        generatePrefixedUlid("wl"),
        fullName ?? null,
        emailLower,
        company ?? null,
        useCase ?? null,
        JSON.stringify(metadata),
        timestamp,
        timestamp,
      ]
    );
    insertedRecord = insertedRows[0];
  } catch (error) {
    logError("waitlist.insert_failed", { error, email: emailLower });
    return withHeaders(
      NextResponse.json(
        { error: "Failed to save waitlist entry" },
        { status: 500 }
      ),
      ipRateHeaders
    );
  }

  if (!insertedRecord) {
    logError("waitlist.insert_empty", { email: emailLower });
    return withHeaders(
      NextResponse.json(
        { error: "Failed to save waitlist entry" },
        { status: 500 }
      ),
      ipRateHeaders
    );
  }

  // The hero box is now the entry point for both the waitlist and the
  // newsletter. The newsletter's double opt-in email doubles as the waitlist
  // confirmation when it goes out, so the visitor gets one email rather than
  // two saying nearly the same thing.
  const newsletter = await subscribeToNewsletter({
    email: emailLower,
    source: "landing_hero",
    sourceUrl: referer ?? undefined,
    fullName,
    ip: clientIp,
    userAgent: userAgent ?? undefined,
  });

  const resendFrom = process.env.RESEND_FROM_EMAIL;
  const resendFallbackFrom = process.env.RESEND_FALLBACK_FROM_EMAIL;

  if (!resendFrom) {
    logWarn("waitlist.resend_from_missing", { email: emailLower });
    return withHeaders(
      NextResponse.json({
        success: true,
        message: "You're on the waitlist! We'll be in touch soon.",
        newsletter: newsletter.status,
      }),
      ipRateHeaders
    );
  }

  try {
    const resend = getResendClient();

    if (!generalAudienceId) {
      logWarn("waitlist.audience_missing", { email: emailLower });
    } else {
      try {
        await ensureAudienceContact({
          resendClient: resend,
          audienceId: generalAudienceId,
          email: emailLower,
          fullName,
        });
      } catch (error) {
        logError("waitlist.contact_upsert_failed", {
          error,
          email: emailLower,
          audienceId: generalAudienceId,
        });
      }
    }

    // Skipped when the double opt-in email already went out: two "welcome"
    // emails in one minute reads as a broken integration, and the newsletter
    // one is the one that needs a click.
    const confirmationSent = newsletter.emailSent
      ? true
      : await sendEmailWithFallback({
          resend,
          fallbackFrom: resendFallbackFrom,
          payload: {
            from: resendFrom,
            to: emailLower,
            subject: "You're on the Caudals waitlist!",
            react: WaitlistConfirmationEmail({
              fullName,
              company,
              useCase,
            }),
          },
          primaryErrorEvent: "waitlist.confirmation_send_failed",
          fallbackErrorEvent: "waitlist.confirmation_fallback_failed",
          fallbackUsedEvent: "waitlist.confirmation_fallback_used",
          logContext: {
            email: emailLower,
          },
        });

    if (!confirmationSent) {
      return withHeaders(
        NextResponse.json({
          success: true,
          message: "You're on the waitlist! We'll be in touch soon.",
          emailSent: false,
          newsletter: newsletter.status,
        }),
        ipRateHeaders
      );
    }

    const notificationEmail =
      process.env.WAITLIST_NOTIFICATION_EMAIL ??
      process.env.CONTACT_NOTIFICATION_EMAIL ??
      process.env.COLLABORATION_NOTIFICATION_EMAIL;

    if (notificationEmail) {
      const notificationSent = await sendEmailWithFallback({
        resend,
        fallbackFrom: resendFallbackFrom,
        payload: {
          from: resendFrom,
          to: notificationEmail,
          subject: `New waitlist signup: ${fullName || emailLower}`,
          html: `<p><strong>Email:</strong> ${emailLower}</p>
<p><strong>Name:</strong> ${fullName}</p>
${company ? `<p><strong>Company:</strong> ${company}</p>` : ""}
${useCase ? `<p><strong>Use case:</strong> ${useCase}</p>` : ""}
<p><strong>Submitted at:</strong> ${timestamp}</p>`,
        },
        primaryErrorEvent: "waitlist.notification_send_failed",
        fallbackErrorEvent: "waitlist.notification_fallback_failed",
        fallbackUsedEvent: "waitlist.notification_fallback_used",
        logContext: {
          email: emailLower,
          notificationEmail,
        },
      });

      if (!notificationSent) {
        logWarn("waitlist.notification_delivery_skipped", {
          email: emailLower,
          notificationEmail,
        });
      }
    }
  } catch (error) {
    logError("waitlist.email_flow_failed", { error, email: emailLower });
    return withHeaders(
      NextResponse.json({
        success: true,
        message: "You're on the waitlist! We'll be in touch soon.",
        emailSent: false,
        newsletter: newsletter.status,
      }),
      ipRateHeaders
    );
  }

  return withHeaders(
    NextResponse.json({
      success: true,
      message: newsletter.emailSent
        ? "Almost there — click the link in your inbox to confirm."
        : "You're on the waitlist! Check your inbox for a confirmation email.",
      emailSent: true,
      newsletter: newsletter.status,
    }),
    ipRateHeaders
  );
}
