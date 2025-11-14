import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/resend/client";
import { WaitlistConfirmationEmail } from "@/emails/waitlist-confirmation";
import type { Database, Json } from "@/types/database";
import { waitlistFormSchema } from "@/lib/validators/waitlist";

function splitFullName(input?: string | null): { firstName?: string; lastName?: string } {
  if (!input) {
    return {};
  }

  const parts = input
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return {};
  }

  const [firstName, ...rest] = parts;
  const lastName = rest.length ? rest.join(" ") : undefined;

  return { firstName, lastName };
}

export async function POST(request: NextRequest) {
  const requestBody = await request.json().catch(() => null);

  if (!requestBody) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsed = waitlistFormSchema.safeParse(requestBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { fullName, email, company, useCase } = parsed.data;
  const generalAudienceId = process.env.RESEND_GENERAL_AUDIENCE_ID;
  const supabase = createAdminClient();

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

  const emailLower = email.toLowerCase();

  const metadataJson = metadata as Json;

  type WaitlistSignupUpdate = Database["public"]["Tables"]["waitlist_signups"]["Update"];
  type WaitlistSignupInsert = Database["public"]["Tables"]["waitlist_signups"]["Insert"];

  const { data: existingRecord, error: lookupError } = await supabase
    .from("waitlist_signups")
    .select("id, created_at, status")
    .eq("email", emailLower)
    .maybeSingle();

  if (lookupError) {
    console.error("Waitlist lookup error", lookupError);
    return NextResponse.json(
      { error: "Failed to save waitlist entry" },
      { status: 500 }
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client typing fails to infer waitlist table fields in this context
    const waitlistTable = supabase.from("waitlist_signups") as any;

    const recordId = (existingRecord as { id: string }).id;

    const { error: updateError } = await waitlistTable
      .update(updatePayload)
      .eq("id", recordId);

    if (updateError) {
      console.error("Waitlist update error", updateError);
      return NextResponse.json(
        { error: "Failed to update waitlist entry" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "You're already on the waitlist!",
      alreadyRegistered: true,
    });
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client typing fails to infer waitlist table fields in this context
  const waitlistInsert = supabase.from("waitlist_signups") as any;

  const { data: insertedRecord, error: insertError } = await waitlistInsert
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError || !insertedRecord) {
    console.error("Waitlist insert error", insertError);
    return NextResponse.json(
      { error: "Failed to save waitlist entry" },
      { status: 500 }
    );
  }

  const resendFrom = process.env.RESEND_FROM_EMAIL;

  if (!resendFrom) {
    console.warn("Waitlist submission saved but RESEND_FROM_EMAIL is missing");
    return NextResponse.json({
      success: true,
      message: "You're on the waitlist! We'll be in touch soon.",
    });
  }

  try {
    const resend = getResendClient();

    if (!generalAudienceId) {
      console.warn(
        "Waitlist submission saved but RESEND_GENERAL_AUDIENCE_ID is missing; skipping audience contact creation"
      );
    } else {
      const { firstName, lastName } = splitFullName(fullName);

      try {
        await resend.contacts.create({
          audienceId: generalAudienceId,
          email: emailLower,
          firstName,
          lastName,
          unsubscribed: false,
        });
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? (error as { statusCode?: number }).statusCode
            : undefined;

        if (statusCode === 409) {
          console.info("Waitlist contact already exists in Resend audience", {
            email: emailLower,
            audienceId: generalAudienceId,
          });
        } else {
          console.error("Failed to upsert waitlist contact in Resend audience", error);
        }
      }
    }

    await resend.emails.send({
      from: resendFrom,
      to: emailLower,
      subject: "You're on the Caudals waitlist!",
      react: WaitlistConfirmationEmail({
        fullName,
        company,
        useCase,
      }),
    });

    const notificationEmail = process.env.WAITLIST_NOTIFICATION_EMAIL;

    if (notificationEmail) {
      await resend.emails.send({
        from: resendFrom,
        to: notificationEmail,
        subject: `New waitlist signup: ${fullName || emailLower}`,
        html: `<p><strong>Email:</strong> ${emailLower}</p>
<p><strong>Name:</strong> ${fullName}</p>
${company ? `<p><strong>Company:</strong> ${company}</p>` : ""}
${useCase ? `<p><strong>Use case:</strong> ${useCase}</p>` : ""}
<p><strong>Submitted at:</strong> ${timestamp}</p>`,
      });
    }
  } catch (error) {
    console.error("Failed to send waitlist confirmation email", error);
    return NextResponse.json({
      success: true,
      message: "You're on the waitlist! We'll be in touch soon.",
      emailSent: false,
    });
  }

  return NextResponse.json({
    success: true,
    message: "You're on the waitlist! Check your inbox for a confirmation email.",
    emailSent: true,
  });
}
