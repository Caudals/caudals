/**
 * UI contracts for the help centre (launch L-20): search in the help panel,
 * articles in the panel and as pages, the contextual "?" links and the API
 * reference in Settings → Developers, at 390, 768 and 1440 px and in Spanish.
 * Runs against the isolated harness (ui.config.ts).
 */
import { expect, test, type Page } from "@playwright/test";

const orgId = "00000000-0000-4000-8000-000000000001";
const WIDTHS = [390, 768, 1440] as const;
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });

async function openHelp(page: Page) {
  await page.keyboard.press("Control+k");
  await page.getByRole("option", { name: /^(Help|Ayuda)$/ }).click();
  const help = page.getByRole("dialog", { name: /^(Help|Ayuda)$/ });
  await expect(help).toBeVisible();
  return help;
}

for (const width of WIDTHS) {
  test(`help panel searches articles and reads one in place at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/workspace/evaluations");
    const help = await openHelp(page);
    const search = help.getByRole("searchbox", { name: "Search help" });
    await expect(search).toBeFocused();
    await expect(help.getByRole("button", { name: /Connect a website chat/ })).toBeVisible();
    await expect(help.locator(".p-help-item")).toHaveCount(12);

    await search.fill("captcha");
    await expect(help.locator(".p-help-item").first()).toContainText("Connect a website chat");
    await search.fill("invite a colleague");
    await expect(help.locator(".p-help-item").first()).toContainText("Team members and roles");
    await search.fill("zzqx");
    await expect(help.getByText("No article matches “zzqx”.", { exact: false })).toBeVisible();

    await search.fill("regression");
    await help.locator(".p-help-item").first().click();
    await expect(help.getByRole("heading", { name: "Schedules and regression alerts", level: 3 })).toBeVisible();
    await expect(help.getByText(/^Reviewed /)).toBeVisible();
    await expect(help.getByRole("link", { name: "Open as a page" })).toHaveAttribute("href", /\/workspace\/help\/schedules-and-alerts/);
    await help.getByRole("button", { name: "All articles" }).click();
    // A link between articles opens the other article in place.
    await help.getByRole("searchbox", { name: "Search help" }).fill("captcha");
    await help.locator(".p-help-item").first().click();
    await help.getByRole("link", { name: "Prepare and run your tests" }).click();
    await expect(help.getByRole("heading", { name: "Prepare and run your tests", level: 3 })).toBeVisible();
    await help.getByRole("button", { name: "All articles" }).click();
    await expect(help.getByRole("searchbox", { name: "Search help" })).toBeVisible();
    await expect(help.getByRole("link", { name: "Book a 30-minute call" })).toHaveAttribute("href", "https://caudals.com/en/call");
    await expect(help.getByRole("link", { name: /How Caudals grades answers/ })).toHaveAttribute("href", "https://caudals.com/en/methodology");
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test(`help article and help centre pages read well at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/workspace/help/prepare-and-run?orgId=${orgId}`);
    await expect(page.getByRole("heading", { name: "Prepare and run your tests", level: 1 })).toBeVisible();
    await expect(page.getByText("Reviewed October 12, 2026")).toBeVisible();
    for (const section of ["Generate the test set", "Review and approve", "Run the evaluation"]) await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
    await expect(page.locator("#run")).toBeAttached();
    await expect(page.getByRole("heading", { name: "Related articles" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Upload documents and answers/ })).toHaveAttribute("href", /\/workspace\/help\/uploads/);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Prepare and run your tests");
    expect(await noHorizontalScroll(page)).toBe(true);

    await page.goto(`/workspace/help?orgId=${orgId}`);
    await expect(page.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search help" }).fill("delete workspace");
    await expect(page.locator(".p-help-item").first()).toContainText("How we handle your data");
    await expect(page.locator(".p-help-item").first()).toHaveAttribute("href", /\/workspace\/help\/data-and-privacy/);
    expect(await noHorizontalScroll(page)).toBe(true);
  });
}

test("help is searchable in Spanish and links to the Spanish public pages", async ({ page }) => {
  await spanish(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace/evaluations");
  const help = await openHelp(page);
  const search = help.getByRole("searchbox", { name: "Buscar en la ayuda" });
  await search.fill("invitar compañero");
  await expect(help.locator(".p-help-item").first()).toContainText("Miembros del equipo y roles");
  await search.fill("créditos");
  await help.locator(".p-help-item").first().click();
  await expect(help.getByRole("heading", { name: "Planes, límites y facturación", level: 3 })).toBeVisible();
  await expect(help.getByRole("link", { name: "Términos del servicio" })).toHaveAttribute("href", "https://caudals.com/es/legal/terminos");
  await expect(help.getByRole("link", { name: "Reservar una llamada de 30 minutos" })).toHaveAttribute("href", "https://caudals.com/es/llamada");
  await expect(help.getByRole("link", { name: /Cómo califica Caudals las respuestas/ })).toHaveAttribute("href", "https://caudals.com/es/metodologia");
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("the ? beside a step opens its article in the help panel", async ({ page }) => {
  const evaluationId = "00000000-0000-4000-8000-000000000910";
  const sourceId = "00000000-0000-4000-8000-000000000911";
  await page.route("**/api/evals/v1/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/workspace/summary")) return route.fulfill({ json: { data: {
      evaluations: [{ id: evaluationId, project_id: "00000000-0000-4000-8000-000000000912", title: "Support policy", project_title: "Support policy", project_description: "", latest_source_id: sourceId, latest_source_revision_id: "00000000-0000-4000-8000-000000000913", preparation_status: "draft", reason_code: null, selected_suite_version_id: null, latest_run_id: null, latest_run_status: null, latest_run_phase: null }],
      systems: [{ id: "00000000-0000-4000-8000-000000000914", title: "Support bot", target_revision_id: "00000000-0000-4000-8000-000000000915", document: { kind: "website" }, connection_status: "ready", error_code: null }],
      reports: [], entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true }, usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
    }, meta: {} } });
    if (url.pathname.endsWith("/generate")) return route.fulfill({ json: { data: { status: "none", job: null }, meta: {} } });
    return route.fulfill({ json: { data: [], meta: {} } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/workspace/evaluations/${evaluationId}?orgId=${orgId}&editor`);
  await expect(page.getByRole("heading", { name: "Reference material" })).toBeVisible();
  const sources = page.getByRole("link", { name: "Help: reference material" });
  await expect(sources).toHaveAttribute("href", /\/workspace\/help\/uploads.*#documents$/);
  await expect(page.getByRole("link", { name: "Help: prepare the tests" })).toHaveAttribute("href", /prepare-and-run.*#generate$/);
  await sources.click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help.getByRole("heading", { name: "Upload documents and answers", level: 3 })).toBeVisible();
  await expect(help.locator("#help-panel-documents")).toBeInViewport();
  await page.keyboard.press("Escape");
  // Opened from the menu, help starts at the list again.
  const fromMenu = await openHelp(page);
  await expect(fromMenu.getByRole("searchbox", { name: "Search help" })).toBeVisible();
});

test("Settings → Developers documents endpoints, scopes, webhooks and limits", async ({ page }) => {
  await page.route("**/api/evals/v1/**", (route) => route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith("/workspace/summary") ? {
    evaluations: [], systems: [], reports: [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: true },
    usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
  } : [], meta: {} } }));
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/workspace/settings?tab=developers&owner&orgId=${orgId}`);
    const reference = page.locator("section.p-api-ref");
    await expect(reference.getByRole("heading", { name: "API reference" })).toBeVisible();
    await expect(reference.getByLabel("Workspace ID (orgId)")).toHaveValue(orgId);
    for (const scope of ["runs:read", "reports:read", "schedules:read"]) await expect(reference.getByRole("cell", { name: scope })).toBeVisible();
    for (const path of ["/api/evals/v1/integrations/runs?orgId=…", "/api/evals/v1/integrations/ci/{scheduleId}?orgId=…"]) await expect(reference.getByText(path, { exact: true })).toBeVisible();
    await expect(reference.getByText("POST", { exact: true })).toHaveCount(0);
    await expect(reference.getByText(`/api/evals/v1/integrations/runs?orgId=${orgId}`, { exact: false })).toBeVisible();
    for (const event of ["run_completed", "regression", "inconclusive", "run_partial", "run_unknown"]) await expect(reference.getByRole("cell", { name: event, exact: true })).toBeVisible();
    await expect(reference.getByRole("figure").filter({ hasText: "Node.js" })).toContainText("timingSafeEqual");
    await expect(reference.getByRole("figure").filter({ hasText: "Python" })).toContainText("hmac.compare_digest");
    await expect(reference.getByText("60 requests a minute per token, across every endpoint.")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
  }
  // With token estimates on (BILLING_ESTIMATES_ENABLED=true), the estimate endpoint is listed too.
  await page.goto(`/workspace/settings?tab=developers&owner&estimates&orgId=${orgId}`);
  await expect(page.locator("section.p-api-ref").getByText("/api/evals/v1/billing/estimates", { exact: true })).toBeVisible();
});

test("the API reference reads in Spanish", async ({ page }) => {
  await spanish(page);
  await page.route("**/api/evals/v1/**", (route) => route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith("/workspace/summary") ? {
    evaluations: [], systems: [], reports: [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: true },
    usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
  } : [], meta: {} } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/settings?tab=developers&owner&orgId=${orgId}`);
  const reference = page.locator("section.p-api-ref");
  await expect(reference.getByRole("heading", { name: "Referencia de la API" })).toBeVisible();
  await expect(reference.getByRole("heading", { name: "Verificar la firma" })).toBeVisible();
  await expect(reference.getByText("60 peticiones por minuto y token, contando todos los endpoints.")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});

for (const width of WIDTHS) {
  test(`public methodology page reads well at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/methodology?public");
    await expect(page.getByRole("heading", { name: /How we test an assistant/, level: 1 })).toBeVisible();
    for (const title of ["Questions from your sources", "Grading by meaning", "Outcome labels", "Sample sizes and intervals", "Review levels", "Limits", "What we never do"]) {
      await expect(page.getByRole("heading", { name: new RegExp(title), level: 2 })).toBeVisible();
    }
    await expect(page.getByText("41%–93%").first()).toBeVisible();
    await expect(page.getByText("Test needs review").locator("visible=true").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Test your assistant free/ })).toBeVisible();
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Methodology" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/evals-ui-test-results/methodology-${width}.png`, fullPage: true });
  });
}

test("public methodology page in Spanish, with the diagnostic CTA while the free test is not public", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/methodology?locale=es");
  await expect(page.getByRole("heading", { name: /Cómo probamos un asistente/, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Lo que nunca hacemos/, level: 2 })).toBeVisible();
  await expect(page.getByText("41 %–93 %").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Solicitar un diagnóstico/ })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});
