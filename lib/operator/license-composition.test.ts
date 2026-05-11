import { describe, expect, it } from "vitest";
import {
  composeLicenseGrants,
  evaluateRequestedUse,
  isBuildPlanBlockedForLicense,
  type LicenseGrant,
} from "@/lib/operator/license-composition";

const permissiveGrant: LicenseGrant = {
  id: "lc_train_world",
  permissions: {
    train: true,
    finetune: true,
    eval: true,
    commercialInference: true,
    redistribute: false,
  },
  geo: ["WW"],
};

describe("operator license composition", () => {
  it("intersects permissions and geographies across input clauses", () => {
    const composed = composeLicenseGrants([
      permissiveGrant,
      {
        id: "lc_eval_eu",
        permissions: {
          train: true,
          finetune: false,
          eval: true,
          commercialInference: false,
          redistribute: false,
        },
        geo: ["EU"],
      },
    ]);

    expect(composed.permissions).toEqual({
      train: true,
      finetune: false,
      eval: true,
      commercialInference: false,
      redistribute: false,
    });
    expect(composed.geo).toEqual(["EU"]);
    expect(composed.blockedReasons).toEqual([]);
  });

  it("blocks a build plan when the requested use exceeds composed permits", () => {
    const result = isBuildPlanBlockedForLicense(
      [
        permissiveGrant,
        {
          id: "lc_no_commercial",
          permissions: {
            train: true,
            finetune: true,
            eval: true,
            commercialInference: false,
            redistribute: false,
          },
          geo: ["EU"],
        },
      ],
      {
        train: true,
        commercialInference: true,
        geo: ["WW"],
      }
    );

    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.reasons).toContain(
        "Requested use requires commercialInference, but the composed license forbids it"
      );
      expect(result.reasons).toContain(
        "Requested geography WW is outside composed geography EU"
      );
    }
  });

  it("flags empty license intersections before delivery", () => {
    const composed = composeLicenseGrants([
      {
        id: "lc_train_us",
        permissions: {
          train: true,
          finetune: false,
          eval: false,
          commercialInference: false,
          redistribute: false,
        },
        geo: ["US"],
      },
      {
        id: "lc_eval_eu",
        permissions: {
          train: false,
          finetune: false,
          eval: true,
          commercialInference: false,
          redistribute: false,
        },
        geo: ["EU"],
      },
    ]);

    expect(composed.permissions).toEqual({
      train: false,
      finetune: false,
      eval: false,
      commercialInference: false,
      redistribute: false,
    });
    expect(composed.geo).toEqual([]);
    expect(composed.blockedReasons).toEqual([
      "No permitted uses remain after license intersection",
      "No geography remains after license intersection",
    ]);
  });

  it("validates requested geography against world-wide composed grants", () => {
    const composed = composeLicenseGrants([permissiveGrant]);

    expect(
      evaluateRequestedUse(composed, {
        train: true,
        geo: ["EU", "US"],
      })
    ).toEqual({ allowed: true });
  });
});
