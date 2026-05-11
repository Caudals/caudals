import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getActiveOperatorElevationMock,
  grantOperatorElevationMock,
  requireCurrentOperatorMock,
  revalidatePathMock,
  revokeOperatorElevationMock,
} = vi.hoisted(() => ({
  getActiveOperatorElevationMock: vi.fn(),
  grantOperatorElevationMock: vi.fn(),
  requireCurrentOperatorMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revokeOperatorElevationMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth/operator-session", () => ({
  requireCurrentOperator: requireCurrentOperatorMock,
}));

vi.mock("@/lib/auth/operator-elevation", () => ({
  getActiveOperatorElevation: getActiveOperatorElevationMock,
  grantOperatorElevation: grantOperatorElevationMock,
  revokeOperatorElevation: revokeOperatorElevationMock,
}));

import {
  getCurrentOperatorElevationStatus,
  grantCurrentOperatorElevation,
  revokeCurrentOperatorElevation,
} from "@/lib/actions/operator-elevation-actions";

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

const grant = {
  id: "oe_01J2ELEVATION",
  orgId: "or_01J2OPS",
  operatorId: "op_01J2SERVICE",
  scope: "production_db",
  reason: "Investigate the production build queue safely",
  state: "active",
  expiresAt: "2026-05-10T15:00:00.000Z",
  auditEventId: "ae_01J2ELEVATION",
};

describe("operator elevation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    requireCurrentOperatorMock.mockResolvedValue(session);
    getActiveOperatorElevationMock.mockResolvedValue(null);
    grantOperatorElevationMock.mockResolvedValue(grant);
    revokeOperatorElevationMock.mockResolvedValue({ ...grant, state: "revoked" });
  });

  it("reports status for the configured service operator", async () => {
    vi.stubEnv("OPERATOR_CONSOLE_OPERATOR_ID", "op_01J2SERVICE");
    vi.stubEnv("OPERATOR_CONSOLE_REQUIRE_JIT_ELEVATION", "true");
    vi.stubEnv("OPERATOR_CONSOLE_SERVICE_ROLE", "true");
    getActiveOperatorElevationMock.mockResolvedValue(grant);

    await expect(getCurrentOperatorElevationStatus()).resolves.toEqual({
      ok: true,
      status: {
        enforcementEnabled: true,
        serviceRoleEnabled: true,
        currentOperatorId: "op_01J2CURRENT",
        targetOperatorId: "op_01J2SERVICE",
        targetIsCurrentOperator: false,
        scope: "production_db",
        canManage: true,
        activeGrant: grant,
      },
    });
    expect(getActiveOperatorElevationMock).toHaveBeenCalledWith({
      orgId: "or_01J2OPS",
      operatorId: "op_01J2SERVICE",
      scope: "production_db",
    });
  });

  it("grants elevation with an audited actor and service target", async () => {
    vi.stubEnv("OPERATOR_CONSOLE_OPERATOR_ID", "op_01J2SERVICE");

    const result = await grantCurrentOperatorElevation({
      reason: "Investigate the production build queue safely",
      durationMinutes: 15,
    });

    expect(result).toMatchObject({
      ok: true,
      grant,
      status: {
        targetOperatorId: "op_01J2SERVICE",
      },
    });
    expect(grantOperatorElevationMock).toHaveBeenCalledWith({
      orgId: "or_01J2OPS",
      operatorId: "op_01J2SERVICE",
      actorOperatorId: "op_01J2CURRENT",
      reason: "Investigate the production build queue safely",
      durationMinutes: 15,
      scope: "production_db",
      metadata: {
        source: "operator_console",
        requested_by: "op_01J2CURRENT",
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });

  it("rejects unauthorized roles before granting elevation", async () => {
    requireCurrentOperatorMock.mockResolvedValue({
      ...session,
      operator: {
        ...session.operator,
        role: "qa",
      },
    });

    await expect(
      grantCurrentOperatorElevation({
        reason: "Investigate the production build queue safely",
      })
    ).resolves.toEqual({
      code: "FORBIDDEN",
      error:
        "Only admin and data engineer operators can grant production DB elevation",
    });
    expect(grantOperatorElevationMock).not.toHaveBeenCalled();
  });

  it("revokes active elevation grants", async () => {
    vi.stubEnv("OPERATOR_CONSOLE_OPERATOR_ID", "op_01J2SERVICE");

    const result = await revokeCurrentOperatorElevation({
      elevationId: "oe_01J2ELEVATION",
    });

    expect(result).toMatchObject({
      ok: true,
      grant: {
        id: "oe_01J2ELEVATION",
        state: "revoked",
      },
    });
    expect(revokeOperatorElevationMock).toHaveBeenCalledWith({
      orgId: "or_01J2OPS",
      operatorId: "op_01J2SERVICE",
      actorOperatorId: "op_01J2CURRENT",
      elevationId: "oe_01J2ELEVATION",
      reason: undefined,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });
});
