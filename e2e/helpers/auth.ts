import { expect, type Page } from "@playwright/test";
import { isBetterAuthSessionCookieName } from "../../lib/auth/session-cookie";

export const FIXTURE_OPERATOR_EMAIL = "fixture.admin@caudals.local";
export const FIXTURE_BUYER_EMAIL = "buyer.fixture@caudals.local";

const FIXTURE_PASSWORD =
  process.env.TEST_FIXTURE_PASSWORD ?? "CaudalsFixture123!";

export async function signInAsFixtureOperator(
  page: Page,
  email = FIXTURE_OPERATOR_EMAIL
) {
  await page.goto("/auth/sign-in");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(750);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(FIXTURE_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/admin(?:[?#].*)?$/, {
      timeout: 45_000,
      waitUntil: "domcontentloaded",
    }),
    page.getByRole("button", { name: /sign in|iniciar sesión/i }).click(),
  ]);
  await page.waitForLoadState("domcontentloaded");

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

export async function signInAsFixtureBuyer(
  page: Page,
  email = FIXTURE_BUYER_EMAIL
) {
  await page.goto("/buyer");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(750);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(FIXTURE_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/buyer(?:[?#].*)?$/, {
      timeout: 45_000,
      waitUntil: "domcontentloaded",
    }),
    page.getByRole("button", { name: /sign in|iniciar sesión/i }).click(),
  ]);
  await page.waitForLoadState("domcontentloaded");

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
