import { expect, test } from "@playwright/test";

const publicRoutes = [
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
  { path: "/legal/privacy", heading: /privacy policy/i },
  { path: "/legal/terms", heading: /terms of service/i },
  { path: "/legal/cookies", heading: /cookie policy/i },
];

// Removed pre-pivot pages and marketplace surfaces.
const removedRoutes = [
  "/about",
  "/browse",
  "/buyer",
  "/careers",
  "/catalog",
  "/catalogue",
  "/collaborate",
  "/dashboard",
  "/docs",
  "/equipo",
  "/landing-simple",
  "/pricing",
  "/security",
  "/supplier",
  "/v1",
  "/v1/datasets",
];

test.describe("public route health", () => {
  for (const route of publicRoutes) {
    test(`${route.path} renders`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    });
  }

  test("top navigation exposes Contacto, Blog, Newsletter and Comenzar CTA", async ({ page }) => {
    await page.goto("/");

    const links = page.locator("header nav").first().getByRole("link");
    await expect(links).toHaveCount(4);
    await expect(links.nth(0)).toHaveText("Contacto");
    await expect(links.nth(0)).toHaveAttribute("href", "/contact");
    await expect(links.nth(1)).toHaveText("Blog");
    await expect(links.nth(1)).toHaveAttribute("href", "/blog");
    await expect(links.nth(2)).toHaveText("Newsletter");
    await expect(links.nth(2)).toHaveAttribute("href", "/newsletter");
    await expect(links.nth(3)).toHaveText("Comenzar");
    await expect(links.nth(3)).toHaveAttribute("href", "/contact");
  });
});

test.describe("removed routes", () => {
  for (const path of removedRoutes) {
    test(`${path} returns 404`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(404);
    });
  }
});
