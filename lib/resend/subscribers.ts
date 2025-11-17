import type { Resend } from "resend";
import { splitFullName } from "@/lib/utils/names";

type EnsureAudienceContactOptions = {
  resendClient: Resend;
  audienceId: string;
  email: string;
  fullName?: string;
};

type SegmentAssignmentOptions = {
  email: string;
  segmentId: string;
  apiKey: string;
};

type SegmentAssignmentError = Error & {
  status?: number;
  body?: unknown;
};

export async function ensureAudienceContact({
  resendClient,
  audienceId,
  email,
  fullName,
}: EnsureAudienceContactOptions): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const { firstName, lastName } = splitFullName(fullName);

  const response = await resendClient.contacts.create({
    audienceId,
    email: normalizedEmail,
    firstName,
    lastName,
    unsubscribed: false,
  });

  if (response.error) {
    const statusCode = getStatusCode(response.error);
    if (statusCode === 409) {
      return true;
    }

    const error = new Error(response.error.message);
    if (statusCode) {
      (error as SegmentAssignmentError).status = statusCode;
    }
    throw error;
  }

  return true;
}

export async function addContactEmailToSegment({
  email,
  segmentId,
  apiKey,
}: SegmentAssignmentOptions): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const encodedEmail = encodeURIComponent(normalizedEmail);

  const response = await fetch(
    `https://api.resend.com/contacts/${encodedEmail}/segments/${segmentId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (response.ok || response.status === 409) {
    return;
  }

  let body: unknown;
  try {
    const text = await response.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    body = undefined;
  }

  const error: SegmentAssignmentError = new Error(
    `Failed to add ${normalizedEmail} to Resend segment ${segmentId}`
  );
  error.status = response.status;
  if (body !== undefined) {
    error.body = body;
  }
  throw error;
}

function getStatusCode(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode?: number }).statusCode;
  }

  return undefined;
}
