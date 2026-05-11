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

  it("requests reset links for real incomplete operators and audits the request", async () => {
    queryRowsMock
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([]);

    await expect(requestOperatorSecurityResetLinks()).resolves.toEqual({
      ok: true,
      message: "1 reset link(s) requested.",
      resetRequests: 1,
      failedRequests: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "/api/auth/request-password-reset",
        "https://app.caudals.com"
      ),
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "pending@example.com",
          redirectTo: "https://app.caudals.com/auth/reset-password",
        }),
      })
    );
    expect(queryRowsMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("operator_security.reset_links_requested"),
      expect.arrayContaining([
        expect.stringMatching(/^ae_/),
        "or_01J2OPS",
        "op_01J2CURRENT",
        expect.stringContaining("op_01PENDING"),
      ]),
      {
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
        serviceRole: true,
      }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });

  it("audits failed reset link requests", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    queryRowsMock
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([]);

    await expect(requestOperatorSecurityResetLinks()).resolves.toEqual({
      ok: false,
      message: "1 reset request(s) failed.",
      resetRequests: 0,
      failedRequests: 1,
    });

    expect(queryRowsMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("operator_security.reset_links_requested"),
      expect.arrayContaining([
        expect.stringMatching(/^ae_/),
        "or_01J2OPS",
        "op_01J2CURRENT",
        expect.stringContaining("\"reset_failed_count\":1"),
      ]),
      {
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
        serviceRole: true,
      }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
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
