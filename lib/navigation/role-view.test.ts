import { describe, expect, it } from "vitest";
import { resolveSettingsHref, resolveViewKey } from "@/lib/navigation/role-view";

describe("resolveViewKey", () => {
  it("prioritizes admin pathname for admin users", () => {
    expect(resolveViewKey("/admin", "admin")).toBe("admin");
  });

  it("uses current pathname view for admins browsing contributor routes", () => {
    expect(resolveViewKey("/contributor/settings", "admin")).toBe("contributor");
  });

  it("falls back to role when pathname is outside app surfaces", () => {
    expect(resolveViewKey("/dashboard", "contributor")).toBe("contributor");
  });
});

describe("resolveSettingsHref", () => {
  it("keeps admin in admin settings while on admin routes", () => {
    expect(resolveSettingsHref("/admin/requests", "admin")).toBe("/admin/settings");
  });

  it("sends admins to contributor settings while browsing contributor view", () => {
    expect(resolveSettingsHref("/contributor/earnings", "admin")).toBe(
      "/contributor/settings",
    );
  });

  it("sends admins to requester settings while browsing requester view", () => {
    expect(resolveSettingsHref("/requester/datasets", "admin")).toBe(
      "/requester/settings",
    );
  });
});
