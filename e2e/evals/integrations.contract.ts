import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * Launch L-19 UI contracts (spec v2 P-25, P-27, P-28, §5.2 "Settings ·
 * Monitoring and Developers"), with INTEGRATIONS_V2_ENABLED (`integrations`
 * in the harness): CI tokens with short expiries, the destination picker
 * (Slack, Teams, email, signed webhook) with Send test and delete, release
 * gate thresholds per test set and per schedule, and the API reference's CI
 * trigger, gate and GitHub Actions example. Flag off: today's screens.
 * English and Spanish, 390/768/1440 px, no horizontal scroll, axe. The server
 * side is in tests/evals/integrations-v2-db.test.ts.
 */
const org = "00000000-0000-4000-8000-000000000001";
const evaluationId = "00000000-0000-4000-8000-000000000d01";
const suiteId = "00000000-0000-4000-8000-000000000d02";
const suiteVersionId = "00000000-0000-4000-8000-000000000d03";
const systemRevision = "00000000-0000-4000-8000-000000000d04";
const scheduleId = "00000000-0000-4000-8000-000000000d05";
const slackId = "00000000-0000-4000-8000-000000000d06";
const emailId = "00000000-0000-4000-8000-000000000d07";
const webhookId = "00000000-0000-4000-8000-000000000d08";
const widths = [390, 768, 1440] as const;
const axePath = join(process.cwd(), "node_modules/axe-core/axe.min.js");
const CREATED = "2026-10-08T10:00:00.000Z";

async function noHorizontalScroll(page: Page) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function axe(page: Page, selector: string) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async (target) => {
    type Axe = { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }> }> };
    const result = await (window as unknown as { axe: Axe }).axe.run({ include: [target] }, { resultTypes: ["violations"] });
    return result.violations.filter(item => item.impact === "serious" || item.impact === "critical").map(item => `${item.id}: ${item.nodes.map(node => node.target.join(" ")).join(", ")}`);
  }, selector);
  expect(violations, `axe on ${selector}`).toEqual([]);
}
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });

const summary = {
  evaluations: [{ id: evaluationId, title: "Claims assistant review", project_id: "00000000-0000-4000-8000-000000000d10", project_title: "Claims", project_description: "",
    latest_source_id: null, latest_source_revision_id: null, preparation_status: "ready", reason_code: null, selected_suite_version_id: suiteVersionId,
    selected_target_id: "00000000-0000-4000-8000-000000000d11", commercial_cap: "10", currency: "EUR", latest_run_id: null, latest_run_status: null, latest_run_phase: null, created_at: CREATED }],
  systems: [{ id: "00000000-0000-4000-8000-000000000d11", project_id: "00000000-0000-4000-8000-000000000d10", title: "Claims chat", target_revision_id: systemRevision,
    document: { kind: "openai_compatible" }, connection_status: "connected", runner_status: null, runner_id: null, error_code: null }],
  reports: [],
  entitlement: { plan: "managed", max_systems: 10, max_tests_per_set: 500, max_runs_per_month: null, max_members: 10, max_active_runs: 2, monthly_spend_limit: "500",
    currency: "EUR", allowed_connection_types: ["website", "openai_compatible", "https_json"], can_export: true, can_schedule: true },
  usage: { settled: "0", outstanding: "0" },
  preferences: { completion: true, required_input: true, failure: true, email: false },
};
const endpoints = [
  { id: slackId, label: "#ai-quality", url: null, events: ["regression", "run_unknown", "run_partial"], enabled: true, failed_deliveries: 0, destination_type: "slack",
    target_hint: "hooks.slack.com · …mnop", locale: "en", last_test_at: CREATED, last_test_status: "delivered", last_test_reason: null, last_test_http_status: null },
  { id: emailId, label: "QA inbox", url: null, events: ["regression"], enabled: true, failed_deliveries: 1, destination_type: "email",
    target_hint: "qa•••@acme.com", locale: "es", last_test_at: CREATED, last_test_status: "failed", last_test_reason: "email_unavailable", last_test_http_status: null },
  { id: webhookId, label: "Release pipeline", url: "https://hooks.acme.example/caudals", events: ["run_completed", "regression"], enabled: true, failed_deliveries: 0, destination_type: "webhook",
    target_hint: null, locale: "en", last_test_at: null, last_test_status: null, last_test_reason: null, last_test_http_status: null },
];
const tokens = [{ id: "00000000-0000-4000-8000-000000000d12", name: "GitHub Actions", scopes: ["runs:write", "runs:read"], expires_at: "2026-11-07T10:00:00.000Z", revoked_at: null }];
const gates = [{ evaluation_id: evaluationId, evaluation_title: "Claims assistant review", suite_version_id: suiteVersionId, target_revision_id: systemRevision, suite_id: suiteId, suite_title: "Approved claims questions", gate_threshold: 80 }];
const schedules = [{
  id: scheduleId, project_id: "00000000-0000-4000-8000-000000000d10", evaluation_id: evaluationId, target_revision_id: systemRevision, suite_version_id: suiteVersionId,
  timezone: "Europe/Madrid", cadence: "monthly", local_time: "09:00:00", weekday: null, day_of_month: 1, max_run_spend: "10", currency: "EUR", source_max_age_days: null,
  status: "active", reason_code: null, next_due_at: "2026-11-01T08:00:00.000Z", version: 3, updated_at: CREATED,
  latest_dispatch_status: null, latest_dispatch_reason: null, latest_scheduled_for: null, latest_alert_status: null, credit_cap_ucr: null, gate_threshold: 70,
}];

type Call = { method: string; path: string; body: Record<string, unknown> | null };
async function route(page: Page, o: { testFails?: boolean } = {}) {
  const calls: Call[] = [];
  await page.route("**/api/evals/v1/**", async (request) => {
    const url = new URL(request.request().url());
    const path = url.pathname.replace("/api/evals/v1", "");
    const method = request.request().method();
    const body = method === "GET" ? null : (request.request().postDataJSON() as Record<string, unknown> | null);
    if (method !== "GET") calls.push({ method, path, body });
    const json = (data: unknown, status = 200) => request.fulfill({ status, json: status === 200 ? { data, meta: {} } : data });
    if (path === "/workspace/summary") return json(summary);
    if (path === "/billing/summary") return json({ error: { code: "SCOPE_DENIED" } }, 404);
    if (path === "/webhooks" && method === "POST") return json(body?.type === "webhook" ? { id: "new", secret: "whsec_fixture_shown_once" } : { id: "new", destination_type: body?.type });
    if (path === "/webhooks") return json(endpoints);
    if (path === `/webhooks/${slackId}/test`) return json(o.testFails ? { last_test_status: "failed", last_test_reason: "http_error", last_test_http_status: 404 } : { last_test_status: "delivered", last_test_reason: null, last_test_http_status: 200 });
    if (path.startsWith("/webhooks/")) return json({ id: path.split("/")[2] });
    if (path === "/tokens" && method === "POST") return json({ id: "t", token: `evct_${"x".repeat(43)}` });
    if (path === "/tokens") return json(tokens);
    if (path === "/gates") return json(gates);
    if (path === `/gates/${suiteId}`) return json({ suite_id: suiteId, gate_threshold: body?.threshold ?? null });
    if (path === "/schedules" && method === "POST") return json({ id: scheduleId, status: "active", version: 1 });
    if (path === "/schedules") return json(schedules);
    if (path === `/schedules/${scheduleId}`) return json({ id: scheduleId, version: 3, gate_threshold: body?.gateThreshold ?? null });
    if (path === "/alerts") return json([]);
    return json([]);
  });
  return calls;
}

test("Developers with integrations: CI tokens, destinations with Send test and delete, release gate, CI reference", async ({ page }) => {
  const calls = await route(page);
  await page.goto(`/workspace/settings?owner&integrations&orgId=${org}&tab=developers`);

  // Destinations: type, masked target, last test.
  const destinations = page.getByRole("table", { name: "Alert destinations" });
  await expect(destinations.getByRole("row").filter({ hasText: "#ai-quality" })).toContainText("Slack");
  await expect(destinations.getByText("hooks.slack.com · …mnop")).toBeVisible();
  await expect(destinations.getByRole("row").filter({ hasText: "#ai-quality" }).getByTestId("destination-test")).toContainText("Test delivered");
  await expect(destinations.getByRole("row").filter({ hasText: "QA inbox" }).getByTestId("destination-test")).toHaveText("Last test failed: email is not available right now");
  await expect(destinations.getByText("https://hooks.acme.example/caudals")).toBeVisible();

  // Release gate: the threshold per approved test set, with the IDs a pipeline sends.
  const gate = page.getByRole("table", { name: "Release gate" });
  await expect(gate.getByTestId("gate-threshold")).toHaveText("80% of scored answers");
  await expect(gate.getByText(suiteVersionId)).toBeVisible();
  await expect(gate.getByText(systemRevision)).toBeVisible();

  // The reference documents the CI trigger, the gate and a GitHub Actions workflow.
  const reference = page.locator("section.p-api-ref");
  await expect(reference.getByRole("cell", { name: "runs:write", exact: true })).toBeVisible();
  await expect(reference.getByText("/api/evals/v1/integrations/runs/{runId}/gate?orgId=…", { exact: true })).toBeVisible();
  await expect(reference.getByRole("figure").filter({ hasText: "GitHub Actions" })).toContainText("Idempotency-Key: gh-${{ github.sha }}-${{ github.run_attempt }}");
  await expect(reference.getByText("30 new runs an hour per workspace; replays of an Idempotency-Key do not count.")).toBeVisible();
  await expect(reference.getByText(/Slack, Microsoft Teams and email destinations receive the same events/)).toBeVisible();
  await noHorizontalScroll(page);

  // A CI token: runs:write with runs:read, short expiries, a warning.
  await page.getByRole("button", { name: "Create token" }).click();
  const tokenDialog = page.getByRole("dialog", { name: "Create token" });
  await expect(tokenDialog.getByLabel("Scope")).toHaveValue("ci");
  await expect(tokenDialog.getByLabel("Expires in").locator("option")).toHaveText(["1 day", "7 days", "30 days", "90 days"]);
  await expect(tokenDialog.getByText(/spends credits like a person pressing Run/)).toBeVisible();
  await tokenDialog.getByLabel("Scope").selectOption("runs:read");
  await expect(tokenDialog.getByLabel("Expires in").locator("option")).toHaveText(["30 days", "90 days", "365 days"]);
  await tokenDialog.getByLabel("Scope").selectOption("ci");
  await tokenDialog.getByLabel("Name").fill("GitHub Actions");
  await tokenDialog.getByLabel("Expires in").selectOption("7");
  await axe(page, "[role=dialog]");
  await tokenDialog.getByRole("button", { name: "Create token" }).click();
  await expect(page.getByRole("dialog", { name: "Token created" })).toBeVisible();
  const created = calls.find(call => call.path === "/tokens")!;
  expect(created.body).toMatchObject({ orgId: org, name: "GitHub Actions", scopes: ["runs:write", "runs:read"] });
  expect(Date.parse(String(created.body!.expiresAt)) - Date.now()).toBeLessThan(7 * 86_400_000 + 60_000);
  await page.getByRole("button", { name: "Done" }).click();

  // Add a Slack destination; the picker changes the fields and help per type.
  await page.getByRole("button", { name: "Add destination" }).click();
  const dialog = page.getByRole("dialog", { name: "Add destination" });
  await expect(dialog.getByLabel("Type").locator("option")).toHaveText(["Slack", "Microsoft Teams", "Email", "Signed webhook"]);
  await expect(dialog.getByText(/add the Incoming Webhooks app/)).toBeVisible();
  await dialog.getByLabel("Name").fill("#releases");
  await dialog.getByLabel("Webhook URL").fill("https://hooks.slack.com/services/T0/B0/abcdefghijkl");
  await expect(dialog.getByLabel("Send alerts for")).toHaveValue("alerts");
  await dialog.getByLabel("Message language").selectOption("es");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `dialog fits at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await axe(page, "[role=dialog]");
  await dialog.getByRole("button", { name: "Add destination" }).click();
  await expect(page.getByText("Destination added. Send a test to check it.")).toBeVisible();
  expect(calls.find(call => call.path === "/webhooks")!.body).toEqual({ orgId: org, type: "slack", label: "#releases", url: "https://hooks.slack.com/services/T0/B0/abcdefghijkl", events: ["regression", "run_unknown", "run_partial"], locale: "es" });

  // Email and signed webhook fields.
  await page.getByRole("button", { name: "Add destination" }).click();
  await dialog.getByLabel("Type").selectOption("email");
  await expect(dialog.getByLabel("Email address")).toBeVisible();
  await expect(dialog.getByLabel("Webhook URL")).toHaveCount(0);
  await dialog.getByLabel("Type").selectOption("webhook");
  await expect(dialog.getByLabel("Message language")).toHaveCount(0);
  await expect(dialog.getByLabel("Send alerts for")).toHaveValue("all");
  await dialog.getByLabel("Name").fill("Pipeline");
  await dialog.getByLabel("HTTPS URL").fill("https://hooks.acme.example/two");
  await dialog.getByRole("button", { name: "Add destination" }).click();
  await expect(page.getByRole("dialog", { name: "Signing secret" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // Send test from the destination's menu.
  await destinations.getByRole("row").filter({ hasText: "#ai-quality" }).getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Rotate signing secret" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Send test" }).click();
  await expect(page.getByText("Test message sent.")).toBeVisible();
  expect(calls.some(call => call.path === `/webhooks/${slackId}/test`)).toBe(true);

  // Delete asks first.
  await destinations.getByRole("row").filter({ hasText: "QA inbox" }).getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Send test" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this destination?" });
  await expect(confirm.getByText("Caudals stops sending to it at once. This cannot be undone.")).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Destination deleted.")).toBeVisible();
  expect(calls.find(call => call.method === "DELETE")).toMatchObject({ path: `/webhooks/${emailId}`, body: { orgId: org } });

  // Set the release gate's threshold.
  await gate.getByRole("button", { name: "Set threshold" }).click();
  const gateDialog = page.getByRole("dialog", { name: "Pass threshold" });
  await expect(gateDialog.getByLabel("Pass threshold (%)")).toHaveValue("80");
  await gateDialog.getByLabel("Pass threshold (%)").fill("101");
  await gateDialog.getByRole("button", { name: "Save" }).click();
  await expect(gateDialog.getByText(/from 0 to 100/).first()).toBeVisible();
  await gateDialog.getByLabel("Pass threshold (%)").fill("85,5");
  await gateDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Pass threshold saved.")).toBeVisible();
  expect(calls.find(call => call.path === `/gates/${suiteId}`)!.body).toEqual({ orgId: org, threshold: 85.5 });
});

test("a failed test send says why", async ({ page }) => {
  await route(page, { testFails: true });
  await page.goto(`/workspace/settings?owner&integrations&orgId=${org}&tab=developers`);
  await page.getByRole("table", { name: "Alert destinations" }).getByRole("row").filter({ hasText: "#ai-quality" }).getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Send test" }).click();
  await expect(page.getByText("The test message could not be delivered: the destination answered HTTP 404.")).toBeVisible();
});

test("without the flag, Developers keeps read-only tokens and signed webhooks", async ({ page }) => {
  await route(page);
  await page.goto(`/workspace/settings?owner&orgId=${org}&tab=developers`);
  await expect(page.getByTestId("destinations").getByRole("heading", { name: "Webhooks", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Release gate" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add webhook" })).toBeVisible();
  await expect(page.locator("section.p-api-ref").getByRole("cell", { name: "runs:write", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create token" }).click();
  await expect(page.getByRole("dialog", { name: "Create token" }).getByLabel("Scope").locator("option")).toHaveText(["Runs", "Published reports", "Schedules"]);
});

test("a schedule's own pass threshold, in Monitoring", async ({ page }) => {
  const calls = await route(page);
  await page.goto(`/workspace/settings?owner&integrations&orgId=${org}&tab=monitoring`);
  const table = page.getByRole("table", { name: "Scheduled runs" });
  await expect(table.getByTestId("schedule-gate")).toHaveText("Gate at 70%");
  await table.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Pass threshold" }).click();
  const dialog = page.getByRole("dialog", { name: "Pass threshold" });
  await expect(dialog.getByLabel("Pass threshold (%)")).toHaveValue("70");
  await dialog.getByLabel("Pass threshold (%)").fill("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Pass threshold saved.")).toBeVisible();
  expect(calls.find(call => call.path === `/schedules/${scheduleId}`)!.body).toEqual({ orgId: org, expectedVersion: 3, gateThreshold: null });
  // New schedules can carry one too.
  await page.getByRole("button", { name: "New schedule" }).click();
  const create = page.getByRole("dialog", { name: "New schedule" });
  await create.getByLabel("Pass threshold (%)").fill("75");
  await create.getByRole("button", { name: "Create schedule" }).click();
  await expect.poll(() => calls.filter(call => call.path === "/schedules").length).toBe(1);
  expect(calls.find(call => call.path === "/schedules")!.body).toMatchObject({ gateThreshold: 75, evaluationId });
  await noHorizontalScroll(page);
});

test("integrations in Spanish at 390 px", async ({ page }) => {
  await spanish(page);
  await route(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/workspace/settings?owner&integrations&orgId=${org}&tab=developers`);
  await expect(page.getByRole("heading", { name: "Destinos de alertas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Control de publicación" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Control de publicación" }).getByTestId("gate-threshold")).toHaveText("80 % de las respuestas puntuadas");
  await expect(page.getByText("La última prueba falló: el correo no está disponible ahora mismo")).toBeVisible();
  await page.getByRole("button", { name: "Añadir destino" }).click();
  const dialog = page.getByRole("dialog", { name: "Añadir destino" });
  await expect(dialog.getByLabel("Tipo").locator("option")).toHaveText(["Slack", "Microsoft Teams", "Correo electrónico", "Webhook firmado"]);
  await expect(dialog.getByLabel("Idioma de los mensajes")).toHaveValue("es");
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Crear token" }).click();
  await expect(page.getByRole("dialog", { name: "Crear token" }).getByLabel("Caduca en").locator("option")).toHaveText(["1 día", "7 días", "30 días", "90 días"]);
  await page.keyboard.press("Escape");
  await expect(page.locator("section.p-api-ref").getByRole("figure").filter({ hasText: "GitHub Actions" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
