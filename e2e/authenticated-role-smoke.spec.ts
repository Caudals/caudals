import { expect, test } from "@playwright/test";
import {
  FIXTURE_BUYER_EMAIL,
  FIXTURE_OPERATOR_EMAIL,
  FIXTURE_SUPPLIER_EMAIL,
  signInAsFixtureBuyer,
  signInAsFixtureOperator,
  signInAsFixtureSupplier,
} from "./helpers/auth";

const AUTH_E2E_ENABLED = process.env.PLAYWRIGHT_AUTH_E2E === "true";

test.describe("authenticated role journeys", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  test.skip(
    !AUTH_E2E_ENABLED,
    "Set PLAYWRIGHT_AUTH_E2E=true to run authenticated fixture-user smoke checks.",
  );

  test("admin can access the operator console", async ({ page }) => {
    await signInAsFixtureOperator(page, FIXTURE_OPERATOR_EMAIL);
    await page.goto("/admin", {
      timeout: 180_000,
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", {
        name: /operator console/i,
      }),
    ).toBeVisible();
  });

  test("buyer can access the read-only delivery workspace", async ({ page }) => {
    await signInAsFixtureBuyer(page, FIXTURE_BUYER_EMAIL);
    await page.goto("/buyer", {
      timeout: 180_000,
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", {
        name: /buyer workspace/i,
      }),
    ).toBeVisible();
    await expect(page.getByText(/iberian retail/i).first()).toBeVisible();
    await expect(page.getByText(/qa scorecard/i)).toBeVisible();
    await expect(page.getByText(/subscription operations/i)).toBeVisible();
    await expect(page.getByText(/delivery integrations/i)).toBeVisible();
    await expect(page.getByText(/billing/i).first()).toBeVisible();
    await expect(page.getByText(/sha256:fixture-delta-manifest/i)).toBeVisible();
  });

  test("supplier can access the managed supplier portal", async ({ page }) => {
    await signInAsFixtureSupplier(page, FIXTURE_SUPPLIER_EMAIL);
    await page.goto("/supplier", {
      timeout: 180_000,
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", {
        name: /supplier portal/i,
      }),
    ).toBeVisible();
    await expect(page.getByText(/med data coop/i).first()).toBeVisible();
    await expect(
      page.getByText(/iberian receipt and ticket corpus/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/build participation/i)).toBeVisible();
  });
});
