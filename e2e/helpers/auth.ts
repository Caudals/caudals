import { expect, type Page } from "@playwright/test";

export const FIXTURE_OPERATOR_EMAIL = "fixture.admin@caudals.local";

const FIXTURE_PASSWORD =
  process.env.TEST_FIXTURE_PASSWORD ?? "CaudalsFixture123!";

function isBetterAuthSessionCookie(cookieName: string) {
  return (
    cookieName === "caudals.session_token" ||
    cookieName === "caudals-session_token" ||
    cookieName === "__Secure-caudals.session_token" ||
    cookieName === "__Secure-caudals-session_token"
  );
}

export async function signInAsFixtureOperator(
  page: Page,
  email = FIXTURE_OPERATOR_EMAIL
) {
  await page.goto("/auth/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(FIXTURE_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/admin(?:[?#].*)?$/, { timeout: 45_000 }),
    page.getByRole("button", { name: /sign in|iniciar sesión/i }).click(),
  ]);
  await page.waitForLoadState("domcontentloaded");

  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        return cookies.some((cookie) => isBetterAuthSessionCookie(cookie.name));
      },
      {
        timeout: 45_000,
        message: `Expected Better Auth session cookie after signing in as ${email}`,
      }
    )
    .toBe(true);
}
