import { expect, test } from "@playwright/test";
import {
  FIXTURE_OPERATOR_EMAIL,
  signInAsFixtureOperator,
} from "./helpers/auth";

const AUTH_E2E_ENABLED = process.env.PLAYWRIGHT_AUTH_E2E === "true";

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

test.describe("operator console smoke", () => {
  test.setTimeout(180_000);

  test.skip(
    !AUTH_E2E_ENABLED,
    "Set PLAYWRIGHT_AUTH_E2E=true to run authenticated operator console smoke checks."
  );

  test("admin can inspect the Phase 1 console surface", async ({ page }) => {
    await signInAsFixtureOperator(page, FIXTURE_OPERATOR_EMAIL);
    await page.goto("/admin", {
      timeout: 180_000,
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: /operator console/i })
    ).toBeVisible();
    await expect(page.getByText(/caudals ops console/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open command palette/i })
    ).toBeVisible();

    const moduleCards = page.locator('main a[href^="/admin?module="]');
    await expect(moduleCards).toHaveCount(13);
    for (const title of moduleTitles) {
      await expect(moduleCards.filter({ hasText: title }).first()).toBeVisible();
    }

    await expect(page.getByText(/build detail/i)).toBeVisible();
    for (const gate of ["G-1", "G-2", "G-3", "G-4", "G-5", "G-6", "G-7"]) {
      await expect(page.getByText(gate).first()).toBeVisible();
    }

    await expect(page.getByText(/license composition/i)).toBeVisible();
    await expect(page.getByText(/planner result/i)).toBeVisible();
    await expect(page.getByText(/bulk transition/i)).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: /select all transitionable records/i,
      })
    ).toBeVisible();
    await page
      .getByRole("checkbox", { name: /select work item/i })
      .first()
      .click();
    await expect(page.getByText(/1 selected/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /apply bulk transition/i })
    ).toBeEnabled();
    await expect(page.getByText(/inline state transition/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /apply transition/i }).first()).toBeVisible();
    await expect(page.getByText(/audit overlay/i)).toBeVisible();
    await expect(page.getByText(/marquez-shaped lineage feed/i)).toBeVisible();
    await expect(page.getByText(/state-machine coverage/i)).toBeVisible();

    for (const build of demoBuilds) {
      await expect(page.getByText(build).first()).toBeVisible();
    }

    const hasHorizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > window.innerWidth + 1;
    });

    expect(hasHorizontalOverflow).toBeFalsy();
  });
});
