import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSentryOptions } from "@/lib/observability/sentry-config";
import {
  getSentryDsnSource,
  getSentryServerOptions,
} from "@/lib/observability/sentry-server-config";

const tempDirs: string[] = [];

function writeTempSecret(value: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "caudals-sentry-secret-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "dsn");
  writeFileSync(filePath, value, "utf8");
  return filePath;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("getSentryServerOptions", () => {
  it("stays disabled until a DSN is configured", () => {
    vi.stubEnv("SENTRY_DSN", "");

    expect(getSentryServerOptions()).toMatchObject({
      dsn: undefined,
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

    expect(getSentryServerOptions()).toMatchObject({
      dsn: "https://public@example.com/1",
      enabled: true,
      environment: "production",
      release: "phase1-test",
      tracesSampleRate: 0.25,
      profilesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  });

  it("reads a Sentry DSN from a secret file", () => {
    const filePath = writeTempSecret("https://public@example.com/2\n");

    expect(
      getSentryServerOptions({
        SENTRY_DSN_FILE: filePath,
        SENTRY_ENVIRONMENT: "production",
      })
    ).toMatchObject({
      dsn: "https://public@example.com/2",
      enabled: true,
      environment: "production",
      sendDefaultPii: false,
    });
    expect(getSentryDsnSource({ SENTRY_DSN_FILE: filePath })).toBe("file");
  });

  it("prefers the direct DSN over the secret file", () => {
    const filePath = writeTempSecret("https://file@example.com/2\n");

    expect(
      getSentryServerOptions({
        SENTRY_DSN: "https://env@example.com/1",
        SENTRY_DSN_FILE: filePath,
      })
    ).toMatchObject({
      dsn: "https://env@example.com/1",
      enabled: true,
    });
    expect(
      getSentryDsnSource({
        SENTRY_DSN: "https://env@example.com/1",
        SENTRY_DSN_FILE: filePath,
      })
    ).toBe("env");
  });

  it("does not read secret files from the shared browser and edge options", () => {
    const filePath = writeTempSecret("https://file@example.com/3\n");

    expect(
      getSentryOptions({
        SENTRY_DSN_FILE: filePath,
      })
    ).toMatchObject({
      dsn: undefined,
      enabled: false,
    });
  });
});
