import { expect, test } from "@playwright/test";

test.describe("core role smoke", () => {
  test("public landing loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /start a project|iniciar un proyecto/i })
    ).toBeVisible();
  });

  test("auth sign-in loads", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await expect(page.locator("form")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in|iniciar sesión/i })
    ).toBeVisible();
  });

  test("requester route redirects anonymous users to sign-in", async ({
    page,
  }) => {
    await page.goto("/requester");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test("contributor route redirects anonymous users to sign-in", async ({
    page,
  }) => {
    await page.goto("/contributor");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test("admin route redirects anonymous users to sign-in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
