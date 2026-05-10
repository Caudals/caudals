import { describe, expect, it } from "vitest";
import { resolveSettingsHref, resolveViewKey } from "@/lib/navigation/role-view";

describe("resolveViewKey", () => {
  it("prioritizes admin pathname for admin users", () => {
    expect(resolveViewKey("/admin", "admin")).toBe("admin");
  });

  it("falls back to role when pathname is outside app surfaces", () => {
    expect(resolveViewKey("/reports", "requester")).toBe("requester");
  });
});

describe("resolveSettingsHref", () => {
  it("keeps admin in admin settings while on admin routes", () => {
    expect(resolveSettingsHref("/admin/requests", "admin")).toBe(
      "/admin?module=settings",
    );
  });

  it("sends admins to requester settings while browsing requester view", () => {
    expect(resolveSettingsHref("/requester/datasets", "admin")).toBe(
      "/requester/settings",
    );
  });
});
