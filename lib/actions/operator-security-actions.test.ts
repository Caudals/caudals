import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock, requireCurrentOperatorMock } = vi.hoisted(() => ({
  queryRowsMock: vi.fn(),
  requireCurrentOperatorMock: vi.fn(),
}));

vi.mock("@/lib/auth/operator-session", () => ({
  requireCurrentOperator: requireCurrentOperatorMock,
}));

vi.mock("@/lib/db/client", () => ({
  queryRows: queryRowsMock,
}));

import { getOperatorSecurityRoster } from "@/lib/actions/operator-security-actions";

const session = {
  authUser: {
    id: "au_01J2AUTH",
    email: "ops@caudals.local",
    name: "Ops",
    twoFactorEnabled: true,
    passkeyCount: 1,
  },
  operator: {
    id: "op_01J2CURRENT",
    email: "ops@caudals.local",
    name: "Ops",
    role: "admin",
    orgId: "or_01J2OPS",
    mfaRequired: true,
    webauthnRequired: true,
  },
};

describe("operator security actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCurrentOperatorMock.mockResolvedValue(session);
    queryRowsMock.mockResolvedValue([
      {
        id: "op_01READY",
        email: "ready@caudals.local",
        name: "Ready Operator",
        role: "admin",
        state: "active",
        mfaRequired: true,
        mfaEnabled: true,
        webauthnRequired: true,
        passkeyCount: 1,
        lastSessionAt: "2026-05-10T10:00:00.000Z",
        lastSessionExpiresAt: "2026-05-10T18:00:00.000Z",
      },
      {
        id: "op_01PENDING",
        email: "pending@caudals.local",
        name: "Pending Operator",
        role: "privacy",
        state: "active",
        mfaRequired: true,
        mfaEnabled: false,
        webauthnRequired: true,
        passkeyCount: 0,
        lastSessionAt: null,
        lastSessionExpiresAt: null,
      },
    ]);
  });

  it("returns the operator security enrollment roster and summary", async () => {
    await expect(getOperatorSecurityRoster()).resolves.toEqual({
      ok: true,
      roster: {
        operators: [
          {
            id: "op_01READY",
            email: "ready@caudals.local",
            name: "Ready Operator",
            role: "admin",
            state: "active",
            mfaRequired: true,
            mfaEnabled: true,
            webauthnRequired: true,
            passkeyCount: 1,
            securityComplete: true,
            lastSessionAt: "2026-05-10T10:00:00.000Z",
            lastSessionExpiresAt: "2026-05-10T18:00:00.000Z",
          },
          {
            id: "op_01PENDING",
            email: "pending@caudals.local",
            name: "Pending Operator",
            role: "privacy",
            state: "active",
            mfaRequired: true,
            mfaEnabled: false,
            webauthnRequired: true,
            passkeyCount: 0,
            securityComplete: false,
            lastSessionAt: null,
            lastSessionExpiresAt: null,
          },
        ],
        summary: {
          total: 2,
          complete: 1,
          actionNeeded: 1,
          mfaRequired: 2,
          mfaEnabled: 1,
          webauthnRequired: 2,
          passkeyUsers: 1,
        },
      },
    });
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM \"operator\" o"),
      ["or_01J2OPS"],
      {
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
        serviceRole: true,
      }
    );
  });

  it("restricts roster visibility to admins", async () => {
    requireCurrentOperatorMock.mockResolvedValue({
      ...session,
      operator: {
        ...session.operator,
        role: "qa",
      },
    });

    await expect(getOperatorSecurityRoster()).resolves.toEqual({
      code: "FORBIDDEN",
      error: "Only admin operators can inspect operator security enrollment",
    });
    expect(queryRowsMock).not.toHaveBeenCalled();
  });
});
