import { expect, test } from "@playwright/test";

const landingModeEnabled =
  process.env.LANDING_MODE === "true" ||
  process.env.NEXT_PUBLIC_LANDING_MODE === "true";

const publicRoutes = landingModeEnabled
  ? [
      {
        path: "/",
        heading: /professional datasets for ai tailored/i,
      },
      { path: "/blog", heading: /^blog$/i },
      {
        path: "/blog/launching-caudals-clearer-dataset-operations",
        heading: /launching caudals: a clearer control plane for dataset operations/i,
      },
      { path: "/contact", heading: /talk with caudals/i },
    ]
  : [
      { path: "/blog", heading: /^blog$/i },
      {
        path: "/blog/launching-caudals-clearer-dataset-operations",
        heading: /launching caudals: a clearer control plane for dataset operations/i,
      },
      { path: "/pricing", heading: /plans built for production dataset delivery/i },
      { path: "/security", heading: /security posture for ai data buyers/i },
      { path: "/docs", heading: /guides to run reliable data operations/i },
      { path: "/trust", heading: /evaluate caudals reliability before you launch/i },
      { path: "/about", heading: /dataset platform designed for operational trust/i },
      { path: "/contact", heading: /talk with caudals/i },
      { path: "/legal/privacy", heading: /privacy policy/i },
      { path: "/legal/terms", heading: /terms of service/i },
      { path: "/legal/cookies", heading: /cookie policy/i },
    ];

const blockedRoutes = landingModeEnabled
  ? [
      "/about",
      "/browse",
      "/catalog",
      "/catalogue",
      "/collaborate",
      "/dashboard",
      "/docs",
      "/landing-simple",
      "/legal/cookies",
      "/legal/privacy",
      "/legal/terms",
      "/pricing",
      "/trust",
    ]
  : [];

const directRoutes = landingModeEnabled
  ? [
      { path: "/security", heading: /security posture for ai data buyers/i },
      { path: "/v1", heading: null },
    ]
  : [];

test.describe("public route health", () => {
  for (const route of publicRoutes) {
    test(`${route.path} renders`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    });
  }
});

test.describe("landing mode route blocking", () => {
  test.skip(!landingModeEnabled, "LANDING_MODE is disabled");

  test("top navigation exposes only Contacto and Blog", async ({ page }) => {
    await page.goto("/");

    const links = page.locator("header nav").first().getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText("Contacto");
    await expect(links.nth(0)).toHaveAttribute("href", "/contact");
    await expect(links.nth(1)).toHaveText("Blog");
    await expect(links.nth(1)).toHaveAttribute("href", "/blog");
  });

  for (const path of blockedRoutes) {
    test(`${path} returns 404`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(404);
    });
  }
});

test.describe("landing mode direct-route surfaces", () => {
  test.skip(!landingModeEnabled, "LANDING_MODE is disabled");

  for (const route of directRoutes) {
    test(`${route.path} remains directly reachable`, async ({ page }) => {
      const response = await page.goto(route.path);

      expect(response?.status()).toBe(200);
      if (route.heading) {
        await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      }
      if (route.path === "/security") {
        const links = page.locator("header nav").first().getByRole("link");
        await expect(links).toHaveCount(2);
        await expect(links.nth(0)).toHaveAttribute("href", "/contact");
        await expect(links.nth(1)).toHaveAttribute("href", "/blog");
      }
    });
  }

  for (const path of ["/buyer", "/supplier"]) {
    test(`${path} redirects anonymous users to sign-in`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/auth\/sign-in/);
    });
  }
});
