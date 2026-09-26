import { expect, test } from "@playwright/test";

/**
 * Public routes are locale-prefixed: `/en/...` and `/es/...`. An unprefixed
 * path is redirected once to the negotiated locale.
 */
const publicRoutes = [
  // Temporarily hidden:
  // { path: "/blog", heading: /^blog$/i },
  { path: "/contact", heading: /request an evaluation/i },
  { path: "/legal/privacy", heading: /privacy policy/i },
  { path: "/legal/terms", heading: /terms of service/i },
  { path: "/legal/cookies", heading: /cookie policy/i },
];

const spanishRoutes = [
  { path: "/es/contact", heading: /solicita una evaluación|solicitar una evaluación/i },
  { path: "/es/legal/privacy", heading: /política de privacidad/i },
  { path: "/es/legal/cookies", heading: /política de cookies/i },
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

test.describe("locale routing", () => {
  test("an unprefixed path redirects to a locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(en|es)$/);
  });

  test("an English browser lands on the English site", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });

  test("a Spanish browser lands on the Spanish site", async ({ browser }) => {
    const context = await browser.newContext({ locale: "es-ES" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/es$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await context.close();
  });

  test("an unsupported language prefix is a miss", async ({ page }) => {
    const response = await page.goto("/fr/blog");
    expect(response?.status()).toBe(404);
  });
});

test.describe("public route health", () => {
  for (const route of publicRoutes) {
    test(`/en${route.path} renders`, async ({ page }) => {
      await page.goto(`/en${route.path}`);
      await expect(
        page.getByRole("heading", { name: route.heading }).first(),
      ).toBeVisible();
    });
  }

  for (const route of spanishRoutes) {
    test(`${route.path} renders in Spanish`, async ({ page }) => {
      await page.goto(route.path);
      await expect(
        page.getByRole("heading", { name: route.heading }).first(),
      ).toBeVisible();
    });
  }
});

test.describe("canonical and hreflang", () => {
  test("each locale is canonical to itself and lists every alternate", async ({
    page,
  }) => {
    for (const locale of ["en", "es"]) {
      await page.goto(`/${locale}/legal/privacy`);

      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`/${locale}/legal/privacy$`),
      );

      for (const alternate of [...["en", "es"], "x-default"]) {
        await expect(
          page.locator(`link[rel="alternate"][hreflang="${alternate}"]`),
        ).toHaveCount(1);
      }
    }
  });
});

test.describe("language switcher", () => {
  test("switches language in place and keeps the page", async ({ page }) => {
    await page.goto("/es/legal/privacy");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    await page.getByRole("link", { name: /English/i }).first().click();

    await expect(page).toHaveURL(/\/en\/legal\/privacy$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", { name: /privacy policy/i }).first(),
    ).toBeVisible();
  });

  test("remembers an explicit choice for a later unprefixed visit", async ({
    browser,
  }) => {
    // A visitor whose browser asks for Spanish but who chooses English must
    // keep English; the old implementation overrode that on every request.
    const context = await browser.newContext({ locale: "es-ES" });
    const page = await context.newPage();

    await page.goto("/es");
    await page.getByRole("link", { name: /English/i }).first().click();
    await expect(page).toHaveURL(/\/en$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);

    await context.close();
  });
});

test.describe("public navigation", () => {
  test("exposes the primary links, the language switcher and the CTA", async ({
    page,
  }) => {
    await page.goto("/es");

    const nav = page.locator("header nav").first();
    await expect(nav.getByRole("link", { name: "Cómo funciona" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Contacto" })).toHaveAttribute(
      "href",
      "/es/contact",
    );
    await expect(nav.getByRole("link", { name: "Blog" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Newsletter" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Diagnóstico gratuito" })).toHaveAttribute(
      "href",
      "/es/contact?offer=reality-check",
    );
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
