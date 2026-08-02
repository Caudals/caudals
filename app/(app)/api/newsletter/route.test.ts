import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  subscribeToNewsletterMock,
  buildRateLimitHeadersMock,
  consumeRateLimitMock,
  getClientIpFromHeadersMock,
  logErrorMock,
  logWarnMock,
} = vi.hoisted(() => ({
  subscribeToNewsletterMock: vi.fn(),
  buildRateLimitHeadersMock: vi.fn(() => ({})),
  consumeRateLimitMock: vi.fn(),
  getClientIpFromHeadersMock: vi.fn(() => "127.0.0.1"),
  logErrorMock: vi.fn(),
  logWarnMock: vi.fn(),
}));

vi.mock("@/lib/newsletter/client", () => ({
  subscribeToNewsletter: subscribeToNewsletterMock,
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

import { POST } from "@/app/(app)/api/newsletter/route";

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/newsletter", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("/api/newsletter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRateLimitMock.mockResolvedValue({ allowed: true });
    subscribeToNewsletterMock.mockResolvedValue({
      status: "pending",
      emailSent: true,
    });
  });

  it("starts double opt-in and reports the address pending", async () => {
    const response = await POST(
      createRequest({ email: "Reader@Example.com", source: "landing_hero" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      newsletter: "pending",
      emailSent: true,
    });
    expect(subscribeToNewsletterMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "reader@example.com", source: "landing_hero" })
    );
  });

  it("passes the archive source through so the CRM can tell signups apart", async () => {
    await POST(createRequest({ email: "reader@example.com", source: "archive" }));

    expect(subscribeToNewsletterMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "archive" })
    );
  });

  it("reports an already-subscribed address without leaking more than that", async () => {
    subscribeToNewsletterMock.mockResolvedValue({ status: "already_subscribed" });

    const response = await POST(createRequest({ email: "reader@example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      newsletter: "already_subscribed",
      emailSent: false,
    });
  });

  it("fails loudly when the newsletter backend is unreachable", async () => {
    subscribeToNewsletterMock.mockResolvedValue({ status: "unavailable" });

    const response = await POST(createRequest({ email: "reader@example.com" }));

    expect(response.status).toBe(502);
    expect(logErrorMock).toHaveBeenCalledWith(
      "newsletter.subscribe_unavailable",
      expect.objectContaining({ email: "reader@example.com" })
    );
  });

  it("swallows honeypot submissions without touching the list", async () => {
    const response = await POST(
      createRequest({ email: "bot@example.com", website: "http://spam.example" })
    );

    expect(response.status).toBe(200);
    expect(subscribeToNewsletterMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid address", async () => {
    const response = await POST(createRequest({ email: "not-an-email" }));

    expect(response.status).toBe(422);
    expect(subscribeToNewsletterMock).not.toHaveBeenCalled();
  });

  it("rate limits by IP before parsing anything", async () => {
    consumeRateLimitMock.mockResolvedValueOnce({ allowed: false });

    const response = await POST(createRequest({ email: "reader@example.com" }));

    expect(response.status).toBe(429);
    expect(subscribeToNewsletterMock).not.toHaveBeenCalled();
  });
});
