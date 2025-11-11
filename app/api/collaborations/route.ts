import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend/client";
import { collaborationFormSchema } from "@/lib/validators/collaboration";
import { CollaborationInquiryEmail } from "@/emails/collaboration-inquiry";

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
  const submittedAt = new Date().toISOString();
  const userAgent = request.headers.get("user-agent");
  const referer = request.headers.get("referer");

  try {
    await resend.emails.send({
      from: resendFrom,
      to: notificationEmail,
      replyTo: data.workEmail,
      subject: `New collaboration inquiry: ${data.organization}`,
      react: CollaborationInquiryEmail({
        ...data,
        submittedAt,
        userAgent,
        referer,
      }),
    });
  } catch (error) {
    console.error("Failed to send collaboration inquiry", error);
    return NextResponse.json(
      { error: "We couldn't deliver your message. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Thanks for reaching out! We'll reply shortly.",
  });
}
