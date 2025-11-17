import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend/client";
import { collaborationFormSchema } from "@/lib/validators/collaboration";
import { CollaborationInquiryEmail } from "@/emails/collaboration-inquiry";
import {
  addContactEmailToSegment,
  ensureAudienceContact,
} from "@/lib/resend/subscribers";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);

  if (!payload) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = collaborationFormSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten(),
      },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const resendFrom = process.env.RESEND_FROM_EMAIL;

  if (!resendFrom) {
    console.error("RESEND_FROM_EMAIL is not configured");
    return NextResponse.json(
      { error: "Email service is not configured" },
      { status: 500 }
    );
  }

  const notificationEmail =
    process.env.COLLABORATION_NOTIFICATION_EMAIL ??
    process.env.CONTACT_NOTIFICATION_EMAIL ??
    process.env.WAITLIST_NOTIFICATION_EMAIL ??
    "contact@caudals.com";

  const resend = getResendClient();
  const normalizedWorkEmail = data.workEmail.toLowerCase();
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
      console.error("Failed to upsert collaboration contact in Resend audience", error);
    }
  } else {
    console.warn(
      "RESEND_PARTNERSHIPS_AUDIENCE_ID is not configured; skipping audience subscription"
    );
  }

  if (partnershipsSegmentId) {
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY is not configured; skipping segment subscription");
    } else if (!audienceContactReady) {
      console.warn(
        "Skipping partnership segment subscription because the contact was not saved in the audience"
      );
    } else {
      try {
        await addContactEmailToSegment({
          email: normalizedWorkEmail,
          segmentId: partnershipsSegmentId,
          apiKey: resendApiKey,
        });
      } catch (error) {
        console.error("Failed to add collaboration contact to Resend segment", error);
      }
    }
  } else {
    console.warn(
      "RESEND_PARTNERSHIPS_SEGMENT_ID is not configured; skipping segment subscription"
    );
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
    console.error("Failed to send collaboration inquiry notification", primaryResult.error);

    if (resendFallbackFrom && resendFallbackFrom !== resendFrom) {
      const fallbackResult = await resend.emails.send({
        from: resendFallbackFrom,
        ...baseEmailPayload,
      });

      if (fallbackResult.error) {
        console.error("Fallback collaboration notification email also failed", fallbackResult.error);
        return NextResponse.json(
          { error: "We couldn't deliver your message. Please try again." },
          { status: 500 }
        );
      }

      console.warn(
        "Collaboration notification email delivered using fallback sender due to primary sender failure"
      );
    } else {
      return NextResponse.json(
        { error: "We couldn't deliver your message. Please try again." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    message: "Thanks for reaching out! We'll reply shortly.",
  });
}
