import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock, revalidatePathMock, requireCurrentOperatorMock } = vi.hoisted(() => ({
  queryRowsMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  requireCurrentOperatorMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth/operator-session", () => ({
  requireCurrentOperator: requireCurrentOperatorMock,
}));

vi.mock("@/lib/db/client", () => ({
  queryRows: queryRowsMock,
}));

import {
  getOperatorSecurityRoster,
  requestOperatorSecurityResetLinks,
} from "@/lib/actions/operator-security-actions";

const originalBetterAuthUrl = process.env.BETTER_AUTH_URL;
const fetchMock = vi.fn();

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
    vi.stubGlobal("fetch", fetchMock);
    process.env.BETTER_AUTH_URL = "https://app.caudals.com";
    fetchMock.mockResolvedValue({ ok: true });
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

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = originalBetterAuthUrl;
    }
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
            mfaRequired: false,
            mfaEnabled: true,
            webauthnRequired: false,
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
            mfaRequired: false,
            mfaEnabled: false,
            webauthnRequired: false,
            passkeyCount: 0,
            securityComplete: true,
            lastSessionAt: null,
            lastSessionExpiresAt: null,
          },
        ],
        summary: {
          total: 2,
          complete: 2,
          actionNeeded: 0,
          mfaRequired: 0,
          mfaEnabled: 1,
          webauthnRequired: 0,
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

  it("does not request reset links for optional MFA/passkey hardening", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        id: "op_01PENDING",
        email: "pending@example.com",
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

    await expect(requestOperatorSecurityResetLinks()).resolves.toEqual({
      ok: true,
      message: "No reset-eligible operators need security enrollment.",
      resetRequests: 0,
      failedRequests: 0,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryRowsMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("skips reset requests when no real operator is eligible", async () => {
    await expect(requestOperatorSecurityResetLinks()).resolves.toEqual({
      ok: true,
      message: "No reset-eligible operators need security enrollment.",
      resetRequests: 0,
      failedRequests: 0,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryRowsMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("restricts reset link requests to admins", async () => {
    requireCurrentOperatorMock.mockResolvedValue({
      ...session,
      operator: {
        ...session.operator,
        role: "qa",
      },
    });

    await expect(requestOperatorSecurityResetLinks()).resolves.toEqual({
      ok: false,
      message: "Only admin operators can inspect operator security enrollment",
      resetRequests: 0,
      failedRequests: 0,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryRowsMock).not.toHaveBeenCalled();
  });
});
