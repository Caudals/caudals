import { afterEach, describe, expect, it, vi } from "vitest";

import { getSentryOptions } from "@/lib/observability/sentry-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSentryOptions", () => {
  it("stays disabled until a DSN is configured", () => {
    vi.stubEnv("SENTRY_DSN", "");

    expect(getSentryOptions()).toMatchObject({
      dsn: "",
      enabled: false,
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      sendDefaultPii: false,
    });
  });

  it("maps observability env values into Sentry options", () => {
    vi.stubEnv("SENTRY_DSN", "https://public@example.com/1");
    vi.stubEnv("SENTRY_ENVIRONMENT", "production");
    vi.stubEnv("SENTRY_RELEASE", "phase1-test");
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "0.25");
    vi.stubEnv("SENTRY_PROFILES_SAMPLE_RATE", "0.1");

    expect(getSentryOptions()).toMatchObject({
      dsn: "https://public@example.com/1",
      enabled: true,
      environment: "production",
      release: "phase1-test",
      tracesSampleRate: 0.25,
      profilesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  });
});
