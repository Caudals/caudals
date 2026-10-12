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
    // The Spanish privacy policy lives at its translated slug (launch L-01).
    for (const [locale, path] of [["en", "/legal/privacy"], ["es", "/legal/privacidad"]]) {
      await page.goto(`/${locale}${path}`);

      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`/${locale}${path}$`),
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

/**
 * Launch L-04: `DEMO_PUBLIC` makes the free test the front door. Run this file
 * with `DEMO_PUBLIC` set as the server under test has it (the dev server
 * inherits it; against production, pass the live state).
 */
const demoPublic = process.env.DEMO_PUBLIC === "true";
const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";

test.describe("public navigation", () => {
  test("exposes the primary links, the language switcher and the CTA", async ({
    page,
  }) => {
    await page.goto("/es");

    const nav = page.locator("header nav").first();
    await expect(nav.getByRole("link", { name: "Cómo funciona" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Contacto" })).toHaveAttribute(
      "href",
      "/es/contacto",
    );
    await expect(nav.getByRole("link", { name: "Blog" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Newsletter" })).toHaveCount(0);
    if (demoPublic) {
      await expect(nav.getByRole("link", { name: "Pruébalo gratis" })).toHaveAttribute("href", "/es/demo");
      await expect(nav.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", /\/workspace\/sign-in$/);
    } else {
      await expect(nav.getByRole("link", { name: "Comenzar" })).toHaveAttribute(
        "href",
        "/es/contacto?offer=reality-check",
      );
      await expect(nav.getByRole("link", { name: "Iniciar sesión" })).toHaveCount(0);
    }
  });
});

const frontDoorCopy = {
  en: { pill: "Try it free", signIn: "Sign in", hero: /^Test your assistant free — 8 questions, about 3 minutes/, call: "/en/call", sector: "/en/sectors/insurance", contact: "/en/contact", freeTest: "Free test" },
  es: { pill: "Pruébalo gratis", signIn: "Iniciar sesión", hero: /^Prueba gratis tu asistente — 8 preguntas, unos 3 minutos/, call: "/es/llamada", sector: "/es/sectores/seguros", contact: "/es/contacto", freeTest: "Prueba gratuita" },
} as const;

test.describe("front door (launch L-04)", () => {
  test.skip(!demoPublic, "DEMO_PUBLIC is off on the server under test");

  for (const locale of ["en", "es"] as const) {
    const copy = frontDoorCopy[locale];

    test(`the ${locale} home leads to the free test, keeps the call and adds sign in`, async ({ page }) => {
      await page.goto(`/${locale}`);
      const nav = page.locator("header nav").first();
      await expect(nav.getByRole("link", { name: copy.pill })).toHaveAttribute("href", `/${locale}/demo`);
      await expect(nav.getByRole("link", { name: copy.signIn })).toHaveAttribute("href", /\/workspace\/sign-in$/);
      const hero = page.locator(".lp-hero").first();
      await expect(hero.getByRole("link", { name: copy.hero })).toHaveAttribute("href", `/${locale}/demo`);
      await expect(hero.locator(`a[href="${copy.call}"]`)).toHaveCount(1);
      const footer = page.locator("footer");
      await expect(footer.getByRole("link", { name: copy.freeTest })).toHaveAttribute("href", `/${locale}/demo`);
      await expect(footer.getByRole("link", { name: copy.signIn })).toHaveAttribute("href", /\/workspace\/sign-in$/);
      // The closing card leads to the test and keeps the manual diagnostic one link away.
      const closing = page.locator(".lp-cta");
      await expect(closing.locator(`a[href="/${locale}/demo"]`)).toHaveCount(1);
      await expect(closing.locator(`a[href="${copy.contact}?offer=reality-check"]`)).toHaveCount(1);
    });

    test(`a ${locale} sector page leads to the free test`, async ({ page }) => {
      await page.goto(copy.sector);
      await expect(page.locator(".lp-hero").first().locator(`a[href="/${locale}/demo"]`)).toHaveCount(1);
      await expect(page.locator(".lp-cta").locator(`a[href="${copy.contact}?offer=reality-check&sector=insurance"]`)).toHaveCount(1);
    });

    test(`the ${locale} demo is indexable, and crawlers get title, canonical and hreflang in the head`, async ({ request }) => {
      const response = await request.get(`/${locale}/demo`, { headers: { "user-agent": GPTBOT } });
      expect(response.status()).toBe(200);
      const html = await response.text();
      const head = html.slice(0, html.indexOf("</head>"));
      expect(head).toMatch(/<title>[^<]+<\/title>/);
      expect(head).toMatch(new RegExp(`rel="canonical" href="[^"]*/${locale}/demo"`));
      expect(head).toMatch(/hreflang="en" href="[^"]*\/en\/demo"/i);
      expect(head).toMatch(/hreflang="es" href="[^"]*\/es\/demo"/i);
      expect(head).toMatch(/hreflang="x-default"/i);
      expect(head).toMatch(new RegExp(`property="og:image" content="[^"]*/${locale}/demo/opengraph-image`));
      expect(head).not.toMatch(/name="robots" content="noindex/);
      expect(html).not.toMatch(/\b(certified|compliant)\b/i);
      const image = await request.get(head.match(/property="og:image" content="([^"]+)"/)![1].replace(/^https?:\/\/[^/]+/, ""));
      expect(image.status()).toBe(200);
      expect(image.headers()["content-type"]).toBe("image/png");
    });
  }

  test("the sitemap, llms.txt and agent markdown list the free test", async ({ request }) => {
    const xml = await (await request.get("/page-sitemap.xml")).text();
    expect(xml).toContain("/en/demo</loc>");
    expect(xml).toContain("/es/demo</loc>");
    const llms = await (await request.get("/llms.txt")).text();
    expect(llms).toMatch(/\[Prueba gratuita\]\([^)]*\/es\/demo\)/);
    const markdown = await request.get("/en/demo", { headers: { accept: "text/markdown" } });
    expect(markdown.status()).toBe(200);
    expect(await markdown.text()).toContain("# Test your AI assistant for free");
  });

  test("the manual diagnostic stays reachable", async ({ page }) => {
    await page.goto("/en/contact?offer=reality-check");
    await expect(page.getByRole("heading", { name: /request an evaluation/i }).first()).toBeVisible();
  });

  for (const width of [390, 1440]) {
    test(`the front door fits a ${width}px screen, with the test one tap away`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/en", "/es", "/en/demo", "/es/demo", "/es/sectores/seguros"]) {
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
        const pill = page.locator("header").getByRole("link", { name: path.startsWith("/es") ? "Pruébalo gratis" : "Try it free" });
        await expect(pill.filter({ visible: true })).toHaveCount(1);
      }
      await page.goto("/en");
      await page.screenshot({ path: `/tmp/caudals-l04-home-${width}.png` });
    });
  }
});

test.describe("front door off (launch L-04)", () => {
  test.skip(demoPublic, "DEMO_PUBLIC is on on the server under test");

  test("the demo stays reachable but unlisted and noindex", async ({ request }) => {
    const html = await (await request.get("/en/demo", { headers: { "user-agent": GPTBOT } })).text();
    expect(html).toMatch(/name="robots" content="noindex, nofollow"/);
    expect(await (await request.get("/page-sitemap.xml")).text()).not.toContain("/demo</loc>");
    expect(await (await request.get("/llms.txt")).text()).not.toContain("/demo)");
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
