import { expect, test, type Page } from "@playwright/test";

const AUTH_E2E_ENABLED = process.env.PLAYWRIGHT_AUTH_E2E === "true";
const FIXTURE_PASSWORD =
  process.env.TEST_FIXTURE_PASSWORD ?? "CaudalsFixture123!";

async function signIn(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(FIXTURE_PASSWORD);
  await page.getByRole("button", { name: /sign in|iniciar sesión/i }).click();

  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        return cookies.some((cookie) => cookie.name.includes("-auth-token"));
      },
      {
        timeout: 15_000,
        message: `Expected Supabase auth cookie after signing in as ${email}`,
      },
    )
    .toBe(true);
}

test.describe("authenticated role journeys", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !AUTH_E2E_ENABLED,
    "Set PLAYWRIGHT_AUTH_E2E=true to run authenticated fixture-user smoke checks.",
  );

  test("admin can access the operator console", async ({ page }) => {
    await signIn(page, "fixture.admin@caudals.local");
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", {
        name: /operator console/i,
      }),
    ).toBeVisible();
  });
});
