import { describe, expect, it } from "vitest";

import {
  getResetEligibleOperators,
  mapOperatorSecurityEnrollmentRow,
  summarizeOperatorSecurityEnrollment,
} from "@/lib/auth/operator-security-enrollment";

describe("operator security enrollment helpers", () => {
  it("marks required operators complete only after MFA and passkey enrollment", () => {
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
  });
});
