import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  generatePrefixedUlidMock,
  queryRowsMock,
  getResendClientMock,
  ensureAudienceContactMock,
  buildRateLimitHeadersMock,
  consumeRateLimitMock,
  getClientIpFromHeadersMock,
  logErrorMock,
  logWarnMock,
} = vi.hoisted(() => ({
  generatePrefixedUlidMock: vi.fn(() => "wl_01J2WAT7ST0000000000000000"),
  queryRowsMock: vi.fn(),
  getResendClientMock: vi.fn(),
  ensureAudienceContactMock: vi.fn(),
  buildRateLimitHeadersMock: vi.fn(() => ({})),
  consumeRateLimitMock: vi.fn(),
  getClientIpFromHeadersMock: vi.fn(() => "127.0.0.1"),
  logErrorMock: vi.fn(),
  logWarnMock: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  queryRows: queryRowsMock,
}));

vi.mock("@/lib/db/ids", () => ({
  generatePrefixedUlid: generatePrefixedUlidMock,
}));

vi.mock("@/lib/resend/client", () => ({
  getResendClient: getResendClientMock,
}));

vi.mock("@/lib/resend/subscribers", () => ({
  ensureAudienceContact: ensureAudienceContactMock,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildRateLimitHeaders: buildRateLimitHeadersMock,
  consumeRateLimit: consumeRateLimitMock,
  getClientIpFromHeaders: getClientIpFromHeadersMock,
}));

vi.mock("@/lib/security/structured-logger", () => ({
  logError: logErrorMock,
  logWarn: logWarnMock,
}));

import { POST } from "@/app/(app)/api/waitlist/route";

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/waitlist", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("/api/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.RESEND_FROM_EMAIL = "Caudals <hello@caudals.com>";
    process.env.RESEND_FALLBACK_FROM_EMAIL = "Caudals <fallback@caudals.com>";
    process.env.RESEND_GENERAL_AUDIENCE_ID = "aud_123";
    process.env.WAITLIST_NOTIFICATION_EMAIL = "ops@caudals.com";

    consumeRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });

    ensureAudienceContactMock.mockResolvedValue(true);
    queryRowsMock.mockReset();
    generatePrefixedUlidMock.mockReturnValue("wl_01J2WAT7ST0000000000000000");
  });

  it("uses the fallback sender when the primary confirmation send fails", async () => {
    queryRowsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "wl_01J2WAT7ST0000000000000001" },
    ]);

    const sendMock = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "primary failed" } })
      .mockResolvedValueOnce({ data: { id: "email_1" }, error: null })
      .mockResolvedValueOnce({ data: { id: "email_2" }, error: null });

    getResendClientMock.mockReturnValue({
      emails: { send: sendMock },
    });

    const response = await POST(
      createRequest({
        email: "person@example.com",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      emailSent: true,
      message: "You're on the waitlist! Check your inbox for a confirmation email.",
    });
    expect(ensureAudienceContactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceId: "aud_123",
        email: "person@example.com",
      }),
    );
    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(queryRowsMock).toHaveBeenCalledTimes(2);
    expect(queryRowsMock.mock.calls[0]?.[0]).toContain("FROM waitlist_signup");
    expect(queryRowsMock.mock.calls[1]?.[0]).toContain("INSERT INTO waitlist_signup");
    expect(generatePrefixedUlidMock).toHaveBeenCalledWith("wl");
    expect(logWarnMock).toHaveBeenCalledWith(
      "waitlist.confirmation_fallback_used",
      expect.objectContaining({ email: "person@example.com" }),
    );
  });

  it("returns emailSent false when confirmation delivery fails on both senders", async () => {
    queryRowsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "wl_01J2WAT7ST0000000000000002" },
    ]);

    const sendMock = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "primary failed" } })
      .mockResolvedValueOnce({ data: null, error: { message: "fallback failed" } });

    getResendClientMock.mockReturnValue({
      emails: { send: sendMock },
    });

    const response = await POST(
      createRequest({
        email: "failure@example.com",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      emailSent: false,
      message: "You're on the waitlist! We'll be in touch soon.",
    });
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("keeps emailSent true when the internal notification fails after the confirmation succeeds", async () => {
    queryRowsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "wl_01J2WAT7ST0000000000000003" },
    ]);

    const sendMock = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "email_3" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "notify failed" } })
      .mockResolvedValueOnce({ data: null, error: { message: "notify fallback failed" } });

    getResendClientMock.mockReturnValue({
      emails: { send: sendMock },
    });

    const response = await POST(
      createRequest({
        email: "notify@example.com",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      emailSent: true,
      message: "You're on the waitlist! Check your inbox for a confirmation email.",
    });
    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(logWarnMock).toHaveBeenCalledWith(
      "waitlist.notification_delivery_skipped",
      expect.objectContaining({
        email: "notify@example.com",
        notificationEmail: "ops@caudals.com",
      }),
    );
  });
});
