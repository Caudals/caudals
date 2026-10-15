import { expect, test } from "@playwright/test";

/**
 * Run with `DEMO_PUBLIC` set as the server under test has it, like
 * e2e/public-routes.spec.ts (production: `DEMO_PUBLIC=true`).
 */
const demoPublic = process.env.DEMO_PUBLIC === "true";
const landingLinks = {
  en: { demo: /Test your assistant free/, contact: "/en/contact", call: "/en/call" },
  es: { demo: /Prueba gratis tu asistente/, contact: "/es/contacto", call: "/es/llamada" },
} as const;

test.describe("core role smoke", () => {
  test("public landing loads with its calls to action", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(en|es)$/);
    const locale = new URL(page.url()).pathname.slice(1) as keyof typeof landingLinks;
    const links = landingLinks[locale];
    await expect(page.locator("main h1").first()).toBeVisible();
    const hero = page.locator(".lp-hero").first();
    const closing = page.locator(".lp-cta");
    if (demoPublic) {
      // Launch L-04: the free test is the front door (header pill, hero, closing card).
      await expect(hero.getByRole("link", { name: links.demo })).toHaveAttribute("href", `/${locale}/demo`);
      await expect(page.locator("header nav").first().locator(`a[href="/${locale}/demo"]`)).toHaveCount(1);
      await expect(closing.locator(`a[href="/${locale}/demo"]`)).toHaveCount(1);
      // Launch L-30: a pilot request stays one link away.
      await expect(closing.locator(`a[href="${links.contact}?offer=pilot-evaluation"]`)).toHaveCount(1);
    } else {
      await expect(hero.locator(`a[href="${links.contact}?offer=reality-check"]`)).toBeVisible();
    }
    // Both: a 30-minute call next to the main call to action.
    await expect(hero.locator(`a[href="${links.call}"]`)).toHaveCount(1);
  });

  test("auth sign-in loads", async ({ page }) => {
    await page.goto("/auth/sign-in");

    await expect(page.locator("form")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in|iniciar sesión/i })
    ).toBeVisible();
  });

  test("pre-pivot self-serve routes are removed", async ({ page }) => {
    const routes = ["/requester", "/browse", "/contributor", "/dashboard", "/pwa", "/admin"];

    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(404);
    }

    const response = await page.goto("/admin/requests");
    expect(response?.status()).toBe(404);
  });

  test("legacy dashboard is removed even with a session cookie", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "caudals.session_token", value: "retired-dashboard-test", url: baseURL! }]);
    for (const path of ["/admin", "/admin?module=datasets", "/admin/requests"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.locator("[data-module-directory]")).toHaveCount(0);
    }
  });
});
