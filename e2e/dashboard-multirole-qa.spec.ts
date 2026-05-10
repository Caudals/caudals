import { expect, test, type Page } from "@playwright/test";

const AUTH_E2E_ENABLED = process.env.PLAYWRIGHT_AUTH_E2E === "true";
const FIXTURE_PASSWORD = process.env.TEST_FIXTURE_PASSWORD ?? "CaudalsFixture123!";

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
      }
    )
    .toBe(true);
}

test.describe("dashboard access failure states", () => {
  test("unauthenticated users are redirected from the admin dashboard", async ({ page }) => {
    const protectedRoutes = ["/admin"];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/sign-in/);
    }

    const requesterResponse = await page.goto("/requester");
    expect(requesterResponse?.status()).toBe(404);
  });
});

test.describe("multi-role dashboard QA pass", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !AUTH_E2E_ENABLED,
    "Set PLAYWRIGHT_AUTH_E2E=true to run authenticated multi-role QA checks."
  );

  const roles = [
    {
      name: "admin",
      email: "fixture.admin@caudals.local",
      route: "/admin",
      heading: /operator console/i,
    },
  ];

  const locales = ["en", "es"] as const;
  const breakpoints = [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "desktop", width: 1440, height: 900 },
  ];

  for (const role of roles) {
    test(`${role.name} dashboard renders across locales and breakpoints without overflow`, async ({
      page,
    }) => {
      await signIn(page, role.email);

      for (const locale of locales) {
        await page.goto(role.route);
        await page.evaluate((selectedLocale) => {
          document.cookie = `NEXT_LOCALE=${selectedLocale}; path=/; max-age=31536000`;
        }, locale);

        for (const viewport of breakpoints) {
          await page.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          await page.goto(role.route);

          await expect(page.getByRole("heading", { name: role.heading })).toBeVisible();

          const hasHorizontalOverflow = await page.evaluate(() => {
            const root = document.documentElement;
            return root.scrollWidth > window.innerWidth + 1;
          });

          expect(
            hasHorizontalOverflow,
            `${role.name} ${locale} ${viewport.name} should not overflow horizontally`
          ).toBeFalsy();
        }
      }
    });
  }
});
