import { getSchema } from "better-auth/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    if (originalResetTtlEnv === undefined) {
      delete process.env[RESET_TTL_ENV];
    } else {
      process.env[RESET_TTL_ENV] = originalResetTtlEnv;
    }
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
