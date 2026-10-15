/**
 * UI contracts for the example evaluation (launch L-33): the in-app read-only
 * example, its entry points and the public sample report, at 390, 768 and
 * 1440 px. Runs against the isolated harness (ui.config.ts).
 */
import { expect, test, type Page } from "@playwright/test";

const LINE_EN = "Synthetic data about a fictitious company. It shows what a reviewed report looks like; no real expert reviewed it.";
const LINE_ES = "Datos sintéticos sobre una empresa ficticia. Muestra cómo es un informe revisado; ningún experto real lo ha revisado.";
const WIDTHS = [390, 768, 1440] as const;

function summary(evaluations: unknown[] = []) {
  return {
    evaluations, systems: [], reports: [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: true },
    usage: { settled: "0", outstanding: "0" },
    preferences: { completion: true, required_input: true, failure: true, email: false },
  };
}
const evaluation = {
  id: "00000000-0000-4000-8000-000000000501", title: "Claims assistant review", project_id: "00000000-0000-4000-8000-000000000601",
  project_title: "Claims", project_description: "", latest_source_id: null, latest_source_revision_id: null,
  preparation_status: "ready", reason_code: null, selected_suite_version_id: null,
  commercial_cap: "500", currency: "EUR", latest_run_id: null, latest_run_status: null, latest_run_phase: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

/** Records every API call; the example page must make none of its own. */
async function routeApi(page: Page, evaluations: unknown[] = []) {
  const calls: string[] = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(`${route.request().method()} ${url.pathname}`);
    await route.fulfill({ json: { data: url.pathname.endsWith("/workspace/summary") ? summary(evaluations) : [], meta: {} } });
  });
  return calls;
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const width of WIDTHS) {
  test(`example evaluation at ${width}px is labelled, read-only and fits the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await routeApi(page);
    await page.goto("/workspace/example?owner");
    await expect(page.getByRole("heading", { level: 1, name: "Hogarel home-policy assistant" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: LINE_EN })).toBeVisible();
    await expect(page.locator(".p-head-meta").getByText("Example", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Three monthly runs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Compared with September 2026" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", "/sample-report/caudals-sample-report-en.pdf");
    // Nothing that would change it: no run, share, schedule, rename or delete control.
    await expect(page.getByRole("button", { name: /run|share|schedule|rename|delete|publish|regrade/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /share|run again/i })).toHaveCount(0);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.getByRole("tab", { name: /Test results/ }).click();
    await expect(page.getByRole("status").filter({ hasText: LINE_EN })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l33-example-${width}.png`, fullPage: width !== 1440 });
    // The shell reads its own state; the example itself never writes or addresses the API.
    expect(calls.filter((call) => !call.startsWith("GET ") || call.includes("example"))).toEqual([]);
  });

  test(`public sample report at ${width}px is labelled at both ends and fits the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/sample-report?locale=en");
    const labels = page.locator(".sr-label");
    await expect(labels).toHaveCount(2);
    await expect(labels.first()).toContainText("Example");
    await expect(labels.first()).toContainText(LINE_EN);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("What a finished evaluation looks like");
    await expect(page.getByRole("link", { name: "Download the PDF" })).toHaveAttribute("href", "/sample-report/caudals-sample-report-en.pdf");
    await expect(page.locator("details.sr-result")).toHaveCount(48);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.locator("details.sr-result").first().locator("summary").click();
    await expect(page.locator("details.sr-result").first().getByText("The assistant's answer")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l33-sample-${width}.png`, fullPage: width !== 1440 });
  });
}

test("a changed question in the comparison opens that result", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeApi(page);
  await page.goto("/workspace/example?owner");
  await page.getByRole("list", { name: "Questions that changed" }).getByRole("button", { name: "Jewellery kept outside a safe" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /I keep my jewellery in a drawer/ })).toBeVisible();
  await expect(page).toHaveURL(/result=example-2026-10-assessment-c10/);
  await expect(page.getByRole("status").filter({ hasText: LINE_EN })).toBeVisible();
});

test("owners hide the example for the whole workspace and show it again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeApi(page, [evaluation]);
  // The choice lives in the workspace's onboarding state (launch L-06), not on the device.
  let exampleHidden = false;
  const changes: unknown[] = [];
  await page.route("**/api/evals/v1/workspace/onboarding**", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      changes.push(body);
      exampleHidden = body.action === "hide_example";
    }
    await route.fulfill({ json: { data: { enabled: false, tracked: false, dismissed: false, complete: false, firstEvaluationId: null, steps: { connect: false, sources: false, run: false, results: false, invite: false }, welcome: { pending: false, systemType: null, goal: null }, exampleHidden }, meta: {} } });
  });
  await page.goto("/workspace/evaluations?owner");
  const card = page.locator(".p-card").filter({ hasText: "Example evaluation" });
  await expect(card.getByRole("link", { name: "See an example evaluation" })).toBeVisible();
  // Never counted with the workspace's own evaluations.
  await expect(page.getByRole("button", { name: /All\s*1/ })).toBeVisible();
  await card.getByRole("button", { name: "Hide example" }).click();
  await expect(card).toHaveCount(0);
  await page.goto("/workspace/settings?owner");
  const row = page.locator(".p-setting").filter({ hasText: "Example evaluation" });
  await expect(row.getByText("Hidden", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Show in lists" }).click();
  await expect(row.getByText("Shown", { exact: true })).toBeVisible();
  await page.goto("/workspace/evaluations?owner");
  await expect(page.locator(".p-card").filter({ hasText: "Example evaluation" })).toBeVisible();
  const orgId = "00000000-0000-4000-8000-000000000001";
  expect(changes).toEqual([{ orgId, action: "hide_example" }, { orgId, action: "show_example" }]);
  expect(await page.evaluate(() => window.localStorage.getItem("caudals.example-hidden"))).toBeNull();
});

test("viewers reach the example from the empty state and cannot hide it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await routeApi(page);
  await page.goto("/workspace/evaluations?viewer=1");
  await expect(page.getByRole("heading", { name: "Run your first evaluation" })).toBeVisible();
  await page.getByRole("link", { name: "See an example evaluation" }).click();
  await expect(page).toHaveURL(/\/workspace\/example/);
  await expect(page.getByRole("heading", { level: 1, name: "Hogarel home-policy assistant" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide example" })).toHaveCount(0);
});

test("owners see the example beside the first-evaluation action", async ({ page }) => {
  await routeApi(page);
  await page.goto("/workspace/evaluations?owner");
  await expect(page.getByRole("link", { name: "New evaluation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See an example evaluation" })).toBeVisible();
});

test("no entry point is shown while the example is off", async ({ page }) => {
  await routeApi(page, [evaluation]);
  await page.goto("/workspace/evaluations?owner&no-example");
  await expect(page.getByRole("link", { name: "Claims assistant review" })).toBeVisible();
  await expect(page.getByText("Example evaluation")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See an example evaluation" })).toHaveCount(0);
});

test("the example and the sample report are in Spanish for Spanish readers", async ({ page }) => {
  await routeApi(page);
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await page.goto("/workspace/example?owner");
  await expect(page.getByRole("heading", { level: 1, name: "Asistente de pólizas de hogar de Hogarel" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: LINE_ES })).toBeVisible();
  await expect(page.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", "/sample-report/caudals-informe-de-ejemplo-es.pdf");
  await page.goto("/sample-report?locale=es");
  await expect(page.locator(".sr-label").first()).toContainText("Ejemplo");
  await expect(page.locator(".sr-label").first()).toContainText(LINE_ES);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Así es una evaluación terminada");
});

test("evidence links on the sample report point at numbered results", async ({ page }) => {
  await page.goto("/sample-report?locale=en");
  // The inline script that opens a linked result runs on the server-rendered page (checked in production).
  const href = await page.locator(".sr-refs a").first().getAttribute("href");
  expect(href).toMatch(/^#t\d+$/);
  await expect(page.locator(href!)).toHaveCount(1);
});

/* ------------------------------------------------ every empty state (G1) --- */

// L-06 acceptance: the example evaluation is reachable from every empty state, not only the evaluations list.
const EMPTY_STATES = [
  { path: "/workspace/evaluations", title: "Run your first evaluation" },
  { path: "/workspace/systems", title: "No connected systems yet" },
  { path: "/workspace/test-sets", title: "No frozen test sets" },
  { path: "/workspace/reports", title: "No published reports yet" },
] as const;
const onboardingState = (exampleHidden: boolean) => ({ data: { enabled: false, tracked: false, dismissed: false, complete: false, firstEvaluationId: null, steps: { connect: false, sources: false, run: false, results: false, invite: false }, welcome: { pending: false, systemType: null, goal: null }, exampleHidden }, meta: {} });

for (const width of WIDTHS) {
  test(`every empty state opens the example at ${width}px, for owners and viewers`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await routeApi(page);
    for (const role of ["owner", "viewer=1"]) {
      for (const { path, title } of EMPTY_STATES) {
        await page.goto(`${path}?${role}`);
        const empty = page.locator(".p-empty").filter({ has: page.getByRole("heading", { name: title }) });
        await expect(empty.getByRole("link", { name: "See an example evaluation" }), `${path} as ${role}`).toHaveAttribute("href", /\/workspace\/example/);
        expect(await noHorizontalScroll(page), `${path} at ${width}px`).toBe(true);
        if (role === "owner" && width === 390) await page.screenshot({ path: `/tmp/caudals-g1-empty${path.replaceAll("/", "-")}-${width}.png`, fullPage: true });
      }
    }
  });
}

test("the reports empty state leads to the example", async ({ page }) => {
  await routeApi(page);
  await page.goto("/workspace/reports?viewer=1");
  await page.locator(".p-empty").getByRole("link", { name: "See an example evaluation" }).click();
  await expect(page).toHaveURL(/\/workspace\/example/);
  await expect(page.getByRole("heading", { level: 1, name: "Hogarel home-policy assistant" })).toBeVisible();
});

test("empty states keep systems' own action for writers and give viewers the example instead", async ({ page }) => {
  await routeApi(page);
  await page.goto("/workspace/systems?owner");
  const empty = page.locator(".p-empty");
  await expect(empty.getByRole("link", { name: "Connect a system" })).toBeVisible();
  await expect(empty.getByRole("link", { name: "See an example evaluation" })).toBeVisible();
  await page.goto("/workspace/systems?viewer=1");
  await expect(empty.getByRole("link", { name: "Connect a system" })).toHaveCount(0);
  await expect(empty.locator(".p-empty-action").getByRole("link", { name: "See an example evaluation" })).toBeVisible();
});

test("empty states respect the workspace's hidden example and the switched-off example", async ({ page }) => {
  await routeApi(page);
  await page.route("**/api/evals/v1/workspace/onboarding**", (route) => route.fulfill({ json: onboardingState(true) }));
  for (const { path, title } of EMPTY_STATES) {
    await page.goto(`${path}?owner`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: "See an example evaluation" }), path).toHaveCount(0);
    // No empty action box is left behind.
    if (path !== "/workspace/evaluations" && path !== "/workspace/systems") await expect(page.locator(".p-empty-action")).toHaveCount(0);
  }
  await page.unroute("**/api/evals/v1/workspace/onboarding**");
  for (const { path, title } of EMPTY_STATES) {
    await page.goto(`${path}?owner&no-example`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: "See an example evaluation" }), path).toHaveCount(0);
  }
});

test("empty states link the example in Spanish", async ({ page }) => {
  await routeApi(page);
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  for (const path of ["/workspace/systems", "/workspace/test-sets", "/workspace/reports"]) {
    await page.goto(`${path}?owner`);
    await expect(page.locator(".p-empty").getByRole("link", { name: "Ver una evaluación de ejemplo" }), path).toBeVisible();
  }
});
