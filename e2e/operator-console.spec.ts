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
  "Labeling",
  "Quality",
  "Privacy & Rights",
  "Catalogue & Offers",
  "Commercials",
  "Operations",
  "Escalations",
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

async function deleteStaleCrudSmokeRows(page: import("@playwright/test").Page) {
  const staleRows = page.locator("[data-work-queue-row]").filter({
    hasText: /Operator CRUD smoke \d+/,
  });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const staleCount = await staleRows.count();
    if (staleCount === 0) {
      return;
    }

    page.once("dialog", (dialog) => dialog.accept());
    await staleRows
      .first()
      .getByRole("button", { name: /delete record/i })
      .click();
    await expect(staleRows).toHaveCount(staleCount - 1, { timeout: 10_000 });
  }

  await expect(staleRows).toHaveCount(0);
}

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
    await expect(moduleCards).toHaveCount(15);
    for (const title of moduleTitles) {
      await expect(moduleCards.filter({ hasText: title }).first()).toBeVisible();
    }

    await expect(page.getByText(/build detail/i)).toBeVisible();
    for (const gate of ["G-1", "G-2", "G-3", "G-4", "G-5", "G-6", "G-7"]) {
      await expect(page.getByText(gate).first()).toBeVisible();
    }

    await expect(page.getByText(/license composition/i)).toBeVisible();
    await expect(page.getByText(/planner result/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /all \(/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /my blockers/i })).toBeVisible();
    await expect(page.getByText("Create record", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /create alert/i })).toBeVisible();
    await expect(page.getByText("Bulk transition", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: /select all transitionable records/i,
      })
    ).toBeVisible();
    await page
      .locator('button[role="checkbox"][aria-label="Select work item"]:not([disabled])')
      .first()
      .click();
    await expect(page.getByText(/1 selected/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /apply bulk transition/i })
    ).toBeEnabled();
    await expect(page.getByText(/inline state transition/i).first()).toBeVisible();
    await expect(page.getByText(/one-key transition shortcut/i).first()).toBeVisible();
    await expect(page.getByText(/operator notes/i).first()).toBeVisible();
    await expect(page.getByText(/inline record edit/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /save record/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /apply transition/i }).first()).toBeVisible();
    await expect(page.getByText(/audit overlay/i)).toBeVisible();
    await expect(page.getByText(/marquez-shaped lineage feed/i)).toBeVisible();
    await expect(page.getByText(/state-machine coverage/i)).toBeVisible();

    await deleteStaleCrudSmokeRows(page);

    for (const build of demoBuilds) {
      await expect(page.getByText(build).first()).toBeVisible();
    }

    const hasHorizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > window.innerWidth + 1;
    });

    expect(hasHorizontalOverflow).toBeFalsy();

    const crudTitle = `Operator CRUD smoke ${Date.now()}`;
    const updatedCrudTitle = `${crudTitle} updated`;
    await page.getByLabel(/alert title/i).first().fill(crudTitle);
    await page
      .getByLabel(/escalation note/i)
      .first()
      .fill("Playwright-created alert; safe to delete.");
    await page.getByRole("button", { name: /create alert/i }).click();
    await expect(page.getByText(/record created and audit event recorded/i)).toBeVisible();

    const crudRow = page.locator("[data-work-queue-row]").filter({
      hasText: crudTitle,
    });
    await expect(crudRow).toBeVisible();
    const crudTitleInput = crudRow.getByLabel(/alert title/i);
    await crudTitleInput.fill(updatedCrudTitle);
    await expect(crudTitleInput).toHaveValue(updatedCrudTitle);
    await crudRow.getByRole("button", { name: /save record/i }).click();
    await expect(page.getByText(/record updated and audit event recorded/i)).toBeVisible();
    await expect(
      page.locator("[data-work-queue-row]").filter({ hasText: updatedCrudTitle })
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator("[data-work-queue-row]")
      .filter({ hasText: updatedCrudTitle })
      .getByRole("button", { name: /delete record/i })
      .click();
    await expect(
      page.locator("[data-work-queue-row]").filter({ hasText: updatedCrudTitle })
    ).toHaveCount(0);

    await page.goto("/admin?module=settings", {
      timeout: 180_000,
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/production db jit elevation/i)).toBeVisible();
    await expect(page.getByText(/runtime status/i)).toBeVisible();
    await expect(page.getByText(/target operator/i)).toBeVisible();
    await expect(page.getByText(/ed25519 delivery signing keys/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /generate key/i })).toBeVisible();
  });
});
