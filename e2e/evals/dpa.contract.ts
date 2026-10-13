/**
 * UI contracts for the DPA click-through in Settings → General (launch L-30,
 * spec P-42) at 390, 768 and 1440 px, in English and Spanish. Runs against
 * the isolated harness (ui.config.ts); the API is routed per test.
 */
import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [390, 768, 1440] as const;
const ORG = "00000000-0000-4000-8000-000000000001";
const VERSION = "2026-10-11";
const you = { name: "Test operator", email: "operator@example.test" };

function summary() {
  return {
    evaluations: [], systems: [], reports: [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: true },
    usage: { settled: "0", outstanding: "0" },
    preferences: { completion: true, required_input: true, failure: true, email: false },
  };
}
type Acceptance = { id: string; version: string; acceptedAt: string; locale: "en" | "es" | null; current: boolean; signer: { name: string; email: string } | null } | null;
const status = (canAccept: boolean, acceptance: Acceptance) => ({ document: "dpa", currentVersion: VERSION, canAccept, you, acceptance });

/** Routes the API; the DPA endpoint answers from `state` and records every POST. */
async function routeApi(page: Page, state: { canAccept: boolean; acceptance: Acceptance; refuse?: string }) {
  const posted: unknown[] = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/workspace/summary")) return route.fulfill({ json: { data: summary(), meta: {} } });
    if (url.pathname === `/api/evals/v1/workspaces/${ORG}/dpa`) {
      if (route.request().method() === "POST") {
        posted.push(route.request().postDataJSON());
        if (state.refuse) return route.fulfill({ status: state.refuse === "VERSION_CHANGED" ? 409 : 403, json: { error: { code: state.refuse, message: "Refused." } } });
        state.acceptance = { id: "acceptance-1", version: VERSION, acceptedAt: "2026-10-12T10:00:00.000Z", locale: "en", current: true, signer: you };
      }
      return route.fulfill({ json: { data: status(state.canAccept, state.acceptance), meta: {} } });
    }
    return route.fulfill({ json: { data: [], meta: {} } });
  });
  return posted;
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const row = (page: Page) => page.locator("#dpa");

for (const width of WIDTHS) {
  test(`an owner accepts the DPA in one click at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const posted = await routeApi(page, { canAccept: true, acceptance: null });
    await page.goto("/workspace/settings?owner");
    await expect(row(page).getByRole("heading", { name: "Data Processing Agreement" })).toBeVisible();
    await expect(row(page).getByText("Not accepted", { exact: true })).toBeVisible();
    await expect(row(page).getByText(`Version ${VERSION} has not been accepted in the app yet.`)).toBeVisible();
    await expect(row(page).getByRole("link", { name: "Read the DPA" })).toHaveAttribute("href", "https://caudals.com/en/legal/dpa");
    await expect(row(page).getByRole("link", { name: "Download for signature (Word)" })).toHaveAttribute("href", "https://caudals.com/legal/caudals-dpa-en.docx");
    expect(await noHorizontalScroll(page)).toBe(true);
    if (width !== 1440) await row(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l30-dpa-${width}-before.png`, fullPage: width !== 1440 });

    await row(page).getByRole("button", { name: "Review and accept" }).click();
    const dialog = page.getByRole("dialog", { name: "Accept the Data Processing Agreement" });
    await expect(dialog.getByText(`Version ${VERSION}, for Example client.`)).toBeVisible();
    await expect(dialog.getByText("You accept as Test operator (operator@example.test).")).toBeVisible();
    const accept = dialog.getByRole("button", { name: "Accept the DPA" });
    await expect(accept).toBeDisabled();
    expect(await noHorizontalScroll(page)).toBe(true);
    // Let the dialog finish its entrance before the screenshot.
    await expect(dialog).toHaveCSS("opacity", "1");
    await page.waitForTimeout(250);
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l30-dpa-${width}-dialog.png` });
    await dialog.getByLabel("I have read the Data Processing Agreement and I am authorised to accept it on behalf of Example client.").check();
    await accept.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("DPA accepted. The record is in Settings.")).toBeVisible();
    await expect(row(page).getByText("Accepted", { exact: true })).toBeVisible();
    await expect(row(page).getByText(`Version ${VERSION}, accepted by Test operator (operator@example.test) on October 12, 2026.`)).toBeVisible();
    await expect(row(page).getByRole("button", { name: "Review and accept" })).toHaveCount(0);
    expect(posted).toEqual([{ version: VERSION, locale: "en", requestId: expect.any(String) }]);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l30-dpa-${width}-after.png`, fullPage: width !== 1440 });
  });
}

test("members who are not owners see the status but cannot accept", async ({ page }) => {
  await routeApi(page, { canAccept: false, acceptance: null });
  await page.goto("/workspace/settings?editor");
  await expect(row(page).getByText("Not accepted", { exact: true })).toBeVisible();
  await expect(row(page).getByText("An owner of this workspace can accept it.", { exact: false })).toBeVisible();
  await expect(row(page).getByRole("button", { name: "Review and accept" })).toHaveCount(0);
});

test("an older acceptance asks the owner for the new version", async ({ page }) => {
  await routeApi(page, { canAccept: true, acceptance: { id: "old", version: "2026-01-15", acceptedAt: "2026-01-20T09:00:00.000Z", locale: "en", current: false, signer: null } });
  await page.goto("/workspace/settings?owner");
  await expect(row(page).getByText("New version", { exact: true })).toBeVisible();
  await expect(row(page).getByText(`Version 2026-01-15 was accepted on January 20, 2026. Version ${VERSION} is now published.`)).toBeVisible();
  await expect(row(page).getByRole("button", { name: "Review and accept" })).toBeVisible();
});

test("a refused acceptance explains itself inside the dialog", async ({ page }) => {
  const posted = await routeApi(page, { canAccept: true, acceptance: null, refuse: "VERSION_CHANGED" });
  await page.goto("/workspace/settings?owner");
  await row(page).getByRole("button", { name: "Review and accept" }).click();
  const dialog = page.getByRole("dialog", { name: "Accept the Data Processing Agreement" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Accept the DPA" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(/The DPA has just been updated/);
  // A retry from the same dialog reuses its request id, so it can never record twice.
  await dialog.getByRole("button", { name: "Accept the DPA" }).click();
  await expect.poll(() => posted.length).toBe(2);
  expect((posted[0] as { requestId: string }).requestId).toBe((posted[1] as { requestId: string }).requestId);
});

test("the status row keeps the rest of Settings usable when it cannot load", async ({ page }) => {
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/workspace/summary")) return route.fulfill({ json: { data: summary(), meta: {} } });
    if (url.pathname.endsWith("/dpa")) return route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE" } } });
    return route.fulfill({ json: { data: [], meta: {} } });
  });
  await page.goto("/workspace/settings?owner");
  await expect(row(page).getByText("The DPA status could not be loaded.")).toBeVisible();
  await expect(row(page).getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plan and limits" })).toBeVisible();
});

test("the DPA row and dialog read in Spanish", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await page.setViewportSize({ width: 390, height: 900 });
  await routeApi(page, { canAccept: true, acceptance: null });
  await page.goto("/workspace/settings?owner");
  await expect(row(page).getByRole("heading", { name: "Contrato de encargo del tratamiento" })).toBeVisible();
  await expect(row(page).getByText("Sin aceptar", { exact: true })).toBeVisible();
  await expect(row(page).getByRole("link", { name: "Leer el contrato" })).toHaveAttribute("href", "https://caudals.com/es/legal/encargo-de-tratamiento");
  await expect(row(page).getByRole("link", { name: "Descargar para firmar (Word)" })).toHaveAttribute("href", "https://caudals.com/legal/caudals-dpa-es.docx");
  await row(page).getByRole("button", { name: "Revisar y aceptar" }).click();
  const dialog = page.getByRole("dialog", { name: "Aceptar el contrato de encargo del tratamiento" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Aceptar el contrato" }).click();
  await expect(row(page).getByText("Aceptado", { exact: true })).toBeVisible();
  await expect(row(page).getByText(`Versión ${VERSION}, aceptada por Test operator (operator@example.test) el 12 de octubre de 2026.`)).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.screenshot({ path: "/tmp/evals-ui-test-results/l30-dpa-390-es.png", fullPage: true });
});
