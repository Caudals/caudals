import { describe, expect, it } from "vitest";
import { isSupplierPortalEnabled } from "@/lib/supplier/feature-flags";

describe("supplier portal feature flag", () => {
  it("fails closed only when explicitly disabled", () => {
    expect(isSupplierPortalEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(
      isSupplierPortalEnabled({
        SUPPLIER_PORTAL_ENABLED: "false",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});
