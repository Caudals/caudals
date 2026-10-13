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

  it("indexes only the public landing routes", async () => {
    const { getIndexableMarketingRoutes } = await import("@/lib/seo");

    expect(getIndexableMarketingRoutes().map((route) => route.pathname)).toEqual(
      [
        "/",
        "/sectors",
        "/sectors/insurance",
        "/sectors/industrial-after-sales",
        "/sectors/healthcare",
        "/sectors/banking",
        "/sectors/energy",
        "/sectors/telecom",
        "/sectors/legal-and-advisory",
        "/sectors/travel",
        "/methodology",
        "/call",
        "/contact",
        "/legal/terms",
        "/legal/privacy",
        "/legal/dpa",
        "/legal/subprocessors",
        "/legal/security",
        "/legal/cookies",
        "/legal/notice",
      ]
    );
  });

  it("lists the free test after the home page only while DEMO_PUBLIC is on (launch L-04)", async () => {
    const { getIndexableMarketingRoutes } = await import("@/lib/seo");

    delete process.env.DEMO_PUBLIC;
    expect(getIndexableMarketingRoutes().map((route) => route.pathname)).not.toContain("/demo");

    process.env.DEMO_PUBLIC = "true";
    const routes = getIndexableMarketingRoutes();
    expect(routes.slice(0, 3).map((route) => route.pathname)).toEqual(["/", "/demo", "/sectors"]);
    expect(routes[1]).toMatchObject({ changeFrequency: "monthly", lastModified: "2026-10-12" });

    process.env.DEMO_PUBLIC = "false";
    expect(getIndexableMarketingRoutes().map((route) => route.pathname)).not.toContain("/demo");
  });

  it("indexes the demo page with canonical and hreflang only while DEMO_PUBLIC is on", async () => {
    const { generateMetadata } = await import("@/app/[locale]/demo/page");

    delete process.env.DEMO_PUBLIC;
    const hidden = await generateMetadata({ params: Promise.resolve({ locale: "es" }) });
    expect(hidden.robots).toMatchObject({ index: false, follow: false });

    process.env.DEMO_PUBLIC = "true";
    const indexed = await generateMetadata({ params: Promise.resolve({ locale: "es" }) });
    expect(indexed.robots).toMatchObject({ index: true, follow: true });
    expect(indexed.title).toBe("Prueba gratis tu asistente de IA");
    expect(indexed.alternates).toMatchObject({
      canonical: "https://caudals.com/es/demo",
      languages: { en: "https://caudals.com/en/demo", es: "https://caudals.com/es/demo", "x-default": "https://caudals.com/en/demo" },
    });
    expect(indexed.openGraph).toMatchObject({ url: "https://caudals.com/es/demo", locale: "es_ES" });
  });

  it("places the brand after the page phrase in social titles", async () => {
    const { buildPublicMetadata } = await import("@/lib/seo");
    const metadata = buildPublicMetadata({
      title: "Contacto para datasets de IA",
      description: "Descripción de prueba.",
      pathname: "/contact",
    });

    expect(metadata.title).toBe("Contacto para datasets de IA");
    expect(metadata.openGraph).toMatchObject({
      title: "Contacto para datasets de IA | Caudals",
    });
    expect(metadata.twitter).toMatchObject({
      title: "Contacto para datasets de IA | Caudals",
    });
  });
});
