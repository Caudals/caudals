import { afterEach, describe, expect, it, vi } from "vitest";

import { getOperatorSecurityStatus } from "@/lib/auth/operator-security";
import type { CurrentOperatorSession } from "@/lib/auth/operator-session";

function session(
  overrides: Partial<CurrentOperatorSession["operator"]> = {},
  authOverrides: Partial<CurrentOperatorSession["authUser"]> = {}
): CurrentOperatorSession {
  return {
    authUser: {
      id: "au_01J2AUTH",
      email: "ops@caudals.local",
      name: "Ops",
      image: null,
      twoFactorEnabled: false,
      passkeyCount: 0,
      ...authOverrides,
    },
    operator: {
      id: "op_01J2OPS",
      email: "ops@caudals.local",
      name: "Ops",
      role: "admin",
      orgId: "or_01J2OPS",
      mfaRequired: true,
      webauthnRequired: true,
      ...overrides,
    },
  };
}

describe("operator security status", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires configured operator factors by default", () => {
    expect(getOperatorSecurityStatus(session())).toMatchObject({
      mfaRequired: true,
      mfaEnabled: false,
      webauthnRequired: true,
      webauthnRegistered: false,
      complete: false,
    });
  });

  it("allows password-only access only when enrollment enforcement is explicitly disabled", () => {
    vi.stubEnv("OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT", "false");

    expect(getOperatorSecurityStatus(session())).toMatchObject({
      mfaRequired: false,
      mfaEnabled: false,
      webauthnRequired: false,
      webauthnRegistered: false,
      complete: true,
    });
  });

  it("is complete when required factors are present", () => {
    expect(
      getOperatorSecurityStatus(
        session({}, { twoFactorEnabled: true, passkeyCount: 1 })
      )
    ).toMatchObject({
      complete: true,
    });
  });

  it("does not require optional controls", () => {
    expect(
      getOperatorSecurityStatus(
        session(
          { mfaRequired: false, webauthnRequired: false },
          { twoFactorEnabled: false, passkeyCount: 0 }
        )
      )
    ).toMatchObject({
      complete: true,
    });
  });
});
