import { expect, test } from "@playwright/test";
import {
  FIXTURE_OPERATOR_EMAIL,
  signInAsFixtureOperator,
} from "./helpers/auth";

const AUTH_E2E_ENABLED = process.env.PLAYWRIGHT_AUTH_E2E === "true";

test.describe("authenticated role journeys", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !AUTH_E2E_ENABLED,
    "Set PLAYWRIGHT_AUTH_E2E=true to run authenticated fixture-user smoke checks.",
  );

  test("admin can access the operator console", async ({ page }) => {
    await signInAsFixtureOperator(page, FIXTURE_OPERATOR_EMAIL);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", {
        name: /operator console/i,
      }),
    ).toBeVisible();
  });
});
