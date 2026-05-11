import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock, requireCurrentOperatorMock, revalidatePathMock } =
  vi.hoisted(() => ({
    queryRowsMock: vi.fn(),
    requireCurrentOperatorMock: vi.fn(),
    revalidatePathMock: vi.fn(),
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

import { createOperatorSigningKey } from "@/lib/actions/signing-key-actions";

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

describe("signing key actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-signing-key-encryption");
    requireCurrentOperatorMock.mockResolvedValue(session);
    queryRowsMock.mockImplementation(async (_sql: string, values: unknown[]) => [
      {
        id: values[0],
        public_key: values[2],
        algorithm: "Ed25519",
        state: "active",
        created_at: "2026-05-10T15:00:00.000Z",
        audit_event_id: values[5],
      },
    ]);
  });

  it("generates and stores an encrypted Ed25519 signing key", async () => {
    const result = await createOperatorSigningKey({
      reason: "Rotate delivery signing key before private beta",
    });

    expect(result).toMatchObject({
      ok: true,
      signingKey: {
        id: expect.stringMatching(/^sk_/),
        algorithm: "Ed25519",
        state: "active",
        auditEventId: expect.stringMatching(/^ae_/),
        publicKeyFingerprint: expect.any(String),
      },
    });
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO signing_key"),
      [
        expect.stringMatching(/^sk_/),
        "or_01J2OPS",
        expect.stringContaining("BEGIN PUBLIC KEY"),
        expect.any(Buffer),
        "op_01J2CURRENT",
        expect.stringMatching(/^ae_/),
        "Rotate delivery signing key before private beta",
        expect.any(String),
      ],
      {
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
        serviceRole: true,
      }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });

  it("rejects unauthorized roles before generating keys", async () => {
    requireCurrentOperatorMock.mockResolvedValue({
      ...session,
      operator: {
        ...session.operator,
        role: "qa",
      },
    });

    await expect(
      createOperatorSigningKey({
        reason: "Rotate delivery signing key before private beta",
      })
    ).resolves.toEqual({
      code: "FORBIDDEN",
      error: "Only admin and data engineer operators can create signing keys",
    });
    expect(queryRowsMock).not.toHaveBeenCalled();
  });
});
