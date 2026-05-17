import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("seo helpers", () => {
  it("uses the primary marketing hostname for canonical URLs", async () => {
    process.env.NEXT_PUBLIC_MARKETING_HOSTNAMES =
      "caudals.com,www.caudals.com";

    const { buildMarketingUrl, getMarketingSiteOrigin } = await import(
      "@/lib/seo"
    );

    expect(getMarketingSiteOrigin()).toBe("https://caudals.com");
    expect(buildMarketingUrl("/blog")).toBe("https://caudals.com/blog");
  });

  it("uses the primary app hostname when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_HOSTNAMES =
      "app.caudals.com,www.app.caudals.com";

    const { getAppSiteOrigin } = await import("@/lib/seo");

    expect(getAppSiteOrigin()).toBe("https://app.caudals.com");
  });

  it("limits indexable marketing routes in landing mode", async () => {
    process.env.LANDING_MODE = "true";

    const { getIndexableMarketingRoutes } = await import("@/lib/seo");

    expect(getIndexableMarketingRoutes().map((route) => route.pathname)).toEqual(
      ["/", "/blog", "/contact"]
    );
  });
});
