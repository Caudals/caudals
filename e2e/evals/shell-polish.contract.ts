import { test, expect, type Page } from "@playwright/test";

/**
 * UI review R1 (2026-10-15): the shell, lists and evaluation page at phone
 * width — one-line breadcrumbs, stacked list rows with their menu in reach,
 * a readable session-expired banner, a closable navigation drawer — and the
 * cancelled run's way forward.
 */
const orgId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000601";
const systemId = "00000000-0000-4000-8000-000000000801";
const runId = "00000000-0000-4000-8000-000000000901";
const evaluation = {
  id: "00000000-0000-4000-8000-000000000501", title: "Claims assistant review", project_id: projectId,
  project_title: "Claims", project_description: "", latest_source_id: null, latest_source_revision_id: null,
  preparation_status: "ready", reason_code: null, selected_suite_version_id: "00000000-0000-4000-8000-000000000701",
  commercial_cap: "500", currency: "EUR", latest_run_id: null as string | null, latest_run_status: null as string | null, latest_run_phase: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
const system = {
  id: systemId, project_id: projectId, title: "Claims assistant on the customer portal (production)", target_revision_id: "00000000-0000-4000-8000-000000000802",
  document: { kind: "openai_compatible" }, connection_status: "connected", runner_status: null, error_code: null,
};
function summary(evaluations: unknown[]) {
  return {
    evaluations, systems: [system], reports: [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["openai_compatible"], can_export: true, can_schedule: true },
    usage: { settled: "0", outstanding: "0" },
    preferences: { completion: true, required_input: true, failure: true, email: false },
  };
}
async function serve(page: Page, evaluations: unknown[], extra: (path: string) => unknown = () => undefined) {
  await page.route("**/api/evals/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/workspace/summary") ? summary(evaluations) : extra(path) ?? [];
    await route.fulfill({ json: { data, meta: {} } });
  });
}
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("phones: list rows stack with the row menu in reach, and no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serve(page, [evaluation]);
  await page.goto(`/workspace/evaluations?orgId=${orgId}&editor`);
  const menu = page.getByRole("button", { name: "More actions: Claims assistant review" });
  await expect(menu).toBeInViewport({ ratio: 1 });
  // The title and its menu share the first line of the row.
  const [title, trigger] = await Promise.all([page.getByRole("rowheader").first().boundingBox(), menu.boundingBox()]);
  const middle = trigger!.y + trigger!.height / 2;
  expect(middle).toBeGreaterThan(title!.y);
  expect(middle).toBeLessThan(title!.y + title!.height);
  expect(await page.locator(".p-table-wrap").evaluate((wrap) => wrap.scrollWidth <= wrap.clientWidth)).toBe(true);
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: "/tmp/evals-r1-evaluations-390.png", fullPage: true });

  await page.goto(`/workspace/systems?orgId=${orgId}&editor`);
  await expect(page.getByRole("button", { name: `Actions: ${system.title}` })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: /^Check now/ })).toBeInViewport({ ratio: 1 });
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: "/tmp/evals-r1-systems-390.png", fullPage: true });

  // Desktop keeps the table with its column headers.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("columnheader", { name: "Last successful check" })).toBeVisible();
});

for (const width of [390, 768])
  test(`breadcrumbs stay on one line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await serve(page, [{ ...evaluation, selected_target_id: systemId }]);
    await page.goto(`/workspace/evaluations/${evaluation.id}?orgId=${orgId}&editor`);
    await expect(page.getByRole("heading", { level: 1, name: evaluation.title })).toBeVisible();
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByText(evaluation.title)).toBeVisible();
    // Every visible crumb is a single line inside the 48px bar.
    const heights = await crumbs.locator("li").evaluateAll((items) => items.filter((item) => item.getBoundingClientRect().width > 0).map((item) => item.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(1);
    for (const height of heights) expect(height).toBeLessThanOrEqual(22);
    if (width === 390) await expect(crumbs.getByRole("link", { name: "Evaluations", exact: true })).toBeHidden();
    await page.screenshot({ path: `/tmp/evals-r1-crumbs-${width}.png` });
    expect(await noSideScroll(page)).toBe(true);
  });

test("phones: the session-expired banner keeps its sentence readable and the drawer closes from a button", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serve(page, [evaluation]);
  await page.goto(`/workspace/evaluations?orgId=${orgId}&editor`);
  await page.evaluate(() => window.dispatchEvent(new Event("caudals:session-expired")));
  const banner = page.getByRole("alert").filter({ hasText: "Your session has expired" });
  await expect(banner).toBeVisible();
  const text = await banner.locator(".p-status-text").boundingBox();
  expect(text!.width).toBeGreaterThan(200);
  await expect(banner.getByRole("link", { name: "Sign in again" })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "/tmp/evals-r1-expired-390.png" });

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Close navigation" }).click();
  await expect(drawer).toBeHidden();
});

test("a cancelled run offers Run again, and a one-question re-run reads in the singular", async ({ page }) => {
  const starts: string[] = [];
  await serve(page, [{ ...evaluation, latest_run_id: runId, latest_run_status: "canceled" }], (path) => {
    if (path.endsWith(`/runs/${runId}`)) return { run: { id: runId, status: "canceled", phase: "target_execution", execution_mode: "deployed_system", suite_version_id: evaluation.selected_suite_version_id, created_at: new Date().toISOString(), reason_code: null }, units: [{ id: "a", status: "canceled" }], targetUsage: { calls: 0, unknown: 0 } };
    if (path.endsWith(`/evaluations/${evaluation.id}/start`)) { starts.push(path); return { runId }; }
    if (path.endsWith("/suites")) return [{ suite_version_id: evaluation.selected_suite_version_id, case_count: 1 }];
    return undefined;
  });
  await page.goto(`/workspace/evaluations/${evaluation.id}?orgId=${orgId}&editor&rerun=1`);
  const confirm = page.getByRole("dialog", { name: "Run the test set again?" });
  await expect(confirm.getByText("This re-runs the 1 question of the approved test set", { exact: false })).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Run cancelled" })).toBeVisible();
  await page.getByRole("button", { name: "Run again" }).click();
  await expect.poll(() => starts.length).toBe(1);
});
