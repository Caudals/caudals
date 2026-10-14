/**
 * UI contracts for bring your own provider key (launch L-27, spec v2 §6.11):
 * Settings → AI models for an owner (connect, choose the model, replace,
 * remove), the free plan and editors, the key-failure notice on a run, at
 * 390, 768 and 1440 px, in English and Spanish, with axe. The typed key never
 * stays on the page. Runs against the isolated harness; the API is routed.
 */
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [390, 768, 1440] as const;
const ORG = "00000000-0000-4000-8000-000000000001";
const KEY_ID = "00000000-0000-4000-8000-000000000a01";
const EVALUATION = "00000000-0000-4000-8000-000000000a02";
const RUN = "00000000-0000-4000-8000-000000000a03";
// A synthetic key-shaped string, never a real credential.
const TYPED_KEY = `sk-or-v1-${"7f".repeat(32)}`;
const axePath = join(process.cwd(), "node_modules/axe-core/axe.min.js");
const ROLES = ["context_analyzer", "generator", "judge", "report_writer"] as const;

type Connection = { id: string; provider: string; label: string; state: string; checkedAt: string; models: string[]; createdAt: string; rotatedAt: string | null; revokedAt: string | null };
type Route = { role: string; connectionId: string; provider: string; modelId: string; webResearch: boolean; updatedAt: string };
type State = { available: boolean; plan: string; connections: Connection[]; routes: Route[]; byok: boolean };
const connection = (state = "valid"): Connection => ({ id: KEY_ID, provider: "openrouter", label: "OpenRouter", state, checkedAt: "2026-10-14T09:00:00.000Z",
  models: ["anthropic/claude-sonnet-5-5", "openai/gpt-6-luna"], createdAt: "2026-10-14T09:00:00.000Z", rotatedAt: null, revokedAt: null });
const view = (s: State) => ({ available: s.available, plan: s.plan, roles: ROLES, connections: s.connections, routes: s.routes,
  providers: [["openai", "OpenAI"], ["anthropic", "Anthropic"], ["google", "Google Gemini"], ["mistral", "Mistral"], ["openrouter", "OpenRouter"]].map(([id, label]) => ({ id, label })) });
function summary(plan: string) {
  return {
    evaluations: [], systems: [], reports: [],
    entitlement: { plan, max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: true },
    usage: { settled: "0", outstanding: "0" },
    preferences: { completion: true, required_input: true, failure: true, email: false },
  };
}

async function routeApi(page: Page, initial: Partial<State> = {}) {
  const state: State = { available: true, plan: "payg", connections: [], routes: [], byok: true, ...initial };
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/evals/v1", "");
    const method = route.request().method();
    const body = method === "GET" ? null : route.request().postDataJSON();
    calls.push({ method, path, body });
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: status === 200 ? { data, meta: {} } : data });
    if (path === "/workspace/summary") return json(summary(state.plan));
    if (path === "/engine/byok") {
      if (!state.byok) return json({ error: { code: "SCOPE_DENIED", message: "Not found." } }, 404);
      if (method === "POST") state.connections = [connection()];
      return json(view(state));
    }
    if (path === `/engine/byok/${KEY_ID}`) {
      if (method === "DELETE") { state.connections = state.connections.map((item) => ({ ...item, revokedAt: "2026-10-14T10:00:00.000Z" })); state.routes = []; }
      if (method === "PATCH") state.connections = [{ ...connection(), rotatedAt: "2026-10-14T10:00:00.000Z" }];
      return json({ ...view(state), routesRemoved: 4 });
    }
    if (path === "/engine/byok/routes") {
      if (method === "PUT") {
        const input = body as { modelId: string; roles: string[] };
        state.routes = input.roles.map((role) => ({ role, connectionId: KEY_ID, provider: "openrouter", modelId: input.modelId, webResearch: false, updatedAt: "2026-10-14T09:05:00.000Z" }));
      } else state.routes = state.routes.filter((item) => item.role !== url.searchParams.get("role"));
      return json(view(state));
    }
    return json([]);
  });
  return { state, calls };
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
async function axe(page: Page, selector: string) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async (target) => {
    type Axe = { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }> }> };
    const result = await (window as unknown as { axe: Axe }).axe.run({ include: [target] }, { resultTypes: ["violations"] });
    return result.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(" ")).join(", ")}`);
  }, selector);
  expect(violations, `axe on ${selector}`).toEqual([]);
}
const settle = async (page: Page) => { await page.waitForTimeout(250); };

for (const width of WIDTHS) {
  test(`an owner connects a key and runs the tasks on it at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { calls } = await routeApi(page);
    await page.goto(`/workspace/settings?owner&orgId=${ORG}&tab=models`);
    await expect(page.getByRole("tab", { name: "AI models" })).toHaveAttribute("aria-selected", "true");
    const settings = page.getByTestId("byok-settings");
    await expect(settings.getByRole("heading", { name: "Your own model keys" })).toBeVisible();
    await expect(settings.getByText("No key connected. This workspace uses Caudals' models, charged in credits.")).toBeVisible();
    await expect(settings.getByText(/Caudals charges no token credits for them\. Per-question and page fees still apply\./)).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await axe(page, "[data-testid=byok-settings]");
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l27-byok-${width}-empty.png`, fullPage: true });

    await settings.getByTestId("byok-connect").click();
    const dialog = page.getByRole("dialog", { name: "Connect your provider key" });
    await expect(dialog.getByText(/a free call that lists your models/)).toBeVisible();
    await dialog.getByLabel("Provider").selectOption("openrouter");
    const field = dialog.getByLabel("API key");
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveAttribute("autocomplete", "off");
    await field.fill(TYPED_KEY);
    await settle(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l27-byok-${width}-connect.png` });
    await dialog.getByTestId("byok-key-save").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Key checked and saved.")).toBeVisible();
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ orgId: ORG, provider: "openrouter", apiKey: TYPED_KEY });
    const row = settings.getByTestId("byok-key-openrouter");
    await expect(row.getByText("OpenRouter")).toBeVisible();
    await expect(row.getByText("Working")).toBeVisible();
    // Once sent, the key is nowhere on the page.
    expect(await page.content()).not.toContain(TYPED_KEY.slice(-16));

    await settings.getByTestId("byok-use-all").click();
    const routeDialog = page.getByRole("dialog", { name: "Run tasks on your key" });
    await routeDialog.getByRole("radio", { name: "openai/gpt-6-luna" }).check();
    for (const label of ["Read the material", "Draft tests", "Grade answers", "Write report takeaways"]) await expect(routeDialog.getByRole("checkbox", { name: label })).toBeChecked();
    await settle(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l27-byok-${width}-route.png` });
    await routeDialog.getByTestId("byok-route-save").click();
    await expect(routeDialog).toBeHidden();
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ orgId: ORG, connectionId: KEY_ID, modelId: "openai/gpt-6-luna", roles: [...ROLES] });
    await expect(settings.getByTestId("byok-role-judge").getByText("openai/gpt-6-luna")).toBeVisible();
    await expect(settings.getByTestId("byok-role-judge").getByText("Your key · OpenRouter")).toBeVisible();
    // One task back to Caudals' model.
    await settings.getByTestId("byok-role-judge").getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Use Caudals' model" }).click();
    await expect(settings.getByTestId("byok-role-judge").getByText("Caudals' model · charged in credits")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    // The tables fit their column: nothing scrolls sideways inside them.
    expect(await settings.evaluate((element) => [...element.querySelectorAll(".p-table-wrap")].every((wrap) => wrap.scrollWidth <= wrap.clientWidth + 1))).toBe(true);
    await axe(page, "[data-testid=byok-settings]");
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l27-byok-${width}-routed.png`, fullPage: true });
  });
}

test("a failing key says so; the owner replaces or removes it", async ({ page }) => {
  const { calls } = await routeApi(page, { connections: [connection("quota_exceeded")], routes: [{ role: "judge", connectionId: KEY_ID, provider: "openrouter", modelId: "openai/gpt-6-luna", webResearch: false, updatedAt: "2026-10-14T09:05:00.000Z" }] });
  await page.goto(`/workspace/settings?owner&orgId=${ORG}&tab=models`);
  const settings = page.getByTestId("byok-settings");
  await expect(settings.getByText("Out of quota")).toBeVisible();
  await expect(settings.getByText(/Your provider reports no credit left on this key/)).toBeVisible();

  await settings.getByTestId("byok-key-openrouter").getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Replace key" }).click();
  const replace = page.getByRole("dialog", { name: "Replace your OpenRouter key" });
  await replace.getByLabel("API key").fill(TYPED_KEY);
  await replace.getByTestId("byok-key-save").click();
  await expect(page.getByText("Key replaced.")).toBeVisible();
  expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ orgId: ORG, apiKey: TYPED_KEY });

  await settings.getByTestId("byok-key-openrouter").getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Remove key" }).click();
  const remove = page.getByRole("dialog", { name: "Remove your OpenRouter key?" });
  await expect(remove.getByText(/Tasks that used it go back to Caudals' models, charged in credits\./)).toBeVisible();
  await remove.getByTestId("byok-remove-confirm").click();
  await expect(page.getByText("Key removed. This workspace uses Caudals' models again.")).toBeVisible();
  await expect(settings.getByText("No key connected. This workspace uses Caudals' models, charged in credits.")).toBeVisible();
  expect(calls.some((call) => call.method === "DELETE" && call.path === `/engine/byok/${KEY_ID}`)).toBe(true);
});

test("a rejected key is explained in the person's language and the field is cleared", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await routeApi(page);
  await page.route("**/api/evals/v1/engine/byok", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 422, json: { error: { code: "BYOK_KEY_REJECTED", message: "OpenRouter rejected this key. Check that it is complete and active, then try again." } } })
    : route.fallback());
  await page.goto(`/workspace/settings?owner&orgId=${ORG}&tab=models`);
  await page.getByTestId("byok-connect").click();
  const dialog = page.getByRole("dialog", { name: "Conecta la clave de tu proveedor" });
  await dialog.getByLabel("Clave de API").fill(TYPED_KEY);
  await dialog.getByTestId("byok-key-save").click();
  await expect(dialog.getByText("Tu proveedor ha rechazado esta clave. Comprueba que está completa y activa y vuelve a intentarlo.")).toBeVisible();
  await expect(dialog.getByLabel("Clave de API")).toHaveValue("");
  expect(await page.content()).not.toContain(TYPED_KEY.slice(-16));
});

test("free workspaces see why keys are not available; editors do not see the tab", async ({ page }) => {
  await routeApi(page, { available: false, plan: "free" });
  await page.goto(`/workspace/settings?owner&orgId=${ORG}&tab=models`);
  const settings = page.getByTestId("byok-settings");
  await expect(settings.getByText("Your own model keys are available on pay as you go and managed plans.")).toBeVisible();
  await expect(settings.getByTestId("byok-connect")).toHaveCount(0);

  const editor = await page.context().newPage();
  await routeApi(editor, { byok: false });
  await editor.goto(`/workspace/settings?editor&orgId=${ORG}`);
  await expect(editor.getByRole("tab", { name: "General" })).toBeVisible();
  await expect(editor.getByRole("tab", { name: "AI models" })).toHaveCount(0);
});

test("Settings → AI models reads in Spanish", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await routeApi(page, { connections: [connection("invalid")], routes: [{ role: "judge", connectionId: KEY_ID, provider: "openrouter", modelId: "openai/gpt-6-luna", webResearch: false, updatedAt: "2026-10-14T09:05:00.000Z" }] });
    await page.goto(`/workspace/settings?owner&orgId=${ORG}&tab=models`);
    await expect(page.getByRole("tab", { name: "Modelos de IA" })).toHaveAttribute("aria-selected", "true");
    const settings = page.getByTestId("byok-settings");
    await expect(settings.getByRole("heading", { name: "Tus propias claves de modelo" })).toBeVisible();
    await expect(settings.getByText("Rechazada por tu proveedor")).toBeVisible();
    await expect(settings.getByText(/Tu proveedor ha rechazado esta clave\. Sustitúyela para continuar\./)).toBeVisible();
    await expect(settings.getByTestId("byok-role-judge").getByText("Tu clave · OpenRouter")).toBeVisible();
    await expect(settings.getByTestId("byok-role-generator").getByText("Modelo de Caudals · se cobra en créditos")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l27-byok-es-${width}.png`, fullPage: true });
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

/* --------------------------------------------- the failure on a run --- */

async function routeRun(page: Page) {
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/evals/v1", "");
    const json = (data: unknown) => route.fulfill({ json: { data, meta: {} } });
    if (path === "/workspace/summary") return json({ ...summary("payg"), evaluations: [{ id: EVALUATION, title: "Claims assistant review", project_id: "00000000-0000-4000-8000-000000000a04", project_title: "Claims", project_description: "",
      latest_source_id: null, latest_source_revision_id: null, preparation_status: "ready", reason_code: null, selected_suite_version_id: "00000000-0000-4000-8000-000000000a05",
      selected_target_id: "00000000-0000-4000-8000-000000000a06", commercial_cap: "500", currency: "EUR", latest_run_id: RUN, latest_run_status: "completed", latest_run_phase: "grading", created_at: new Date().toISOString() }],
      systems: [{ id: "00000000-0000-4000-8000-000000000a06", project_id: "00000000-0000-4000-8000-000000000a04", title: "Claims chat", target_revision_id: "00000000-0000-4000-8000-000000000a07",
        document: { kind: "openai_compatible" }, connection_status: "connected", runner_status: null, runner_id: null, error_code: null }] });
    if (path === `/runs/${RUN}`) return json({ run: { id: RUN, status: "completed", phase: "grading", execution_mode: "deployed_system", suite_version_id: "00000000-0000-4000-8000-000000000a05", created_at: new Date().toISOString(), reason_code: null },
      units: Array.from({ length: 4 }, (_, index) => ({ id: `u${index}`, status: "succeeded" })), targetUsage: { calls: 4, unknown: 0 },
      grading: { queued: 4, done: 0, total: 4, blocked: "customer_key_quota" } });
    if (path === `/evaluations/${EVALUATION}/control`) return json({ subject: { kind: "run", id: RUN, status: "completed", phase: "grading", updatedAt: new Date().toISOString() }, restart: null, actions: [] });
    return json([]);
  });
}

for (const [locale, title, fix] of [["en", "Your provider key failed: quota exceeded", "Fix the key"], ["es", "Ha fallado la clave de tu proveedor: cuota superada", "Corregir la clave"]] as const) {
  test(`a run waiting on a failed key shows why, with a fix link (${locale})`, async ({ page }) => {
    if (locale === "es") await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await routeRun(page);
      await page.goto(`/workspace/evaluations/${EVALUATION}?owner&orgId=${ORG}`);
      await expect(page.getByText(title)).toBeVisible();
      await expect(page.getByTestId("customer-key-fix")).toHaveText(fix);
      await expect(page.getByTestId("customer-key-fix")).toHaveAttribute("href", `/workspace/settings?tab=models&orgId=${ORG}`);
      expect(await noHorizontalScroll(page)).toBe(true);
      await page.screenshot({ path: `/tmp/evals-ui-test-results/l27-key-failed-${locale}-${width}.png`, fullPage: true });
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });
}
