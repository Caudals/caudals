import { describe, expect, it } from "vitest";

import {
  mapLegacyAbuseRateLimit,
  mapLegacyProductAnalyticsEvent,
  mapLegacyStripeWebhookEvent,
  mapLegacyWaitlistSignup,
} from "@/lib/migrations/public-funnel-data";

describe("public funnel data migration mapping", () => {
  it("maps waitlist rows to deterministic prefixed IDs", () => {
    const migrated = mapLegacyWaitlistSignup({
      id: "98c8d22d-7cf5-42a2-a90f-65edb891a531",
      fullName: "Ada Lovelace",
      email: " ADA@Example.COM ",
      company: "Analytical Engines",
      useCase: "training data",
      status: "legacy",
      metadata: null,
      lastNotifiedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    expect(migrated).toMatchObject({
      id: expect.stringMatching(/^wl_[0-9A-HJKMNP-TV-Z]{26}$/),
      email: "ada@example.com",
      status: "pending",
      metadata: {},
    });
  });

  it("maps analytics rows to deterministic prefixed IDs", () => {
    const migrated = mapLegacyProductAnalyticsEvent({
      id: "0e0cba99-1831-4b4b-bd4f-4ecb0e76fd32",
      eventName: "hero_view",
      eventCategory: "unknown",
      userId: null,
      userRole: null,
      sessionId: "session-1",
      path: "/",
      source: "worker",
      metadata: { referrer: "direct" },
      occurredAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(migrated).toMatchObject({
      id: expect.stringMatching(/^pa_[0-9A-HJKMNP-TV-Z]{26}$/),
      eventCategory: "funnel",
      source: "server",
      metadata: { referrer: "direct" },
    });
  });

  it("normalizes nullable webhook payloads", () => {
    expect(
      mapLegacyStripeWebhookEvent({
        stripeEventId: "evt_123",
        eventType: "payment_intent.succeeded",
        processingState: "unknown",
        payload: null,
        receivedAt: "2026-01-01T00:00:00.000Z",
        processedAt: null,
        lastError: null,
      })
    ).toMatchObject({
      processingState: "failed",
      payload: {},
    });
  });

  it("keeps rate-limit rows unchanged", () => {
    const row = {
      key: "contact:ip:127.0.0.1",
      count: 2,
      resetAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(mapLegacyAbuseRateLimit(row)).toBe(row);
  });
});
