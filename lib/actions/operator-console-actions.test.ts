import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { validateOperatorTransition } from "@/lib/actions/operator-console-actions";

describe("operator console actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates state transitions and returns audit payloads", async () => {
    const result = await validateOperatorTransition({
      workflow: "build",
      targetId: "bd_01J2RECEIPTS",
      fromState: "qa",
      toState: "packaging",
      reason: "QA scorecard approved",
    });

    expect(result).toEqual({
      ok: true,
      auditEvent: {
        action: "state_transition",
        target_type: "build",
        target_id: "bd_01J2RECEIPTS",
        metadata: {
          from_state: "qa",
          to_state: "packaging",
          reason: "QA scorecard approved",
        },
      },
      persisted: false,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });

  it("rejects invalid workflow jumps before persistence", async () => {
    const result = await validateOperatorTransition({
      workflow: "delivery",
      targetId: "dl_01J2SHIP",
      fromState: "scheduled",
      toState: "accepted",
    });

    expect(result).toEqual({
      code: "CONFLICT",
      error: "delivery cannot transition from scheduled to accepted",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("accepts escalation-case transitions through the action validator", async () => {
    const result = await validateOperatorTransition({
      workflow: "escalation_case",
      targetId: "ec_01J2SUPPLIERFAIL",
      fromState: "triaged",
      toState: "mitigating",
      reason: "Supplier owner acknowledged R-05 recovery.",
    });

    expect(result).toMatchObject({
      ok: true,
      auditEvent: {
        target_type: "escalation_case",
        target_id: "ec_01J2SUPPLIERFAIL",
        metadata: {
          from_state: "triaged",
          to_state: "mitigating",
          reason: "Supplier owner acknowledged R-05 recovery.",
        },
      },
      persisted: false,
    });
  });
});
