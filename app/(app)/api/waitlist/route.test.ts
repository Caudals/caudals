import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createAdminClientMock,
  getResendClientMock,
  ensureAudienceContactMock,
  buildRateLimitHeadersMock,
  consumeRateLimitMock,
  getClientIpFromHeadersMock,
  logErrorMock,
  logWarnMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  getResendClientMock: vi.fn(),
  ensureAudienceContactMock: vi.fn(),
  buildRateLimitHeadersMock: vi.fn(() => ({})),
  consumeRateLimitMock: vi.fn(),
  getClientIpFromHeadersMock: vi.fn(() => "127.0.0.1"),
  logErrorMock: vi.fn(),
  logWarnMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
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

type BuilderConfig = {
  singleResult?: { data?: unknown; error?: unknown };
  maybeSingleResult?: { data?: unknown; error?: unknown };
};

function createBuilder(config: BuilderConfig = {}) {
  const builder: any = {};

  for (const method of ["select", "eq", "update", "insert"]) {
    builder[method] = vi.fn(() => builder);
  }

  builder.single = vi.fn(async () => config.singleResult ?? { data: null, error: null });
  builder.maybeSingle = vi.fn(
    async () => config.maybeSingleResult ?? { data: null, error: null },
  );

  return builder;
}

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
  });

  it("uses the fallback sender when the primary confirmation send fails", async () => {
    const lookupBuilder = createBuilder({
      maybeSingleResult: { data: null, error: null },
    });
    const insertBuilder = createBuilder({
      singleResult: { data: { id: "signup_1" }, error: null },
    });

    createAdminClientMock.mockReturnValue({
      from: vi
        .fn()
        .mockReturnValueOnce(lookupBuilder)
        .mockReturnValueOnce(insertBuilder),
    });

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
    expect(logWarnMock).toHaveBeenCalledWith(
      "waitlist.confirmation_fallback_used",
      expect.objectContaining({ email: "person@example.com" }),
    );
  });

  it("returns emailSent false when confirmation delivery fails on both senders", async () => {
    const lookupBuilder = createBuilder({
      maybeSingleResult: { data: null, error: null },
    });
    const insertBuilder = createBuilder({
      singleResult: { data: { id: "signup_2" }, error: null },
    });

    createAdminClientMock.mockReturnValue({
      from: vi
        .fn()
        .mockReturnValueOnce(lookupBuilder)
        .mockReturnValueOnce(insertBuilder),
    });

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
    const lookupBuilder = createBuilder({
      maybeSingleResult: { data: null, error: null },
    });
    const insertBuilder = createBuilder({
      singleResult: { data: { id: "signup_3" }, error: null },
    });

    createAdminClientMock.mockReturnValue({
      from: vi
        .fn()
        .mockReturnValueOnce(lookupBuilder)
        .mockReturnValueOnce(insertBuilder),
    });

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
