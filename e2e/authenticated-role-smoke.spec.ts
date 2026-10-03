import { expect, test } from "@playwright/test";
import { FIXTURE_OPERATOR_EMAIL, signInAsFixtureOperator } from "./helpers/auth";

const AUTH_E2E_ENABLED = process.env.PLAYWRIGHT_AUTH_E2E === "true";

test.describe("authenticated role journeys", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  test.skip(
    !AUTH_E2E_ENABLED,
    "Set PLAYWRIGHT_AUTH_E2E=true to run authenticated fixture-user smoke checks.",
  );

  test("legacy operator cannot access the retired dashboard", async ({ page }) => {
    await signInAsFixtureOperator(page, FIXTURE_OPERATOR_EMAIL);
    const response = await page.goto("/admin", {
      timeout: 180_000,
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /operator console/i })).toHaveCount(0);
  });
});
