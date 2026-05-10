import { getSchema } from "better-auth/db";
import { describe, expect, it } from "vitest";

import { createBetterAuthId } from "@/lib/auth/better-auth-ids";
import { createBetterAuthOptions } from "@/lib/auth/better-auth-options";

describe("Better Auth options", () => {
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
});
