import { expect, test } from "@playwright/test";

test.describe("core role smoke", () => {
  test("public landing loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(
      page.locator("main").getByRole("link", { name: /free diagnostic|diagnóstico inicial gratuito/i }).first()
    ).toBeVisible();
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
