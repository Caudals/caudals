import { describe, expect, it } from "vitest";
import {
  isSupplierPortalEnabled,
  isSupplierPortalV1Enabled,
} from "@/lib/supplier/feature-flags";

describe("supplier portal feature flag", () => {
  it("fails closed only when explicitly disabled", () => {
    expect(isSupplierPortalEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(
      isSupplierPortalEnabled({
        SUPPLIER_PORTAL_ENABLED: "false",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("keeps supplier portal v1 enabled unless explicitly disabled", () => {
    expect(isSupplierPortalV1Enabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(
      isSupplierPortalV1Enabled({
        SUPPLIER_PORTAL_V1_ENABLED: "false",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});
