/**
 * UI contracts for launch L-22 (spec P-12, P-14, P-15, P-17): workspace Home,
 * Systems as a connection health centre, the faster test-set review (spot
 * check, bulk actions, source-page filter, inline edit, keyboard shortcuts)
 * and navigation (⌘K, breadcrumbs, remembered tabs), at 390, 768 and 1440 px
 * in English and Spanish, with axe on the new screens. Runs against the
 * isolated harness (ui.config.ts); fixtures are synthetic.
 */
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { expectSpanishOnly } from "./spanish-leaks";

const WIDTHS = [390, 768, 1440] as const;
const ORG = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset, 9)).toISOString();

const SYSTEMS = {
  chat: { id: id(201), project_id: id(601), title: "Support chat", target_revision_id: id(211), document: { kind: "website" }, connection_status: "ready", runner_status: null, runner_id: null, error_code: null, connection_checked_at: day(10), connection_ok_at: day(10) },
  api: { id: id(202), project_id: id(602), title: "Claims API", target_revision_id: id(212), document: { kind: "openai_compatible" }, connection_status: "failed", runner_status: null, runner_id: null, error_code: "INVALID_CREDENTIALS", connection_checked_at: day(11), connection_ok_at: day(2) },
  upload: { id: id(203), project_id: id(603), title: "Manual answers", target_revision_id: id(213), document: { kind: "imported_responses" }, connection_status: null, runner_status: null, runner_id: null, error_code: null, connection_checked_at: null, connection_ok_at: null },
  runner: { id: id(204), project_id: id(604), title: "Private assistant", target_revision_id: id(214), document: { kind: "private_runner" }, connection_status: null, runner_status: "pairing_required", runner_id: null, error_code: null, connection_checked_at: null, connection_ok_at: null, runner_seen_at: null },
};
const evaluation = (n: number, title: string, project: number, fields: Record<string, unknown>) => ({
  id: id(n), title, project_id: id(project), project_title: title, project_description: "", latest_source_id: id(900), latest_source_revision_id: id(901), source_ids: [id(900)],
  preparation_status: "ready", reason_code: null, selected_suite_version_id: id(701), selected_target_id: null, commercial_cap: "500", currency: "EUR",
  latest_run_id: null, latest_run_status: null, latest_run_phase: null, latest_run_created_at: null, latest_run_execution_mode: null, latest_run_reason_code: null,
  created_at: day(0), updated_at: day(n % 10), ...fields,
});
const EVALUATIONS = [
  evaluation(501, "Policy FAQ check", 601, { latest_run_id: id(801), latest_run_status: "completed", latest_run_phase: "done" }),
  evaluation(502, "Claims API review", 602, {}),
  evaluation(503, "Refund answers", 603, { preparation_status: "needs_review", selected_suite_version_id: null }),
  evaluation(504, "Onboarding bot", 602, { latest_run_id: id(802), latest_run_status: "failed", latest_run_phase: "target_execution" }),
  evaluation(505, "Pricing questions", 601, { preparation_status: "generating", selected_suite_version_id: null }),
  evaluation(506, "Manual answers October", 603, { latest_run_id: id(803), latest_run_status: "paused", latest_run_phase: "preflight", latest_run_execution_mode: "imported_responses" }),
];
const report = (n: number, rate: number, offset: number) => ({
  id: id(n), title: `Policy FAQ check · run ${n - 300}`, current_revision_id: id(n + 10), evaluation_id: id(501), run_id: id(n + 20), target_id: SYSTEMS.chat.id,
  run_created_at: day(offset), revision_created_at: day(offset), updated_at: day(offset), system_name: "Support chat", review_status: "preliminary", headline_status: "complete",
  strict_pass_rate: rate, n_pass: Math.round(rate * 48), n_scorable: 48, n_eligible: 48,
});
function summary(extra: Record<string, unknown> = {}) {
  return {
    evaluations: EVALUATIONS,
    systems: Object.values(SYSTEMS),
    reports: [report(303, 0.76, 9), report(301, 0.54, 3), report(302, 0.65, 6)],
    entitlement: { plan: "free", max_active_runs: 1, monthly_spend_limit: "0", currency: "EUR", allowed_connection_types: ["website", "openai_compatible", "imported_responses"], can_export: true, can_schedule: true },
    usage: { settled: "0", outstanding: "0" },
    preferences: { completion: true, required_input: true, failure: true, email: false },
    next_run: { id: id(990), evaluation_id: id(501), evaluation_title: "Policy FAQ check", next_due_at: day(20), cadence: "monthly", timezone: "Europe/Madrid" },
    ...extra,
  };
}
const TEST_SETS = [{ suite_id: id(401), title: "Policy FAQ questions", project_id: id(601), project_title: "Policy FAQ check", created_at: day(0), latest_version_id: id(701), frozen_at: day(1), case_count: 48, has_draft: false, version_count: 1, used_by: 1 }];

/** Routes every workspace read the screens make; returns the requests that changed something. */
async function routeWorkspace(page: Page, data: Record<string, unknown> = summary(), handlers: Record<string, (body: unknown, url: URL) => unknown> = {}) {
  const writes: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace("/api/evals/v1", "");
    if (method !== "GET") {
      const body = route.request().postDataJSON();
      writes.push({ path, body });
      const handler = Object.entries(handlers).find(([pattern]) => new RegExp(pattern).test(path))?.[1];
      if (handler) {
        const result = handler(body, url);
        if (result instanceof Response) return route.fulfill({ status: result.status, json: await result.json() });
        return route.fulfill({ json: { data: result, meta: {} } });
      }
      return route.fulfill({ json: { data: {}, meta: {} } });
    }
    if (path === "/workspace/summary") return route.fulfill({ json: { data, meta: {} } });
    if (path === "/suites") return route.fulfill({ json: { data: TEST_SETS, meta: {} } });
    if (path === "/workspace/onboarding") return route.fulfill({ json: { data: { tracked: false, steps: [], exampleHidden: false }, meta: {} } });
    if (/^\/targets\/[^/]+\/credentials$/.test(path)) return route.fulfill({ json: { data: { credentials: [], lastCheck: null }, meta: {} } });
    const handler = Object.entries(handlers).find(([pattern]) => new RegExp(pattern).test(path))?.[1];
    if (handler) return route.fulfill({ json: { data: handler(null, url), meta: {} } });
    return route.fulfill({ json: { data: [], meta: {} } });
  });
  return writes;
}

/** axe-core (a dev dependency already in the tree) on the page; returns violations of the given impacts. */
async function axe(page: Page, selector = "#p-main") {
  // Let entry transitions settle: a dialog still fading in reads as low contrast.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
  await page.waitForTimeout(250);
  await page.addScriptTag({ path: join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  return page.evaluate(async (scope) => {
    const result = await (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }> } }).axe.run(
      { include: [scope] },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } },
    );
    return result.violations.map((item) => `${item.impact} ${item.id}: ${item.nodes.map((node) => node.target.join(" ")).join(", ")}`);
  }, selector);
}

/* ------------------------------------------------------------------ Home --- */

for (const width of WIDTHS) {
  test(`Home shows what needs action, scores with trends, the next run, plan and shortcuts at ${width}px`, async ({ page }) => {
    await routeWorkspace(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/workspace/home?orgId=${ORG}&owner&home`);
    const home = page.getByTestId("workspace-home");
    await expect(home).toBeVisible();
    await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
    const action = page.getByRole("list", { name: "Needs your action" });
    await expect(action.getByRole("listitem")).toHaveCount(4);
    await expect(action).toContainText("Claims API review");
    await expect(action).toContainText("Start the run");
    await expect(action).toContainText("Check the test set and approve it");
    await expect(action).toContainText("See what went wrong and run again");
    await expect(action).toContainText("Upload your system's answers");
    await expect(action).not.toContainText("Pricing questions");
    const scores = page.getByRole("list", { name: "Latest score per system" });
    const chat = scores.getByRole("listitem").filter({ hasText: "Support chat" });
    await expect(chat.getByRole("link", { name: /Latest score of Support chat: 76%/ })).toHaveAttribute("href", new RegExp(`/workspace/reports/${id(303)}`));
    await expect(chat).toContainText("+22 pts");
    await expect(chat).toContainText("Connected");
    await expect(scores.getByRole("listitem").filter({ hasText: "Claims API" })).toContainText("Needs attention");
    await expect(scores.getByRole("listitem").filter({ hasText: "Claims API" })).toContainText("No results yet");
    await expect(page.getByRole("region", { name: "Next scheduled run" })).toContainText("Policy FAQ check");
    await expect(page.getByRole("region", { name: "Plan" })).toContainText("Free");
    await expect(page.getByRole("region", { name: "Plan" })).not.toContainText("credits");
    const shortcuts = page.getByRole("region", { name: "Shortcuts" });
    await expect(shortcuts.getByRole("link", { name: "New evaluation" })).toBeVisible();
    await expect(shortcuts.getByRole("link", { name: "See an example evaluation" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l22-home-${width}.png`, fullPage: true });
  });
}

test("Home's needs-action list is exactly the evaluations list's Needs action filter", async ({ page }) => {
  await routeWorkspace(page);
  await page.goto(`/workspace/evaluations?orgId=${ORG}&owner&filter=action`);
  await expect(page.getByRole("button", { name: /Needs action/ })).toHaveAttribute("aria-pressed", "true");
  const listed = await page.locator("table tbody th").allInnerTexts();
  await page.goto(`/workspace/home?orgId=${ORG}&owner&home`);
  const home = await page.getByRole("list", { name: "Needs your action" }).getByRole("link").allInnerTexts();
  expect(home.sort()).toEqual(listed.map((text) => text.split("\n")[0]).sort());
  expect(home).toHaveLength(4);
});

test("Home in Spanish, the Home nav item only with the flag, and an empty workspace", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await routeWorkspace(page, summary({ evaluations: [], systems: [], reports: [], next_run: null, entitlement: { plan: "managed", max_active_runs: 2, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: false } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/home?orgId=${ORG}&editor&home`);
  await expect(page.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Requieren tu acción" })).toContainText("Aún no hay evaluaciones");
  await expect(page.getByRole("region", { name: "Última puntuación por sistema" })).toContainText("Aún no hay sistemas conectados.");
  await expect(page.getByRole("region", { name: "Próxima ejecución programada" })).toContainText("no incluye ejecuciones programadas");
  await expect(page.getByRole("region", { name: "Plan" })).toContainText("Gestionado");
  await expectSpanishOnly(page, "home");
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = page.getByRole("navigation", { name: /Navegación|Navigation/ });
  await expect(nav.getByRole("link").first()).toHaveText("Inicio");
  await page.goto(`/workspace/evaluations?orgId=${ORG}&editor`);
  await expect(page.getByRole("navigation", { name: /Navegación|Navigation/ }).getByRole("link", { name: "Inicio" })).toHaveCount(0);
  await expectSpanishOnly(page, "evaluations list");
  await page.screenshot({ path: "/tmp/caudals-l22-home-es-empty.png", fullPage: true });
});

test("Home loads under one second at p75 on fixtures", async ({ page }) => {
  await routeWorkspace(page);
  await page.goto(`/workspace/home?orgId=${ORG}&owner&home`);
  await expect(page.getByTestId("workspace-home")).toBeVisible();
  const samples: number[] = [];
  for (let run = 0; run < 8; run++) {
    await page.reload();
    await expect(page.getByRole("list", { name: "Needs your action" })).toBeVisible();
    samples.push(await page.evaluate(() => performance.now()));
  }
  samples.sort((a, b) => a - b);
  const p75 = samples[Math.ceil(samples.length * 0.75) - 1];
  console.log(`Home load p75 ${Math.round(p75)} ms (${samples.map(Math.round).join(", ")})`);
  expect(p75).toBeLessThan(1000);
});

test("Home and Systems are axe-clean", async ({ page }) => {
  await routeWorkspace(page);
  await page.goto(`/workspace/home?orgId=${ORG}&owner&home`);
  await expect(page.getByTestId("workspace-home")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.goto(`/workspace/systems?orgId=${ORG}&owner`);
  await expect(page.getByRole("table", { name: "Systems" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.goto(`/workspace/systems?orgId=${ORG}&owner&system=${SYSTEMS.api.id}`);
  await expect(page.getByRole("dialog", { name: "Claims API" })).toBeVisible();
  expect(await axe(page, ".p-panel")).toEqual([]);
});

/* --------------------------------------------------------------- Systems --- */

for (const width of WIDTHS) {
  test(`Systems shows health, last successful check and last score, with Check now and Fix at ${width}px`, async ({ page }) => {
    const writes = await routeWorkspace(page, summary(), { "/targets/.*/checks": () => ({ id: id(950), status: "ready" }) });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/workspace/systems?orgId=${ORG}&editor`);
    const table = page.getByRole("table", { name: "Systems" });
    await expect(table.getByRole("columnheader", { name: "Last successful check" })).toBeAttached();
    await expect(table.getByRole("columnheader", { name: "Last score" })).toBeAttached();
    const chat = table.getByRole("row").filter({ hasText: "Support chat" });
    await expect(chat).toContainText("Connected");
    await expect(chat.getByRole("link", { name: "76%" })).toHaveAttribute("href", new RegExp(`/workspace/reports/${id(303)}`));
    const api = table.getByRole("row").filter({ hasText: "Claims API" });
    await expect(api).toContainText("Needs attention");
    await expect(api).toContainText("Invalid credentials");
    await expect(api.getByRole("link", { name: /Fix/ })).toHaveAttribute("href", new RegExp(`system=${SYSTEMS.api.id}&fix=1`));
    await expect(table.getByRole("row").filter({ hasText: "Manual answers" })).toContainText("Manual uploads");
    await expect(table.getByRole("row").filter({ hasText: "Manual answers" }).getByRole("button", { name: /Check now/ })).toHaveCount(0);
    await chat.getByRole("button", { name: /Check now/ }).click();
    await expect(page.getByText("Connected. The check passed.")).toBeVisible();
    expect(writes.filter((write) => write.path === `/targets/${SYSTEMS.chat.target_revision_id}/checks`)).toEqual([{ path: `/targets/${SYSTEMS.chat.target_revision_id}/checks`, body: { orgId: ORG } }]);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l22-systems-${width}.png`, fullPage: true });
  });
}

test("Fix opens the system at its key, Check now reports the limit, and viewers only read", async ({ page }) => {
  await routeWorkspace(page, summary(), {
    "/targets/.*/checks": () => new Response(JSON.stringify({ data: null }), { status: 200 }),
  });
  await page.route(`**/api/evals/v1/targets/${SYSTEMS.api.target_revision_id}/checks`, (route) => route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED", message: "Too many connection checks. Try again in 7 min.", request_id: "r", retryable: true } } }));
  await page.goto(`/workspace/systems?orgId=${ORG}&editor&system=${SYSTEMS.api.id}&fix=1`);
  const panel = page.getByRole("dialog", { name: "Claims API" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Last successful check")).toBeVisible();
  await expect(panel.getByRole("region", { name: "Credentials" })).toBeVisible();
  await panel.getByRole("button", { name: /Check now/ }).click();
  await expect(panel.getByRole("alert")).toContainText("Too many checks for now. Too many connection checks. Try again in 7 min.");
  await expect(page.locator(".p-crumbs")).toContainText("Systems");
  await expect(page.locator(".p-crumbs")).toContainText("Claims API");
  await page.goto(`/workspace/systems?orgId=${ORG}&viewer`);
  await expect(page.getByRole("table", { name: "Systems" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Check now/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Fix/ })).toHaveCount(0);
});

test("API errors read in Spanish: a known sentence, an unknown one and a dropped connection (launch L-23b)", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await routeWorkspace(page, summary());
  const answers = [
    { status: 429, json: { error: { code: "RATE_LIMITED", message: "Too many connection checks. Try again in 7 min.", request_id: "r", retryable: true } } },
    { status: 409, json: { error: { code: "VERSION_CONFLICT", message: "A sentence the server added later, without Spanish yet.", request_id: "r", retryable: false } } },
    { status: 409, json: { error: { code: "BRAND_NEW_CODE", message: "Another sentence without Spanish.", request_id: "r", retryable: false } } },
  ];
  let call = 0;
  await page.route(`**/api/evals/v1/targets/${SYSTEMS.api.target_revision_id}/checks`, (route) => {
    const answer = answers[call++];
    return answer ? route.fulfill(answer) : route.abort("internetdisconnected");
  });
  await page.goto(`/workspace/systems?orgId=${ORG}&editor&system=${SYSTEMS.api.id}&fix=1`);
  const panel = page.getByRole("dialog", { name: "Claims API" });
  await expect(panel).toBeVisible();
  // The system's last connection error is a code with its Spanish label.
  await expect(panel).toContainText("Credenciales no válidas");
  const check = panel.getByRole("button", { name: /Comprobar ahora/ });
  await check.click();
  await expect(panel.getByRole("alert")).toContainText("Demasiadas comprobaciones de conexión. Vuelve a intentarlo dentro de 7 min.");
  await check.click();
  await expect(panel.getByRole("alert")).toHaveText("Esto ha cambiado mientras tanto. Vuelve a cargar la página e inténtalo de nuevo.");
  await check.click();
  await expect(panel.getByRole("alert")).toContainText("(código BRAND_NEW_CODE)");
  await check.click();
  await expect(panel.getByRole("alert")).toHaveText("No se ha podido conectar con Caudals. Comprueba tu conexión y vuelve a intentarlo.");
  await expectSpanishOnly(page, "systems API errors");
  await page.screenshot({ path: "/tmp/evals-ui-test-results/spanish/api-errors.png", fullPage: true });
});

test("Systems empty state explains the three connection types with examples (EN and ES)", async ({ page }) => {
  await routeWorkspace(page, summary({ systems: [], evaluations: [], reports: [] }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/systems?orgId=${ORG}&editor`);
  const kinds = page.getByRole("list", { name: "Ways to connect a system" });
  await expect(kinds.getByRole("listitem")).toHaveCount(3);
  await expect(kinds).toContainText("https://example.com/help");
  await expect(kinds).toContainText("https://api.example.com/v1");
  await expect(kinds).toContainText("CSV or XLSX");
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(await axe(page)).toEqual([]);
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await page.reload();
  await expect(page.getByRole("list", { name: "Formas de conectar un sistema" })).toContainText("Chatbot web");
});

/* ------------------------------------------------------------ navigation --- */

test("⌘K reaches systems, reports, test sets and settings tabs; breadcrumbs name the system; tabs are remembered", async ({ page }) => {
  await routeWorkspace(page);
  await page.goto(`/workspace/evaluations?orgId=${ORG}&owner`);
  await expect(page.getByRole("table")).toBeVisible();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Search and jump" });
  await expect(palette.getByRole("option", { name: /Support chat/ })).toBeVisible();
  await expect(palette.getByRole("option", { name: /Policy FAQ check · run 3/ }).first()).toBeVisible();
  await expect(palette.getByRole("option", { name: /Policy FAQ questions/ })).toBeVisible();
  await expect(palette.getByRole("option", { name: /Monitoring/ })).toBeVisible();
  await expect(palette.getByRole("option", { name: /Members/ })).toBeVisible();
  await palette.getByRole("combobox").fill("Claims API");
  await palette.getByRole("option", { name: /^Claims API$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/systems\\?.*system=${SYSTEMS.api.id}`));
  await expect(page.getByRole("dialog", { name: "Claims API" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Search and jump" }).getByRole("combobox").fill("Monitoring");
  await page.getByRole("dialog", { name: "Search and jump" }).getByRole("option", { name: /Monitoring/ }).click();
  await expect(page).toHaveURL(/\/workspace\/settings\?.*tab=monitoring/);
  await expect(page.getByRole("tab", { name: "Monitoring" })).toHaveAttribute("aria-selected", "true");
  // Settings reopens on the last tab this device used.
  await page.goto(`/workspace/settings?orgId=${ORG}&owner`);
  await expect(page).toHaveURL(/tab=monitoring/);
  await expect(page.getByRole("tab", { name: "Monitoring" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Notifications" }).click();
  await page.goto(`/workspace/settings?orgId=${ORG}&owner`);
  await expect(page.getByRole("tab", { name: "Notifications" })).toHaveAttribute("aria-selected", "true");
});

test("an evaluation's breadcrumb names its system and links to it", async ({ page }) => {
  await routeWorkspace(page, summary({ evaluations: [{ ...EVALUATIONS[1], selected_target_id: SYSTEMS.api.id }] }));
  await page.goto(`/workspace/evaluations/${id(502)}?orgId=${ORG}&editor`);
  const crumbs = page.locator(".p-crumbs");
  await expect(crumbs).toContainText("Claims API review");
  await expect(crumbs.getByRole("link", { name: "Claims API" })).toHaveAttribute("href", new RegExp(`/workspace/systems\\?system=${SYSTEMS.api.id}`));
  await page.getByRole("list", { name: "Evaluation progress" }).getByRole("button", { name: /Connect/ }).click();
  await expect(page.getByText("Last successful check")).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage connection" })).toHaveAttribute("href", new RegExp(`/workspace/systems\\?system=${SYSTEMS.api.id}`));
  await expect(page.getByRole("link", { name: /Update the key/ })).toHaveAttribute("href", new RegExp(`system=${SYSTEMS.api.id}&fix=1`));
});

/* --------------------------------------------------------- faster review --- */

const EVAL = id(520), SUITE = id(420), FROZEN = id(721);
const PAGES = ["Refund policy", "Shipping FAQ", "Warranty terms"];
const SEVERITIES = ["low", "medium", "high", "critical"] as const;
/** 14 generated questions over three source pages. */
function draftCases() {
  return Array.from({ length: 14 }, (_, index) => ({
    caseRevisionId: id(1000 + index),
    document: {
      title: `Question ${index + 1}`, severity: SEVERITIES[index % 4], difficulty: index % 3 === 0 ? "advanced" : "routine",
      scenario: { messages: [{ role: "user", content: `What does the ${PAGES[index % 3].toLowerCase()} say about case ${index + 1}?` }] },
      reference: { expected: `Answer ${index + 1}.`, answerability: "answerable", graders: [], required_claims: [], acceptable_alternatives: [] },
      provenance: { evidence_level: "source_supported" },
    },
    excerpts: [{ sourceRevisionId: id(900 + (index % 3)), sourceTitle: PAGES[index % 3], anchor: `a${index}`, excerpt: `Answer ${index + 1}. More text from the page.` }],
  }));
}
async function routeReview(page: Page, plan: string) {
  let cases = draftCases();
  let approved = false;
  const reviewSummary = () => summary({
    evaluations: [evaluation(520, "Returns assistant", 601, { preparation_status: approved ? "ready" : "needs_review", selected_suite_version_id: approved ? FROZEN : null, selected_target_id: SYSTEMS.chat.id })],
    reports: [],
    entitlement: { plan, max_active_runs: 1, monthly_spend_limit: "0", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: false },
  });
  const writes: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace("/api/evals/v1", "");
    const json = (data: unknown) => route.fulfill({ json: { data, meta: {} } });
    if (method !== "GET") writes.push({ path, body: route.request().postDataJSON() });
    if (path === "/workspace/summary") return json(reviewSummary());
    if (path === `/evaluations/${EVAL}/context` && method === "GET") return json({ draft: { suiteId: SUITE, suiteVersionId: id(722), suiteDraftVersion: 3 }, casePreviews: [] });
    if (path === `/suites/${SUITE}/view`) return json({ suite: { id: SUITE, title: "Returns", projectId: id(601), createdAt: day(0) }, draft: { version: 3, caseCount: cases.length }, versions: [], usedBy: [], selected: "draft", cases });
    if (path === `/suites/${SUITE}/cases/remove`) {
      const ids = new Set(route.request().postDataJSON().caseRevisionIds as string[]);
      cases = cases.filter((item) => !ids.has(item.caseRevisionId));
      return json({ suiteId: SUITE, version: 4, removed: ids.size });
    }
    const edit = path.match(new RegExp(`^/suites/${SUITE}/cases/(.+)$`));
    if (edit && method === "POST") {
      const body = route.request().postDataJSON();
      const next = id(2000);
      cases = cases.map((item) => item.caseRevisionId === edit[1] ? { ...item, caseRevisionId: next, document: { ...item.document, scenario: { messages: [{ role: "user", content: body.contents[0] }] }, reference: { ...item.document.reference, expected: body.expected } } } : item);
      return json({ suiteId: SUITE, version: 4, caseRevisionId: next });
    }
    if (path === `/suites/${SUITE}/versions`) return json({ id: FROZEN });
    if (path === `/evaluations/${EVAL}/approve-suite`) { approved = true; return json({ status: "ready" }); }
    if (path === `/evaluations/${EVAL}/start`) return json({ id: id(830), status: "queued" });
    if (path === "/suites") return json(TEST_SETS);
    return json([]);
  });
  return writes;
}

for (const width of WIDTHS) {
  test(`a free workspace spot-checks 10 questions, then approves and runs (attributed) at ${width}px`, async ({ page }) => {
    const writes = await routeReview(page, "free");
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/workspace/evaluations/${EVAL}?orgId=${ORG}&editor`);
    await expect(page.getByRole("heading", { name: "Spot-check 10 questions" })).toBeVisible();
    const list = page.getByRole("list", { name: "Questions to spot-check" });
    await expect(list.getByRole("listitem")).toHaveCount(10);
    await expect(page.getByText("the report is labelled preliminary", { exact: false })).toBeVisible();
    // The sample covers every source page.
    for (const source of PAGES) await expect(list.getByText(source, { exact: false }).first()).toBeVisible();
    const run = page.getByRole("button", { name: "Approve and run (14)" });
    await expect(run).toBeDisabled();
    // Nine by button, the tenth from the keyboard.
    const buttons = list.getByRole("button", { name: /Looks right/ });
    for (let index = 0; index < 9; index++) await buttons.nth(index).click();
    await expect(page.locator(".p-review-stats")).toContainText("9/10");
    await list.getByRole("listitem").nth(9).focus();
    await page.keyboard.press("c");
    await expect(list.getByText("Checked", { exact: true })).toHaveCount(10);
    await expect(run).toBeEnabled();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l22-spotcheck-${width}.png`, fullPage: true });
    await run.click();
    await expect(page.getByRole("button", { name: "Approve and run (14)" })).toHaveCount(0);
    await expect.poll(() => writes.map((write) => write.path)).toEqual([`/suites/${SUITE}/versions`, `/evaluations/${EVAL}/approve-suite`, `/evaluations/${EVAL}/start`]);
    const approval = writes[1].body as { suiteVersionId: string; review: { mode: string; checkedCaseRevisionIds: string[]; approvedCaseRevisionIds: string[] } };
    expect(approval.suiteVersionId).toBe(FROZEN);
    expect(approval.review.mode).toBe("spot_check");
    expect(approval.review.checkedCaseRevisionIds).toHaveLength(10);
    expect(approval.review.approvedCaseRevisionIds).toHaveLength(10);
  });
}

test("the full review: source-page filter, bulk mark and remove, inline edit, shortcuts and axe", async ({ page }) => {
  const writes = await routeReview(page, "payg");
  await page.goto(`/workspace/evaluations/${EVAL}?orgId=${ORG}&editor`);
  await expect(page.getByRole("heading", { name: "Spot-check 10 questions" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Review all 14 questions" }).click();
  await expect(page.getByRole("heading", { name: "Review the test set" })).toBeVisible();
  // Source page filter.
  await page.getByLabel("Source page").selectOption("Shipping FAQ");
  const list = page.locator(".p-review-list > li");
  await expect(list).toHaveCount(5);
  // Bulk: select the five shown, mark two as checked by keyboard-free bulk, remove the rest.
  await page.getByRole("checkbox", { name: /Select the 5 shown/ }).check();
  await expect(page.getByText("5 selected")).toBeVisible();
  await page.getByRole("button", { name: "Mark as checked" }).click();
  await expect(page.locator(".p-review-list").getByText("Checked", { exact: true })).toHaveCount(5);
  await page.getByRole("checkbox", { name: "Select question 2" }).check();
  await page.getByRole("checkbox", { name: "Select question 5" }).check();
  await page.getByRole("button", { name: "Remove selected" }).click();
  const confirm = page.getByRole("dialog", { name: "Remove 2 questions?" });
  await confirm.getByRole("button", { name: "Remove selected" }).click();
  await expect(list).toHaveCount(3);
  expect(writes.find((write) => write.path === `/suites/${SUITE}/cases/remove`)?.body).toEqual({ orgId: ORG, caseRevisionIds: [id(1001), id(1004)] });
  // Inline edit.
  await page.getByLabel("Source page").selectOption("all");
  const first = page.locator(".p-review-list > li").first();
  await first.getByRole("button", { name: /^Edit/ }).click();
  await first.getByLabel("Reference answer").fill("Within 30 days of delivery.");
  await first.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Within 30 days of delivery.")).toBeVisible();
  expect(writes.find((write) => write.path === `/suites/${SUITE}/cases/${id(1000)}`)?.body).toMatchObject({ orgId: ORG, expected: "Within 30 days of delivery." });
  // Shortcuts are listed and documented.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("?");
  const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(shortcuts).toContainText("Next question");
  await expect(shortcuts).toContainText("Mark the question as right, or undo");
  expect(await axe(page, ".p-modal")).toEqual([]);
  await page.keyboard.press("Escape");
  // Full review approval is recorded as such, with the questions checked.
  await page.getByRole("button", { name: "Approve without running" }).click();
  await expect.poll(() => writes.some((write) => write.path === `/evaluations/${EVAL}/approve-suite`)).toBe(true);
  const approval = writes.find((write) => write.path === `/evaluations/${EVAL}/approve-suite`)!.body as { review: { mode: string; checkedCaseRevisionIds: string[] } };
  expect(approval.review.mode).toBe("full");
  expect(approval.review.checkedCaseRevisionIds).toEqual(expect.arrayContaining([id(2000), id(1007), id(1010), id(1013)]));
  expect(writes.some((write) => write.path === `/evaluations/${EVAL}/start`)).toBe(false);
});

test("a managed workspace keeps the full review and approves without a spot check (Spanish)", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  const writes = await routeReview(page, "managed");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/evaluations/${EVAL}?orgId=${ORG}&editor`);
  await expect(page.locator(".p-review-title")).toBeVisible();
  await expect(page.getByRole("button", { name: /Aprobar y ejecutar/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Volver a la comprobación/ })).toHaveCount(0);
  await expect(page.locator(".p-review-list > li")).toHaveCount(14);
  await expectSpanishOnly(page, "evaluation page, test set review");
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.locator(".p-review-bar button").last().click();
  await expect.poll(() => writes.some((write) => write.path === `/evaluations/${EVAL}/approve-suite`)).toBe(true);
  expect((writes.find((write) => write.path === `/evaluations/${EVAL}/approve-suite`)!.body as { review: { mode: string } }).review.mode).toBe("full");
});
