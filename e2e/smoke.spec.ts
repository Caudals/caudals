import { expect, test } from "@playwright/test";

const landingModeEnabled =
  process.env.LANDING_MODE === "true" ||
  process.env.NEXT_PUBLIC_LANDING_MODE === "true";

test.describe("core role smoke", () => {
  test("public landing loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /subscribe|suscribirse/i })
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
    const routes = ["/requester", "/browse", "/contributor", "/dashboard", "/pwa"];

    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(404);
    }

    const response = await page.goto("/admin/requests");
    expect(response?.status()).toBe(404);
  });

  test("admin route redirects anonymous users to sign-in", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test("buyer workspace redirects anonymous users to sign-in", async ({ page }) => {
    test.skip(landingModeEnabled, "buyer surface is hidden when LANDING_MODE=true");
    await page.goto("/buyer");

    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test("supplier portal redirects anonymous users to sign-in", async ({ page }) => {
    test.skip(landingModeEnabled, "supplier surface is hidden when LANDING_MODE=true");
    await page.goto("/supplier");

    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
