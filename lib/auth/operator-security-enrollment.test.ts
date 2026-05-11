import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getResetEligibleOperators,
  isOperatorSecurityEnrollmentComplete,
  mapOperatorSecurityEnrollmentRow,
  summarizeOperatorSecurityEnrollment,
} from "@/lib/auth/operator-security-enrollment";

describe("operator security enrollment helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats MFA and passkeys as optional by default", () => {
    const operator = mapOperatorSecurityEnrollmentRow({
      id: "op_pending",
      email: "ops@example.com",
      name: "Ops",
      role: "admin",
      state: "active",
      mfaRequired: true,
      mfaEnabled: false,
      webauthnRequired: true,
      passkeyCount: 0,
    });

    expect(operator).toMatchObject({
      mfaRequired: false,
      webauthnRequired: false,
      securityComplete: true,
      resetEligible: false,
    });
  });

  it("marks required operators complete only after MFA and passkey enrollment when enforcement is enabled", () => {
    vi.stubEnv("OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT", "true");

    const pending = mapOperatorSecurityEnrollmentRow({
      id: "op_pending",
      email: "ops@example.com",
      name: "Ops",
      role: "admin",
      state: "active",
      mfaRequired: true,
      mfaEnabled: true,
      webauthnRequired: true,
      passkeyCount: 0,
    });

    const complete = mapOperatorSecurityEnrollmentRow({
      ...pending,
      id: "op_complete",
      email: "ready@example.com",
      passkeyCount: "1",
    });

    expect(pending).toMatchObject({
      securityComplete: false,
      resetEligible: true,
    });
    expect(complete).toMatchObject({
      securityComplete: true,
      resetEligible: false,
      passkeyCount: 1,
    });
  });

  it("keeps fixture operators out of reset reminders", () => {
    vi.stubEnv("OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT", "true");

    const fixture = mapOperatorSecurityEnrollmentRow({
      id: "op_fixture",
      email: "fixture.admin@caudals.local",
      name: "Fixture",
      role: "admin",
      state: "active",
      mfaRequired: true,
      mfaEnabled: false,
      webauthnRequired: true,
      passkeyCount: 0,
    });

    expect(fixture.securityComplete).toBe(false);
    expect(fixture.resetEligible).toBe(false);
  });

  it("summarizes enrollment and reset-eligible operators", () => {
    vi.stubEnv("OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT", "true");

    const operators = [
      mapOperatorSecurityEnrollmentRow({
        id: "op_ready",
        email: "ready@example.com",
        name: "Ready",
        role: "admin",
        state: "active",
        mfaRequired: true,
        mfaEnabled: true,
        webauthnRequired: true,
        passkeyCount: 1,
      }),
      mapOperatorSecurityEnrollmentRow({
        id: "op_pending",
        email: "pending@example.com",
        name: "Pending",
        role: "admin",
        state: "active",
        mfaRequired: true,
        mfaEnabled: false,
        webauthnRequired: true,
        passkeyCount: 0,
      }),
    ];

    expect(summarizeOperatorSecurityEnrollment(operators)).toMatchObject({
      total: 2,
      complete: 1,
      actionNeeded: 1,
      mfaRequired: 2,
      mfaEnabled: 1,
      webauthnRequired: 2,
      passkeyUsers: 1,
      resetEligible: 1,
    });
    expect(getResetEligibleOperators(operators)).toEqual([operators[1]]);
    expect(
      isOperatorSecurityEnrollmentComplete(
        summarizeOperatorSecurityEnrollment(operators)
      )
    ).toBe(false);
    expect(
      isOperatorSecurityEnrollmentComplete({
        ...summarizeOperatorSecurityEnrollment(operators),
        complete: 2,
        actionNeeded: 0,
      })
    ).toBe(true);
  });
});
