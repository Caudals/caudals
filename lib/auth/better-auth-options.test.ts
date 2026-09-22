import { getSchema } from "better-auth/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBetterAuthId } from "@/lib/auth/better-auth-ids";
import {
  createBetterAuthOptions,
  getResetPasswordTokenExpiresInSeconds,
} from "@/lib/auth/better-auth-options";

const RESET_TTL_ENV = "BETTER_AUTH_RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS";
const originalResetTtlEnv = process.env[RESET_TTL_ENV];

describe("Better Auth options", () => {
  beforeEach(() => {
    delete process.env[RESET_TTL_ENV];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalResetTtlEnv === undefined) {
      delete process.env[RESET_TTL_ENV];
    } else {
      process.env[RESET_TTL_ENV] = originalResetTtlEnv;
    }
  });

  it("keeps authentication on the app host when the public site URL is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://caudals.com");
    vi.stubEnv("BETTER_AUTH_URL", "restore-after-test");
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", "restore-after-test");
    delete process.env.BETTER_AUTH_URL;
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;

    const options = createBetterAuthOptions({} as never);

    expect(options.baseURL).toBe("https://app.caudals.com");
    expect(options.trustedOrigins).toContain("https://app.caudals.com");
    expect(options.trustedOrigins).not.toContain("https://caudals.com");
  });

  it("keeps auth plugin tables in the auth namespace", () => {
    const schema = getSchema(createBetterAuthOptions({} as never));

    expect(Object.keys(schema).sort()).toEqual([
      "auth_account",
      "auth_invitation",
      "auth_member",
      "auth_organization",
      "auth_passkey",
      "auth_session",
      "auth_team",
      "auth_team_member",
      "auth_two_factor",
      "auth_user",
      "auth_verification",
    ]);
    expect(schema.organization).toBeUndefined();
  });

  it("generates prefixed IDs for Better Auth models", () => {
    expect(createBetterAuthId({ model: "auth_user" })).toMatch(/^au_/);
    expect(createBetterAuthId({ model: "auth_session" })).toMatch(/^as_/);
    expect(createBetterAuthId({ model: "auth_passkey" })).toMatch(/^ak_/);
    expect(createBetterAuthId({ model: "unknown" })).toMatch(/^ba_/);
  });

  it("defaults reset password tokens to 30 minutes", () => {
    expect(getResetPasswordTokenExpiresInSeconds()).toBe(60 * 30);
  });

  it("allows an operator-controlled reset password token window", () => {
    process.env[RESET_TTL_ENV] = String(60 * 60 * 4);

    expect(getResetPasswordTokenExpiresInSeconds()).toBe(60 * 60 * 4);
  });

  it("rejects unsafe reset password token windows", () => {
    process.env[RESET_TTL_ENV] = String(60);

    expect(() => getResetPasswordTokenExpiresInSeconds()).toThrow(
      "BETTER_AUTH_RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS must be between 300 and 86400 seconds"
    );
  });
});
