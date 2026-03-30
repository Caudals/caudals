import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/resend/client";
import { WaitlistConfirmationEmail } from "@/emails/waitlist-confirmation";
import type { Database, Json } from "@/types/database";
import { waitlistFormSchema } from "@/lib/validators/waitlist";
import { ensureAudienceContact } from "@/lib/resend/subscribers";
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
  const supabase = createAdminClient("waitlist_intake");

  const metadata: Record<string, Json> = {
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

  const metadataJson = metadata as Json;

  type WaitlistSignupUpdate = Database["public"]["Tables"]["waitlist_signups"]["Update"];
  type WaitlistSignupInsert = Database["public"]["Tables"]["waitlist_signups"]["Insert"];

  const { data: existingRecord, error: lookupError } = await supabase
    .from("waitlist_signups")
    .select("id, created_at, status")
    .eq("email", emailLower)
    .maybeSingle();

  if (lookupError) {
    logError("waitlist.lookup_failed", { error: lookupError, email: emailLower });
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
    const updatePayload: WaitlistSignupUpdate = {
      full_name: fullName ?? null,
      company: company ?? null,
      use_case: useCase ?? null,
      metadata: metadataJson,
      updated_at: timestamp,
    };

    const waitlistTable = supabase.from("waitlist_signups") as any;

    const recordId = (existingRecord as { id: string }).id;

    const { error: updateError } = await waitlistTable
      .update(updatePayload)
      .eq("id", recordId);

    if (updateError) {
      logError("waitlist.update_failed", { error: updateError, email: emailLower, recordId });
      return withHeaders(
        NextResponse.json(
          { error: "Failed to update waitlist entry" },
          { status: 500 }
        ),
        ipRateHeaders
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        message: "You're already on the waitlist!",
        alreadyRegistered: true,
      }),
      ipRateHeaders
    );
  }

  const insertPayload: WaitlistSignupInsert = {
    full_name: fullName ?? null,
    email: emailLower,
    company: company ?? null,
    use_case: useCase ?? null,
    metadata: metadataJson,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const waitlistInsert = supabase.from("waitlist_signups") as any;

  const { data: insertedRecord, error: insertError } = await waitlistInsert
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError || !insertedRecord) {
    logError("waitlist.insert_failed", { error: insertError, email: emailLower });
    return withHeaders(
      NextResponse.json(
        { error: "Failed to save waitlist entry" },
        { status: 500 }
      ),
      ipRateHeaders
    );
  }

  const resendFrom = process.env.RESEND_FROM_EMAIL;
  const resendFallbackFrom = process.env.RESEND_FALLBACK_FROM_EMAIL;

  if (!resendFrom) {
    logWarn("waitlist.resend_from_missing", { email: emailLower });
    return withHeaders(
      NextResponse.json({
        success: true,
        message: "You're on the waitlist! We'll be in touch soon.",
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

    const confirmationSent = await sendEmailWithFallback({
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
      }),
      ipRateHeaders
    );
  }

  return withHeaders(
    NextResponse.json({
      success: true,
      message: "You're on the waitlist! Check your inbox for a confirmation email.",
      emailSent: true,
    }),
    ipRateHeaders
  );
}
