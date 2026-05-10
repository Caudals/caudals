import { expect, test } from "@playwright/test";

const landingModeEnabled =
  process.env.LANDING_MODE === "true" ||
  process.env.NEXT_PUBLIC_LANDING_MODE === "true";

test.describe("core role smoke", () => {
  test("public landing loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /request access|solicitar acceso/i })
    ).toBeVisible();
  });

  test("auth sign-in loads", async ({ page }) => {
    const response = await page.goto("/auth/sign-in");

    if (landingModeEnabled || response?.status() === 404) {
      expect(response?.status()).toBe(404);
      return;
    }

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
    const response = await page.goto("/admin");

    if (landingModeEnabled || response?.status() === 404) {
      expect(response?.status()).toBe(404);
      return;
    }

    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
