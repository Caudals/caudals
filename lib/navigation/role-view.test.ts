import { describe, expect, it } from "vitest";
import { resolveSettingsHref, resolveViewKey } from "@/lib/navigation/role-view";

describe("resolveViewKey", () => {
  it("prioritizes admin pathname for admin users", () => {
    expect(resolveViewKey("/admin", "admin")).toBe("admin");
  });

  it("falls back to the operator console outside removed app surfaces", () => {
    expect(resolveViewKey("/reports", "requester")).toBe("admin");
  });
});

describe("resolveSettingsHref", () => {
  it("keeps admin in admin settings while on admin routes", () => {
    expect(resolveSettingsHref("/admin/requests", "admin")).toBe(
      "/admin?module=settings",
    );
  });

  it("keeps settings anchored to the operator console for removed requester paths", () => {
    expect(resolveSettingsHref("/requester/datasets", "admin")).toBe(
      "/admin?module=settings",
    );
  });
});
