import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentOperatorSession } from "@/lib/auth/operator-session";

const { getCurrentOperatorSessionMock } = vi.hoisted(() => ({
  getCurrentOperatorSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth/operator-session", () => ({
  getCurrentOperatorSession: getCurrentOperatorSessionMock,
}));

import { GET } from "@/app/(app)/api/user/role/route";

function createRequest() {
  return new Request("http://localhost:3000/api/user/role", {
    headers: { "x-request-id": "req_role_test" },
  });
}

const operatorSession: CurrentOperatorSession = {
  authUser: {
    id: "au_operator",
    email: "ops@example.com",
    name: "Ops",
    twoFactorEnabled: true,
    passkeyCount: 1,
  },
  operator: {
    id: "op_01",
    email: "ops@example.com",
    name: "Ops",
    role: "operations",
    orgId: null,
    mfaRequired: true,
    webauthnRequired: false,
  },
};

describe("/api/user/role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a null role without an operator session", async () => {
    getCurrentOperatorSessionMock.mockResolvedValue(null);

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ role: null });
    expect(getCurrentOperatorSessionMock).toHaveBeenCalledWith(
      expect.any(Headers)
    );
  });

  it("returns the operator role for an operator session", async () => {
    getCurrentOperatorSessionMock.mockResolvedValue(operatorSession);

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      role: "operations",
      operatorId: "op_01",
    });
  });
});
