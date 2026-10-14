import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { evaluationId, id, order, reportId, routeBilling, widths, workspaceSummary } from "./billing-fixtures";

/**
 * Launch L-15 UI contracts: Settings → Billing and usage (every tab), the
 * sidebar plan-and-balance pill, Plan and limits, the low-balance banner, the
 * run estimate dialog with its gate, the paused-for-credits state with the
 * one-step top-up, the balance updating without a reload, billing notices,
 * roles (owner, editor, viewer), English and Spanish, 390/768/1440 px and axe.
 * The harness renders the client components only: the server's role checks
 * and gating are tested in tests/billing/billing-ui-db.test.ts. The fixtures
 * are in billing-fixtures.ts.
 */
const axePath = join(process.cwd(), "node_modules/axe-core/axe.min.js");

async function noHorizontalScroll(page: Page) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

/**
 * axe-core on one region: no serious or critical violation. `exclude` leaves
 * out pre-existing parts that are not L-15's (the run pipeline's upcoming
 * stages, tracked for L-24).
 */
async function axe(page: Page, selector: string, exclude: string[] = []) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async ([target, skip]) => {
    type Axe = { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }> }> };
    const result = await (window as unknown as { axe: Axe }).axe.run({ include: [target], exclude: skip.map(item => [item]) }, { resultTypes: ["violations"] });
    return result.violations.filter(item => item.impact === "serious" || item.impact === "critical").map(item => `${item.id}: ${item.nodes.map(node => node.target.join(" ")).join(", ")}`);
  }, [selector, exclude] as [string, string[]]);
  expect(violations, `axe on ${selector}`).toEqual([]);
}

/* ------------------------------------------------------- settings: owner --- */

test("billing: the owner's overview, plan-and-balance pill and Plan and limits", async ({ page }) => {
  await routeBilling(page);
  await page.goto(`/workspace/settings?owner&billing&orgId=${id}&tab=billing`);
  await expect(page.getByTestId("workspace-billing")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Billing and usage" })).toHaveAttribute("aria-selected", "true");
  for (const name of ["Overview", "Top up", "Usage", "Billing details", "Limits and alerts"]) await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Invoices" })).toHaveCount(0);
  await expect(page.getByTestId("billing-available")).toHaveText("1,820");
  await expect(page.getByText("≈ €18.20 excl. VAT")).toBeVisible();
  await expect(page.getByTestId("billing-used")).toHaveText("412.50");
  await expect(page.getByText("Of a 5,000-credit monthly limit")).toBeVisible();
  await expect(page.getByText("Pay as you go", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/On: below 500 credits we buy 5,150 credits/)).toBeVisible();
  await expect(page.getByText("This month’s free credits (1,000 left) expire on 1 Nov 2026.")).toBeVisible();
  const pill = page.getByTestId("billing-pill").first();
  await expect(pill).toContainText("Pay as you go · 1,820 credits");
  await expect(pill).toHaveAttribute("href", /\/workspace\/settings\?tab=billing/);
  await expect(page.getByTestId("low-balance-banner")).toHaveCount(0);
  await noHorizontalScroll(page);
  await axe(page, "#p-main");
  // Settings → General: Plan and limits replaces the machine spend; nobody edits it here.
  await page.getByRole("tab", { name: "General" }).click();
  await expect(page.getByRole("heading", { name: "Plan and limits" })).toBeVisible();
  await expect(page.getByText("Spend this month", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Up to 10 AI systems")).toBeVisible();
  await expect(page.getByText("No monthly run limit")).toBeVisible();
  await expect(page.locator("#plan-and-limits").getByText("1,820")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
});

test("billing: top up with the VAT preview, auto-recharge settings and the saved card", async ({ page }) => {
  const { calls } = await routeBilling(page);
  await page.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>Stripe Checkout</title><h1>Test mode checkout</h1>" }));
  await page.goto(`/workspace/settings?owner&billing&orgId=${id}&tab=billing&view=top-up`);
  await expect(page.getByRole("heading", { name: "Choose a pack" })).toBeVisible();
  await expect(page.getByText("Total €60.50")).toBeVisible();
  await expect(page.getByText("+150 bonus credits")).toBeVisible();
  await expect(page.getByText("Visa ending 4242. Auto-recharge uses this card.")).toBeVisible();
  await page.getByLabel("When the balance falls below (credits)").fill("800");
  await page.getByRole("button", { name: "Save auto-recharge" }).click();
  await expect.poll(() => calls.recharge.length).toBe(1);
  expect(calls.recharge[0]).toMatchObject({ orgId: id, enabled: true, thresholdCredits: 800, pack: "eur_50", monthlyMaxCount: 3, monthlyMaxEuros: 300 });
  await noHorizontalScroll(page);
  await axe(page, "#p-main");
  await page.getByRole("radio", { name: /^5,000 credits/ }).check();
  await page.getByRole("checkbox", { name: /I accept the Terms of Service/ }).check();
  await page.getByTestId("billing-pay").click();
  await page.waitForURL("https://checkout.stripe.com/c/pay/cs_test_l15");
  expect(calls.topUps[0]).toMatchObject({ orgId: id, pack: "eur_50", acceptTerms: true });
});

test("billing: usage by day, by run and by model, with CSV and account activity", async ({ page }) => {
  await routeBilling(page);
  await page.goto(`/workspace/settings?owner&billing&orgId=${id}&tab=billing&view=usage`);
  await expect(page.getByTestId("usage-total")).toHaveText("412.50");
  await expect(page.getByRole("img", { name: /Credits used by day: 412.50; 9 Oct 280.25\./ })).toBeVisible();
  const runs = page.getByRole("region", { name: "By evaluation and run" });
  await expect(runs.getByRole("link", { name: "Claims assistant review" }).first()).toHaveAttribute("href", new RegExp(`/workspace/reports/${reportId}`));
  await expect(runs.getByText("400.25")).toBeVisible();
  await expect(runs.getByText("Preparing tests")).toBeVisible();
  const items = page.getByRole("region", { name: "By model and meter" });
  await expect(items.getByText("Website chat questions")).toBeVisible();
  await expect(items.getByText("412,000 tokens")).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", new RegExp(`/api/evals/v1/billing/usage\\?orgId=${id}&from=\\d{4}-\\d\\d-01&to=\\d{4}-\\d\\d-\\d\\d&format=csv`));
  const activity = page.getByRole("region", { name: "Account activity" });
  await expect(activity.getByText("Purchase")).toBeVisible();
  await expect(activity.getByText("+2,000")).toBeVisible();
  await noHorizontalScroll(page);
  await axe(page, "#p-main");
});

test("billing: limits and alerts save both caps with an Idempotency-Key", async ({ page }) => {
  const { calls } = await routeBilling(page);
  await page.goto(`/workspace/settings?owner&billing&orgId=${id}&tab=billing&view=limits`);
  await expect(page.getByLabel("Monthly limit (credits)")).toHaveValue("5000");
  await expect(page.getByText("owner@acme.example")).toBeVisible();
  await expect(page.getByText(/We alert you when the balance falls below 500 credits/)).toBeVisible();
  await page.getByLabel("Monthly limit (credits)").fill("8000");
  await page.getByLabel("Limit", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect.poll(() => calls.caps.length).toBe(1);
  expect(calls.caps[0].body).toEqual({ orgId: id, monthlyCapCredits: 8000, perRun: { mode: "multiplier", multiplier: 3 } });
  expect(calls.caps[0].key).toMatch(/^[0-9a-f-]{36}$/);
  await noHorizontalScroll(page);
  await axe(page, "#p-main");
});

test("billing: billing details with the tax treatment, and invoices once invoicing answers", async ({ page }) => {
  await routeBilling(page, { invoices: true });
  await page.goto(`/workspace/settings?owner&billing&orgId=${id}&tab=billing&view=details`);
  await expect(page.getByText("Acme Software SL")).toBeVisible();
  await expect(page.getByText("Spanish VAT (IVA) at 21 % is added to the price.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage payment methods" })).toBeVisible();
  await page.getByRole("tab", { name: "Invoices" }).click();
  await expect(page.getByText("CAU-2026-0001")).toBeVisible();
  await expect(page.getByRole("link", { name: "PDF" })).toHaveAttribute("href", `/api/evals/v1/billing/invoices/00000000-0000-4000-8000-000000000909/pdf?orgId=${id}`);
  await noHorizontalScroll(page);
  await axe(page, "#p-main");
});

/* -------------------------------------------------------------- roles --- */

test("billing: editors see the balance and usage only; viewers see no billing", async ({ page }) => {
  const { calls } = await routeBilling(page, { role: "editor" });
  await page.goto(`/workspace/settings?editor&billing&orgId=${id}&tab=billing`);
  await expect(page.getByTestId("billing-available")).toHaveText("1,820");
  await expect(page.getByRole("tab", { name: "Usage", exact: true })).toBeVisible();
  for (const name of ["Top up", "Billing details", "Limits and alerts", "Invoices"]) await expect(page.getByRole("tab", { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add credits" })).toHaveCount(0);
  await expect(page.getByText("Only workspace owners can buy credits or change limits.")).toBeVisible();
  await page.getByRole("tab", { name: "Usage", exact: true }).click();
  await expect(page.getByRole("region", { name: "Account activity" })).toHaveCount(0);
  expect(calls.summaries).toBeGreaterThan(0);

  const viewer = await routeBilling(page, { role: "editor" });
  await page.goto(`/workspace/settings?viewer&billing&orgId=${id}`);
  await expect(page.getByRole("heading", { name: "Plan and limits" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Billing and usage" })).toHaveCount(0);
  await expect(page.getByTestId("billing-pill")).toHaveCount(0);
  // The viewer's browser never even asks.
  expect(viewer.calls.summaries).toBe(0);
});

test("billing: nothing shows where billing is off for the workspace", async ({ page }) => {
  await page.route("**/api/evals/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/billing/summary")) return route.fulfill({ status: 404, json: { error: { code: "SCOPE_DENIED" } } });
    if (path.endsWith("/workspace/summary")) return route.fulfill({ json: { data: workspaceSummary({ plan: "free" }), meta: {} } });
    return route.fulfill({ json: { data: [], meta: {} } });
  });
  await page.goto(`/workspace/settings?owner&billing&orgId=${id}`);
  await expect(page.getByRole("heading", { name: "Plan and limits" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Billing and usage" })).toHaveCount(0);
  await expect(page.getByTestId("billing-pill")).toHaveCount(0);
  await expect(page.locator("#plan-and-limits")).not.toContainText("credits available");
});

/* ------------------------------------------------------------ Spanish --- */

test("billing: Facturación y uso in Spanish at 390 and 1440 px", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await routeBilling(page);
  await page.goto(`/workspace/settings?owner&billing&orgId=${id}&tab=billing`);
  await expect(page.getByRole("tab", { name: "Facturación y uso" })).toBeVisible();
  await expect(page.getByTestId("billing-available")).toHaveText("1820");
  await expect(page.getByText("≈ 18,20 € sin IVA")).toBeVisible();
  await expect(page.getByTestId("billing-pill").first()).toContainText("Pago por uso · 1820 créditos");
  for (const view of ["usage", "limits", "top-up"]) {
    await page.goto(`/workspace/settings?owner&billing&orgId=${id}&tab=billing&view=${view}`);
    await expect(page.getByTestId("workspace-billing")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await expect(page.getByRole("heading", { name: "Elige un paquete" })).toBeVisible();
  await axe(page, "#p-main");
});

/* ----------------------------------------------------- banner, notices --- */

test("billing: the low-balance banner and billing notices", async ({ page }) => {
  await routeBilling(page, { available: 120 });
  await page.route("**/api/evals/v1/notifications?**", route => route.fulfill({ json: { data: { notifications: [
    { id: "00000000-0000-4000-8000-000000000910", kind: "low_balance", category: "billing", created_at: new Date().toISOString(), read: false, payload: { balance: 120, threshold: 500 } },
    { id: "00000000-0000-4000-8000-000000000911", kind: "cap_reached", category: "billing", created_at: new Date().toISOString(), read: false, payload: { scope: "monthly", percent: 80, cap: 5000 } },
  ], unread: 2, nextCursor: null }, meta: {} } }));
  await page.goto(`/workspace/evaluations?owner&billing&orgId=${id}`);
  const banner = page.getByTestId("low-balance-banner");
  await expect(banner).toContainText("Your balance is low: 120 credits left.");
  await expect(banner.getByRole("link", { name: "Add credits" })).toHaveAttribute("href", /tab=billing&view=top-up/);
  await expect(page.getByTestId("billing-pill").first()).toHaveAttribute("data-tone", "warn");
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole("button", { name: /Notifications/ }).first().click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Low balance")).toBeVisible();
  await expect(panel.getByText("120 credits left (alert below 500)")).toBeVisible();
  await expect(panel.getByText("80 % of the 5,000-credit monthly limit")).toBeVisible();
  await expect(panel.getByRole("link", { name: /Low balance/ })).toHaveAttribute("href", /tab=billing&view=top-up/);
});

/* ---------------------------------------------------- estimate dialog --- */

test("run estimate: credits p50–p90 with euros, balance, hold, time, models; starts the run", async ({ page }) => {
  const { calls } = await routeBilling(page);
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  const dialog = page.getByRole("dialog", { name: "Start this run?" });
  await expect(dialog.getByTestId("estimate-range")).toHaveText("About 270–340 credits (≈ €2.70–€3.40).");
  await expect(dialog.getByTestId("estimate-balance")).toHaveText("You have 1,820.");
  await expect(dialog.getByText("You’re only charged for completed work. Unused holds are released.")).toBeVisible();
  await expect(dialog.getByText("While it runs, up to 2 credits are held at a time for the call in progress.")).toBeVisible();
  await expect(dialog.getByText("50 questions")).toBeVisible();
  await expect(dialog.getByText("Website chat")).toBeVisible();
  await expect(dialog.getByText("About 43 min–1 h 3 min")).toBeVisible();
  await expect(dialog.getByTestId("estimate-models")).toContainText("Caudals Local (DeepSeek V4 Flash on the DGX) · 50 · 200 credits per 1M tokens (in · out)");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await axe(page, "[role=dialog]");
  await dialog.getByTestId("estimate-start").click();
  await expect(dialog).toBeHidden();
  expect(calls.started).toBe(1);
});

test("run estimate: blocks below p90 with Add X credits and opens the one-step top-up", async ({ page }) => {
  const { calls } = await routeBilling(page, { available: 120, estimate: { balance: { billingMode: "credits", requiresCredits: true, availableCredits: "120", coversP90: false, addCredits: "220" },
    gate: { enforced: true, autoRechargeCovers: false, autoRechargePackCredits: null, canStart: false } } });
  await page.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test mode checkout</h1>" }));
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  const dialog = page.getByRole("dialog", { name: "Start this run?" });
  await expect(dialog.getByText("Add 220 credits to start this run.")).toBeVisible();
  await expect(dialog.getByTestId("estimate-start")).toHaveCount(0);
  await axe(page, "[role=dialog]");
  await dialog.getByTestId("estimate-add-credits").click();
  const topUp = page.getByRole("dialog", { name: "Buy credits" });
  await expect(topUp.getByText("This run needs 220 more credits.")).toBeVisible();
  // The smallest pack that covers the gap is chosen.
  await expect(topUp.getByRole("radio", { name: /^2,000 credits/ })).toBeChecked();
  await noHorizontalScroll(page);
  await axe(page, "[role=dialog]");
  await topUp.getByRole("checkbox", { name: /I accept the Terms of Service/ }).check();
  await topUp.getByTestId("billing-pay").click();
  await page.waitForURL("https://checkout.stripe.com/c/pay/cs_test_l15");
  expect(calls.topUps[0]).toMatchObject({ pack: "eur_20" });
  expect(calls.started).toBe(0);
});

test("run estimate: auto-recharge covers the gap; contract workspaces have no gate; editors ask an owner", async ({ page }) => {
  await routeBilling(page, { available: 120, estimate: { balance: { billingMode: "credits", requiresCredits: true, availableCredits: "120", coversP90: false, addCredits: "220" },
    gate: { enforced: true, autoRechargeCovers: true, autoRechargePackCredits: 5150, canStart: true } } });
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  let dialog = page.getByRole("dialog", { name: "Start this run?" });
  await expect(dialog.getByText(/Auto-recharge adds 5,150 credits when it runs low/)).toBeVisible();
  await expect(dialog.getByTestId("estimate-start")).toBeEnabled();

  await page.unrouteAll();
  await routeBilling(page, { billingMode: "contract", plan: "managed", estimate: { balance: { billingMode: "contract", requiresCredits: false, availableCredits: "0", coversP90: true, addCredits: null }, gate: { enforced: false, autoRechargeCovers: false, autoRechargePackCredits: null, canStart: true } } });
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  dialog = page.getByRole("dialog", { name: "Start this run?" });
  await expect(dialog.getByText("Runs in this workspace are covered by your agreement with Caudals: no credits are used.")).toBeVisible();
  await expect(dialog.getByTestId("estimate-range")).toHaveCount(0);
  await expect(dialog.getByTestId("estimate-start")).toBeEnabled();

  await page.unrouteAll();
  await routeBilling(page, { role: "editor", available: 120, estimate: { balance: { billingMode: "credits", requiresCredits: true, availableCredits: "120", coversP90: false, addCredits: "220" },
    gate: { enforced: true, autoRechargeCovers: false, autoRechargePackCredits: null, canStart: false } } });
  await page.goto(`/workspace/evaluations/${evaluationId}?editor&billing&orgId=${id}`);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  dialog = page.getByRole("dialog", { name: "Start this run?" });
  await expect(dialog.getByText(/Add 220 credits to start this run\. Ask a workspace owner to add credits\./)).toBeVisible();
  await expect(dialog.getByTestId("estimate-start")).toBeDisabled();
  await expect(dialog.getByTestId("estimate-add-credits")).toHaveCount(0);
});

test("run estimate: Spanish copy at 390 px", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await routeBilling(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await page.getByRole("button", { name: "Ejecutar evaluación" }).click();
  const dialog = page.getByRole("dialog", { name: "¿Iniciar esta ejecución?" });
  await expect(dialog.getByTestId("estimate-range")).toHaveText("Unos 270–340 créditos (≈ 2,70 €–3,40 €).");
  await expect(dialog.getByTestId("estimate-balance")).toHaveText("Tienes 1820.");
  await expect(dialog.getByText("Solo pagas por el trabajo completado. Las reservas no usadas se liberan.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await axe(page, "[role=dialog]");
});

/* ------------------------------------------- paused for credits, live --- */

test("paused for credits: one-step top-up and resume; the balance updates without a reload", async ({ page }) => {
  const { calls, state } = await routeBilling(page, { available: 0, runStatus: "paused", runReason: "credits_exhausted" });
  await page.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test mode checkout</h1>" }));
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${id}`);
  await expect(page.getByRole("heading", { name: "Paused — add credits to continue" })).toBeVisible();
  await expect(page.getByText("Add credits and the run continues by itself.", { exact: false })).toBeVisible();
  await expect(page.getByTestId("paused-balance")).toContainText("0");
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await noHorizontalScroll(page);
  await axe(page, "#p-main", [".p-pipeline"]);
  // The balance arrives (a purchase in another tab, auto-recharge): no reload needed.
  state.available = 2400;
  await page.evaluate(() => window.dispatchEvent(new Event("caudals:billing-changed")));
  await expect(page.getByTestId("paused-balance")).toContainText("2,400");
  await expect(page.getByTestId("billing-pill").first()).toContainText("2,400 credits");
  await page.getByTestId("paused-add-credits").click();
  const topUp = page.getByRole("dialog", { name: "Buy credits" });
  await expect(topUp.getByRole("radio", { name: /^2,000 credits/ })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect.poll(() => calls.resumes).toBeGreaterThan(0);
});

test("top-up return: paid order refreshes the shell's balance and offers the way back", async ({ page }) => {
  const { state } = await routeBilling(page, { available: 0 });
  let polls = 0;
  await page.route(`**/api/evals/v1/billing/top-ups/${order}**`, route => {
    polls++;
    if (polls >= 2) state.available = 2000;
    return route.fulfill({ json: { data: { id: order, status: polls < 2 ? "pending" : "paid", netCents: 2000, vatCents: 420, grossCents: 2420, credits: 2000, bonusCredits: 0, bonusKind: null, taxMention: null }, meta: {} } });
  });
  await page.addInitScript(([key, value]) => { window.sessionStorage.setItem(key, value); }, [`caudals.topup.return.${order}`, `/workspace/evaluations/${evaluationId}?orgId=${id}`]);
  await page.goto(`/workspace/billing/top-ups/${order}?owner&billing&checkout=success`);
  await expect(page.getByText("Payment received. 2,000 credits were added to your workspace.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("top-up-balance")).toContainText("2,000");
  await expect(page.getByTestId("billing-pill").first()).toContainText("2,000 credits");
  await expect(page.getByRole("link", { name: "Back to where you were" })).toHaveAttribute("href", `/workspace/evaluations/${evaluationId}?orgId=${id}`);
  await expect(page.getByText("Runs paused for credits continue on their own.")).toBeVisible();
});
