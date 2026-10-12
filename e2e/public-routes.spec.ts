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
  { path: "/legal/notice", heading: /legal notice/i },
  { path: "/legal/dpa", heading: /data processing agreement/i },
  { path: "/legal/subprocessors", heading: /sub-processors/i },
  { path: "/legal/security", heading: /^security$/i },
];

const spanishRoutes = [
  { path: "/es/contact", heading: /solicita una evaluación|solicitar una evaluación/i },
  { path: "/es/legal/privacy", heading: /política de privacidad/i },
  { path: "/es/legal/cookies", heading: /política de cookies/i },
  { path: "/es/legal/terminos", heading: /términos del servicio/i },
  { path: "/es/legal/aviso-legal", heading: /aviso legal/i },
  { path: "/es/legal/encargo-de-tratamiento", heading: /contrato de encargo del tratamiento/i },
  { path: "/es/legal/subencargados", heading: /subencargados del tratamiento/i },
  { path: "/es/legal/seguridad", heading: /^seguridad$/i },
];

/** Legal pages: internal path and the Spanish public path (launch L-01). */
const legalPages = [
  { path: "/legal/terms", es: "/legal/terminos" },
  { path: "/legal/privacy", es: "/legal/privacidad" },
  { path: "/legal/dpa", es: "/legal/encargo-de-tratamiento" },
  { path: "/legal/subprocessors", es: "/legal/subencargados" },
  { path: "/legal/security", es: "/legal/seguridad" },
  { path: "/legal/cookies", es: "/legal/cookies" },
  { path: "/legal/notice", es: "/legal/aviso-legal" },
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

test.describe("legal pages (launch L-01)", () => {
  for (const legal of legalPages) {
    test(`${legal.path} is published in both locales with hreflang and no placeholders`, async ({ request }) => {
      for (const [locale, publicPath] of [["en", legal.path], ["es", legal.es]] as const) {
        const response = await request.get(`/${locale}${publicPath}`);
        expect(response.status()).toBe(200);
        const html = await response.text();
        expect(html).toContain(`<html lang="${locale}"`);
        expect(html).toMatch(new RegExp(`rel="canonical" href="[^"]*/${locale}${publicPath}"`));
        expect(html).toMatch(new RegExp(`hreflang="en" href="[^"]*/en${legal.path}"`, "i"));
        expect(html).toMatch(new RegExp(`hreflang="es" href="[^"]*/es${legal.es}"`, "i"));
        expect(html).toMatch(/hreflang="x-default"/i);
        expect(html).not.toMatch(/\[(legal company name|NIF\/CIF|registered address|razón social|domicilio social)\]/i);
        expect(html).not.toMatch(/B00000000|Calle Ejemplo|Tomo 0000|VA-00000/);
        expect(html).not.toMatch(/\b(certified|compliant)\b/i);
      }
    });
  }

  test("the internal path redirects to the Spanish slug", async ({ page }) => {
    await page.goto("/es/legal/dpa");
    await expect(page).toHaveURL(/\/es\/legal\/encargo-de-tratamiento$/);
  });

  test("the footer links every legal page", async ({ page }) => {
    await page.goto("/en/legal/terms");
    const footer = page.locator("footer");
    for (const legal of legalPages) {
      await expect(footer.locator(`a[href="/en${legal.path}"]`)).toHaveCount(1);
    }
  });

  test("the legal notice names the trade name until the company data is set", async ({ page }) => {
    await page.goto("/en/legal/notice");
    await expect(page.getByText(/operated under the trade name Caudals/)).toBeVisible();
  });

  test("the DPA template downloads as Word in both languages", async ({ request }) => {
    for (const locale of ["en", "es"]) {
      const response = await request.get(`/legal/caudals-dpa-${locale}.docx`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("wordprocessingml");
      expect(response.headers()["content-disposition"]).toContain(`caudals-dpa-2026-10-11-${locale}.docx`);
    }
    expect((await request.get("/legal/other.docx")).status()).toBe(404);
  });

  test("the sitemap lists the legal pages with their Spanish slugs", async ({ request }) => {
    const xml = await (await request.get("/page-sitemap.xml")).text();
    for (const legal of legalPages) {
      expect(xml).toContain(`/en${legal.path}</loc>`);
      expect(xml).toContain(`/es${legal.es}</loc>`);
    }
    const llms = await (await request.get("/llms.txt")).text();
    expect(llms).toContain("/es/legal/encargo-de-tratamiento");
    expect(llms).toContain("/es/legal/subencargados");
    expect(llms).toContain("/es/legal/seguridad");
  });

  for (const width of [390, 1440]) {
    test(`legal pages fit a ${width}px screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/en/legal/subprocessors", "/es/legal/terminos"]) {
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    });
  }
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
    await expect(nav.getByRole("link", { name: "Comenzar" })).toHaveAttribute(
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
