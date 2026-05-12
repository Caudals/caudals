import { afterEach, describe, expect, it, vi } from "vitest";

import { validateComplianceControlScope } from "@/lib/operator/compliance-controls";

describe("compliance control scoping", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts ready controls with SOC 2, ISO 27001, owner, and evidence mappings", () => {
    expect(
      validateComplianceControlScope(
        {
          scopeBoundary: "Caudals production app, Postgres, Spaces, and operator access.",
          ownerOperatorId: "op_01J20000000000000000000001",
          frameworkMappings: {
            soc2: { criteria: ["CC6.1", "CC7.2"] },
            iso27001: { controls: ["A.5.15", "A.8.15"] },
          },
          evidenceSources: [{ type: "audit_event", query: "operator_elevation" }],
          linkedRecords: [{ type: "operator_elevation", id: "oe_01J2" }],
          implementationStatus: "implemented",
          nextReviewAt: "2026-08-10T12:00:00.000Z",
        },
        "ready"
      )
    ).toEqual({ ok: true, missing: [] });
  });

  it("fails closed when the scoping feature flag is disabled", () => {
    vi.stubEnv("COMPLIANCE_CONTROL_SCOPING_ENABLED", "false");

    expect(validateComplianceControlScope({}, "draft")).toEqual({
      ok: false,
      missing: ["feature_flag"],
    });
  });
});
