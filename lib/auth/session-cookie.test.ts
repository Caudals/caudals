import { describe, expect, it } from "vitest";

import { isBetterAuthSessionCookieName } from "@/lib/auth/session-cookie";

describe("Better Auth session cookie names", () => {
  it("recognizes Better Auth session cookie variants", () => {
    expect(isBetterAuthSessionCookieName("caudals.session_token")).toBe(true);
    expect(isBetterAuthSessionCookieName("caudals-session_token")).toBe(true);
    expect(isBetterAuthSessionCookieName("__Secure-caudals.session_token")).toBe(
      true
    );
    expect(isBetterAuthSessionCookieName("__Secure-caudals-session_token")).toBe(
      true
    );
  });

  it("rejects unrelated cookies", () => {
    expect(isBetterAuthSessionCookieName("NEXT_LOCALE")).toBe(false);
    expect(isBetterAuthSessionCookieName("caudals.csrf_token")).toBe(false);
  });
});
