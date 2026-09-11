import { expect, type Page } from "@playwright/test";
import { isBetterAuthSessionCookieName } from "../../lib/auth/session-cookie";

export const FIXTURE_OPERATOR_EMAIL = "fixture.admin@caudals.local";

const FIXTURE_PASSWORD =
  process.env.TEST_FIXTURE_PASSWORD ?? "CaudalsFixture123!";

async function submitFixtureSignIn(page: Page, email: string) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1_500);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(FIXTURE_PASSWORD);
  const signInButton = page.getByRole("button", {
    name: /sign in|iniciar sesión/i,
  });
  await expect(signInButton).toBeEnabled({
    timeout: 45_000,
  });
  await signInButton.click();

  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        return cookies.some((cookie) =>
          isBetterAuthSessionCookieName(cookie.name)
        );
      },
      {
        timeout: 45_000,
        message: `Expected Better Auth session cookie after signing in as ${email}`,
      }
    )
    .toBe(true);
}

export async function signInAsFixtureOperator(
  page: Page,
  email = FIXTURE_OPERATOR_EMAIL
) {
  await page.goto("/auth/sign-in");
  await submitFixtureSignIn(page, email);
}
