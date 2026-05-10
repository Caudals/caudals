import { expect, test, type Page } from "@playwright/test";

const AUTH_E2E_ENABLED = process.env.PLAYWRIGHT_AUTH_E2E === "true";
const FIXTURE_PASSWORD =
  process.env.TEST_FIXTURE_PASSWORD ?? "CaudalsFixture123!";

const moduleTitles = [
  "Pipeline / Home",
  "Leads & Opportunities",
  "Suppliers",
  "Buyers",
  "Builds",
  "Datasets",
  "Quality",
  "Privacy & Rights",
  "Catalogue & Offers",
  "Commercials",
  "Operations",
  "Audit",
  "Settings",
];

const demoBuilds = [
  "Iberian retail receipts v3",
  "Cold-chain route telemetry pilot",
  "Warranty document extraction eval set",
  "Mediterranean crop imagery slice",
  "Spanish support-ticket safety corpus",
];

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
        message: `Expected auth cookie after signing in as ${email}`,
      }
    )
    .toBe(true);
}

test.describe("operator console smoke", () => {
  test.skip(
    !AUTH_E2E_ENABLED,
    "Set PLAYWRIGHT_AUTH_E2E=true to run authenticated operator console smoke checks."
  );

  test("admin can inspect the Phase 1 console surface", async ({ page }) => {
    await signIn(page, "fixture.admin@caudals.local");
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: /operator console/i })
    ).toBeVisible();
    await expect(page.getByText(/caudals ops console/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open command palette/i })
    ).toBeVisible();

    await expect(page.locator('a[href^="/admin?module="]')).toHaveCount(13);
    for (const title of moduleTitles) {
      await expect(page.getByRole("link", { name: new RegExp(title, "i") })).toBeVisible();
    }

    await expect(page.getByText(/build detail/i)).toBeVisible();
    for (const gate of ["G-1", "G-2", "G-3", "G-4", "G-5", "G-6", "G-7"]) {
      await expect(page.getByText(gate).first()).toBeVisible();
    }

    await expect(page.getByText(/license composition/i)).toBeVisible();
    await expect(page.getByText(/planner result/i)).toBeVisible();
    await expect(page.getByText(/audit overlay/i)).toBeVisible();
    await expect(page.getByText(/marquez-shaped lineage feed/i)).toBeVisible();
    await expect(page.getByText(/state-machine coverage/i)).toBeVisible();

    for (const build of demoBuilds) {
      await expect(page.getByText(build)).toBeVisible();
    }

    const hasHorizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > window.innerWidth + 1;
    });

    expect(hasHorizontalOverflow).toBeFalsy();
  });
});
