/**
 * UI contracts for launch L-25 (spec P-26, P-30, P-31): sector pack authoring
 * in the ops library, the expert review screen, "Add N sector questions" in
 * the Prepare step and on a test set, and monthly proposed questions, at 390,
 * 768 and 1440 px in English and Spanish, with axe on the new screens. Runs
 * against the isolated harness (ui.config.ts); fixtures are synthetic apart
 * from the seed pack's own questions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [390, 768, 1440] as const;
const ORG = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const SEED = JSON.parse(readFileSync(join(process.cwd(), "content/sector-packs/es-fiscal-contable-laboral.json"), "utf8"));
const VERSION = id(3001), PACK = "es-fiscal-contable-laboral", REVIEWER = "au_01EXPERTFIXTURE0000000000";
type Review = "pending" | "approved" | "changes_requested" | "rejected";

function items(count: number, approved: number) {
  return SEED.items.slice(0, count).map((item: Record<string, unknown> & { source: Record<string, string>; rights: Record<string, string> }, index: number) => ({
    id: id(4000 + index), key: item.key, scope: "sector_generic", topic: item.topic, language: "es", question: item.question, questionEn: item.questionEn ?? null,
    expected: item.expected, keyFacts: item.keyFacts, severity: item.severity, difficulty: item.difficulty, answerability: "answerable",
    source: { url: item.source.url, title: item.source.title, publisher: item.source.publisher, locator: item.source.locator, excerpt: item.source.excerpt, retrievedAt: item.source.retrievedAt, asOf: item.source.asOf ?? null },
    rights: { kind: item.rights.kind, basis: item.rights.basis, licenceRef: null },
    authorId: "au_01OPSFIXTURE00000000000000", authorNote: "", updatedBy: "au_01OPSFIXTURE00000000000000",
    review: index < approved ? { status: "approved" as Review, reviewerId: REVIEWER, reviewerProfileId: id(77), reviewedAt: "2026-10-13T10:00:00.000Z", note: null } : { status: "pending" as Review, reviewerId: null, reviewerProfileId: null, reviewedAt: null, note: null },
    contentHash: "a".repeat(64), updatedAt: "2026-10-13T09:00:00.000Z",
    stats: index === 0 ? { workspaces: 4, results: 12, passed: 7, partial: 2, failed: 3 } : index === 1 ? { workspaces: 1, results: 2, passed: null, partial: null, failed: null } : { workspaces: 0, results: 0, passed: null, partial: null, failed: null },
  }));
}
const pack = { id: PACK, sector: "fiscal_accounting_payroll", jurisdiction: "ES", language: "es", domainPackId: "generic-grounded-qa", title: SEED.pack.title, summary: SEED.pack.summary };
const versionSummary = (status: string, total: number, approved: number) => ({
  id: VERSION, packId: PACK, version: 1, status, notes: SEED.version.notes, createdAt: "2026-10-13T08:00:00Z", updatedAt: "2026-10-13T10:00:00Z", submittedAt: status === "draft" ? null : "2026-10-13T09:30:00Z",
  publishedAt: null, contentHash: null, items: total, approved, pending: total - approved, changesRequested: 0, rejected: 0, oldestSource: "2026-10-13",
});

/** Routes the pack API; returns the writes. */
async function routePacks(page: Page, options: { role?: { staff: boolean; expert: boolean; reviewer: boolean }; status?: string; total?: number; approved?: number } = {}) {
  const role = options.role ?? { staff: true, expert: false, reviewer: false };
  const total = options.total ?? 62, approved = options.approved ?? 61, status = options.status ?? "in_review";
  const writes: Array<{ path: string; method: string; body: unknown }> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace("/api/evals/v1", "");
    const json = (data: unknown) => route.fulfill({ json: { data, meta: {} } });
    if (method !== "GET") writes.push({ path, method, body: route.request().postDataJSON() });
    if (path === "/sector-packs" && method === "GET") return json({ role, packs: [
      { ...pack, versions: [versionSummary(status, total, approved)] },
      { id: "es-seguros", sector: "insurance", jurisdiction: "ES", language: "es", domainPackId: "generic-grounded-qa", title: { en: "Insurance in Spain", es: "Seguros en España" }, summary: { en: "Insurance.", es: "Seguros." }, versions: [{ ...versionSummary("draft", 70, 0), id: id(3002), packId: "es-seguros" }] },
    ] });
    if (path === "/sector-packs" && method === "POST") return json({ packId: PACK, versionId: VERSION, opened: true, created: 70, updated: 0, unchanged: 0, items: 70, pending: 70 });
    if (path === `/sector-packs/versions/${VERSION}`) return json({ role, pack, version: versionSummary(status, total, approved), items: items(total, approved), minPublished: 60 });
    if (path.startsWith("/sector-packs/")) return json({ ok: true });
    return json([]);
  });
  return writes;
}

async function axe(page: Page, selector = "#p-main") {
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
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });

/* ------------------------------------------------------- ops authoring --- */

for (const width of WIDTHS) {
  test(`ops library: sector packs with versions, review progress, sources and rights at ${width}px`, async ({ page }) => {
    await routePacks(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/ops/library/sector-packs?orgId=${ORG}&sector-packs`);
    await expect(page.getByRole("link", { name: "Sector packs" })).toHaveAttribute("aria-current", "page");
    const table = page.getByRole("region", { name: "Sector packs" });
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(table).toContainText("Spanish tax, accounting and payroll");
    await expect(table).toContainText("61/62");
    await expect(table).toContainText("In review");
    expect(await noHorizontalScroll(page)).toBe(true);
    await table.getByRole("button", { name: "Spanish tax, accounting and payroll" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Spanish tax, accounting and payroll" })).toBeVisible();
    await expect(page.getByText("Pending expert review. These questions are drafts", { exact: false })).toBeVisible();
    await expect(page.getByText("61 of 62 questions approved by an expert")).toBeVisible();
    // Publishing needs every question approved.
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
    await expect(page.getByText("Publishing needs at least 60 questions, every one approved by an expert.")).toBeVisible();
    const questions = page.getByRole("region", { name: "Questions" });
    await expect(questions.getByRole("row")).toHaveCount(63);
    await expect(questions).toContainText("Agencia Estatal Boletín Oficial del Estado");
    await expect(questions).toContainText("Public official text");
    await expect(questions).toContainText("Pending expert review");
    await expect(questions).toContainText("33% failed · 12 results in 4 workspaces");
    await expect(questions).toContainText("2 results in fewer than 3 workspaces");
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l25-ops-${width}.png`, fullPage: false });
    await questions.getByRole("button", { name: SEED.items[0].question }).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toContainText(SEED.items[0].source.excerpt.slice(0, 60));
    await expect(panel).toContainText(SEED.items[0].rights.basis.slice(0, 40));
    await expect(panel.getByRole("link", { name: "Open source" })).toHaveAttribute("href", SEED.items[0].source.url);
    await expect(panel).toContainText("Approved by an expert");
    await expect(panel).toContainText(REVIEWER);
    await expect(panel.getByRole("button", { name: "Edit" })).toBeVisible();
    // Staff without an expert profile cannot record a review.
    await expect(panel.getByRole("button", { name: "Approve" })).toHaveCount(0);
  });
}

test("ops: search and filters narrow the questions; a fully approved version publishes after confirmation", async ({ page }) => {
  const writes = await routePacks(page, { approved: 62 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/ops/library/sector-packs?orgId=${ORG}&sector-packs`);
  await page.getByRole("button", { name: "Spanish tax, accounting and payroll" }).click();
  const questions = page.getByRole("region", { name: "Questions" });
  await page.getByRole("searchbox", { name: "Search questions" }).fill(SEED.items[3].key);
  await expect(questions.getByRole("row")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Search questions" }).fill("");
  await page.getByLabel("Topic").selectOption("IVA");
  const iva = SEED.items.slice(0, 62).filter((item: { topic: string }) => item.topic === "IVA").length;
  await expect(questions.getByRole("row")).toHaveCount(iva + 1);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("dialog")).toContainText("It becomes immutable");
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect.poll(() => writes.map((write) => [write.path, write.body])).toContainEqual([`/sector-packs/versions/${VERSION}/status`, { to: "published" }]);
});

test("ops: import a pack file, then add a question with its source and rights", async ({ page }) => {
  const writes = await routePacks(page, { status: "draft", approved: 0 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/ops/library/sector-packs?orgId=${ORG}&sector-packs`);
  await page.getByRole("button", { name: "Import pack file" }).click();
  await page.getByLabel("Pack file (.json)").setInputFiles(join(process.cwd(), "content/sector-packs/es-fiscal-contable-laboral.json"));
  await page.getByRole("dialog").getByRole("button", { name: "Import pack file" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Spanish tax, accounting and payroll" })).toBeVisible();
  const imported = writes.find((write) => write.path === "/sector-packs")!.body as { schema: string; items: unknown[] };
  expect(imported.schema).toBe("caudals.sector-pack/v1");
  expect(imported.items).toHaveLength(SEED.items.length);
  await expect(page.getByRole("button", { name: "Submit for expert review" })).toBeEnabled();
  await page.getByRole("button", { name: "Add question" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Key", { exact: true }).fill("iva-prueba-contrato");
  await form.getByLabel("Topic", { exact: true }).fill("IVA");
  await form.getByLabel("Question", { exact: true }).fill("¿Una pregunta de prueba sobre el IVA?");
  await form.getByLabel("Expected answer").fill("El impuesto se exige al tipo indicado.");
  await form.getByLabel("Key facts (one per line, copied from the excerpt)").fill("21 por ciento");
  await form.getByLabel("Source URL").fill("https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740");
  await form.getByLabel("Source title").fill("Ley 37/1992 del IVA");
  await form.getByLabel("Publisher").fill("Agencia Estatal Boletín Oficial del Estado");
  await form.getByLabel("Locator (article, section)").fill("Artículo 90");
  await form.getByLabel("Excerpt (verbatim)").fill("El impuesto se exigirá al tipo del 21 por ciento, salvo lo dispuesto en el artículo siguiente.");
  await form.getByLabel("Rights basis").fill("Disposición normativa; excluida de propiedad intelectual (art. 13 TRLPI).");
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.some((write) => write.path === `/sector-packs/versions/${VERSION}/items`)).toBe(true);
  const saved = writes.find((write) => write.path === `/sector-packs/versions/${VERSION}/items`)!.body as { item: { key: string; keyFacts: string[]; rights: { kind: string } } };
  expect(saved.item).toMatchObject({ key: "iva-prueba-contrato", keyFacts: ["21 por ciento"], rights: { kind: "public_official_text" } });
});

/* ------------------------------------------------------- expert review --- */

for (const width of [390, 1440] as const) {
  test(`expert review in Spanish: approve, and request changes only with a note, at ${width}px`, async ({ page }) => {
    await spanish(page);
    const writes = await routePacks(page, { role: { staff: false, expert: true, reviewer: true }, approved: 0 });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/review/sector-packs?sector-packs`);
    await expect(page.getByRole("heading", { level: 1, name: "Paquetes sectoriales" })).toBeVisible();
    if (width === 1440) await expect(page.getByRole("link", { name: "Paquetes sectoriales" })).toHaveAttribute("href", "/review/sector-packs");
    await expect(page.getByRole("button", { name: "Importar archivo de paquete" })).toHaveCount(0);
    await page.getByRole("button", { name: "Fiscalidad, contabilidad y nómina en España" }).click();
    await expect(page.getByText("Pendiente de revisión experta. Estas preguntas son borradores", { exact: false })).toBeVisible();
    // Experts do not move versions.
    await expect(page.getByRole("button", { name: "Publicar" })).toHaveCount(0);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.getByRole("button", { name: SEED.items[2].question }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByRole("button", { name: "Pedir cambios" })).toBeDisabled();
    await panel.getByRole("button", { name: "Aprobar" }).click();
    await expect.poll(() => writes.map((write) => [write.path, write.body])).toContainEqual([`/sector-packs/items/${id(4002)}/review`, { decision: "approved" }]);
    await panel.getByLabel("Nota para el autor").fill("Cita el apartado exacto.");
    await panel.getByRole("button", { name: "Pedir cambios" }).click();
    await expect.poll(() => writes.map((write) => [write.path, write.body])).toContainEqual([`/sector-packs/items/${id(4002)}/review`, { decision: "changes_requested", note: "Cita el apartado exacto." }]);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l25-expert-${width}.png` });
  });
}

/** How far anything runs past the right edge: the shell's canvas or a table's own scroll box (launch U1). */
const sideways = (page: Page) => page.evaluate(() => Math.max(0, ...[...document.querySelectorAll<HTMLElement>(".p-canvas, .p-table-wrap")].map((node) => node.scrollWidth - node.clientWidth)));

for (const locale of ["en", "es"] as const)
  test(`expert sector packs fit a phone in ${locale.toUpperCase()}: rows stack and nothing scrolls sideways (launch U1)`, async ({ page }) => {
    if (locale === "es") await spanish(page);
    await routePacks(page, { role: { staff: true, expert: true, reviewer: true }, approved: 3 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/review/sector-packs?sector-packs`);
    const packs = page.getByRole("region", { name: locale === "es" ? "Paquetes sectoriales" : "Sector packs" });
    await expect(packs.getByRole("rowheader")).toHaveCount(2);
    // The counts are labelled once the column headers are gone.
    await expect(packs.locator(`td[data-label="${locale === "es" ? "Aprobadas por expertos" : "Expert-approved"}"]`).first()).toHaveText("3/62");
    expect(await sideways(page)).toBe(0);
    await page.screenshot({ path: `/tmp/evals-u1-review-sector-packs-${locale}-390.png`, fullPage: true });
    await packs.getByRole("rowheader").first().getByRole("button").click();
    const questions = page.getByRole("region", { name: locale === "es" ? "Preguntas" : "Questions" });
    await expect(questions.getByRole("rowheader")).toHaveCount(62);
    expect(await sideways(page)).toBe(0);
  });

/* ---------------------------------------------- Prepare: sector questions --- */

const EVAL = id(520), SUITE = id(420);
function draftCases() {
  return Array.from({ length: 12 }, (_, index) => ({
    caseRevisionId: id(1000 + index),
    document: {
      title: `Question ${index + 1}`, severity: "medium", difficulty: "routine",
      scenario: { messages: [{ role: "user", content: `¿Qué dice la página sobre el caso ${index + 1}?` }] },
      reference: { expected: `Respuesta ${index + 1}.`, answerability: "answerable", graders: [], required_claims: [], acceptable_alternatives: [] },
      provenance: { evidence_level: "source_supported" },
    },
    excerpts: [{ sourceRevisionId: id(900), sourceTitle: "Centro de ayuda", anchor: `a${index}`, excerpt: `Respuesta ${index + 1}. Más texto.` }],
  }));
}
async function routePrepare(page: Page) {
  let sector: string | null = null, added = false, views = 0;
  const writes: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace("/api/evals/v1", "");
    const json = (data: unknown) => route.fulfill({ json: { data, meta: {} } });
    if (method !== "GET") writes.push({ path, body: route.request().postDataJSON() });
    if (path === "/workspace/summary") return json({
      evaluations: [{ id: EVAL, title: "Asistente fiscal", project_id: id(601), project_title: "Asistente fiscal", project_description: "", latest_source_id: id(900), latest_source_revision_id: id(901), source_ids: [id(900)], preparation_status: "needs_review", reason_code: null, selected_suite_version_id: null, selected_target_id: null, commercial_cap: "500", currency: "EUR", latest_run_id: null, latest_run_status: null, latest_run_phase: null, latest_run_created_at: null, latest_run_execution_mode: null, latest_run_reason_code: null, created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-02T09:00:00Z" }],
      systems: [], reports: [], next_run: null, usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
      entitlement: { plan: "managed", max_active_runs: 1, monthly_spend_limit: "0", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: false },
    });
    if (path === `/evaluations/${EVAL}/context` && method === "GET") return json({ draft: { suiteId: SUITE, suiteVersionId: id(722), suiteDraftVersion: 3 }, casePreviews: [] });
    if (path === `/suites/${SUITE}/view`) { views++; return json({ suite: { id: SUITE, title: "Asistente fiscal", projectId: id(601), createdAt: "2026-10-01T09:00:00Z" }, draft: { version: added ? 4 : 3, caseCount: added ? 74 : 12 }, versions: [], usedBy: [], selected: "draft", cases: draftCases() }); }
    if (path === `/suites/${SUITE}/sector-questions` && method === "GET") return json({ sector, sectors: ["fiscal_accounting_payroll"], packs: sector ? [{ packId: PACK, versionId: VERSION, version: 1, sector: "fiscal_accounting_payroll", title: SEED.pack.title, summary: SEED.pack.summary, language: "es", items: 62, publishedAt: "2026-11-02T09:00:00Z", missing: added ? 0 : 62, added: added ? 62 : 0 }] : [] });
    if (path === "/workspace/library-settings" && method === "PUT") { sector = (route.request().postDataJSON() as { sector: string }).sector; return json({ sector, monthlyQuestions: false }); }
    if (path === `/suites/${SUITE}/sector-questions` && method === "POST") { added = true; return json({ suiteId: SUITE, added: 62, version: 4, freeze: false, status: "draft", suiteVersionId: null }); }
    return json([]);
  });
  return { writes, views: () => views };
}

for (const width of WIDTHS) {
  test(`Prepare (Spanish): choose the sector, then add the sector questions to the draft at ${width}px`, async ({ page }) => {
    await spanish(page);
    const { writes, views } = await routePrepare(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/workspace/evaluations/${EVAL}?orgId=${ORG}&editor`);
    const card = page.getByRole("region", { name: "Preguntas del sector" });
    await expect(card).toContainText("Elige tu sector para verlas");
    await card.getByLabel("Tu sector").selectOption("fiscal_accounting_payroll");
    await card.getByRole("button", { name: "Guardar sector" }).click();
    await expect(card.getByRole("button", { name: "Añadir 62 preguntas del sector" })).toBeVisible();
    await expect(card).toContainText("revisadas por expertos del sector");
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l25-prepare-${width}.png` });
    const before = views();
    await card.getByRole("button", { name: "Añadir 62 preguntas del sector" }).click();
    await expect(page.getByText("Se han añadido 62 preguntas del sector.", { exact: false })).toBeVisible();
    await expect(card).toContainText("las 62 preguntas ya están en este conjunto de pruebas");
    expect(writes.map((write) => [write.path, write.body])).toEqual([
      ["/workspace/library-settings", { orgId: ORG, sector: "fiscal_accounting_payroll" }],
      [`/suites/${SUITE}/sector-questions`, { orgId: ORG, packVersionId: VERSION }],
    ]);
    // The review reloads with the new draft version.
    await expect.poll(views).toBeGreaterThan(before);
  });
}

test("Prepare shows nothing when no published pack exists (flag off or no packs)", async ({ page }) => {
  await routePrepare(page);
  await page.route(`**/api/evals/v1/suites/${SUITE}/sector-questions?*`, (route) => route.fulfill({ status: 404, json: { error: { code: "SCOPE_DENIED", message: "Not found.", request_id: "r", retryable: false } } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/workspace/evaluations/${EVAL}?orgId=${ORG}&editor`);
  await expect(page.locator(".p-review-list > li, .p-review-title").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Sector questions" })).toHaveCount(0);
});

/* --------------------------------------------- monthly proposed questions --- */

const PROPOSALS = [
  { id: id(5001), question: "How much is the monthly account fee now?", expected: "The account fee is 7 euros a month.", keyFacts: ["7 euros a month"], quote: "The account fee is 7 euros a month.", pageUrl: "https://help.example.com/fees", changeKind: "changed_page", severity: "high", difficulty: "routine", period: "2026-11" },
  { id: id(5002), question: "What does an instant transfer cost?", expected: "Instant transfers cost 0.50 euros each.", keyFacts: ["0.50 euros each"], quote: "Instant transfers cost 0.50 euros each", pageUrl: "https://help.example.com/a/very/long/path/that/must/wrap/on/a/phone/instant-transfers-and-their-fees", changeKind: "new_page", severity: "medium", difficulty: "routine", period: "2026-11" },
];
async function routeTestSet(page: Page, view: { monthlyQuestions: boolean; eligible: boolean; proposals?: unknown[] }) {
  const writes: Array<{ path: string; body: unknown }> = [];
  let state = { ...view, proposals: view.proposals ?? PROPOSALS };
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace("/api/evals/v1", "");
    const json = (data: unknown) => route.fulfill({ json: { data, meta: {} } });
    if (method !== "GET") writes.push({ path, body: route.request().postDataJSON() });
    if (path === `/suites/${SUITE}/view`) return json({ suite: { id: SUITE, title: "Help centre set", projectId: id(601), createdAt: "2026-10-01T09:00:00Z" }, draft: null, versions: [{ id: id(721), content_hash: "b".repeat(64), created_at: "2026-10-02T09:00:00Z", case_count: 12 }], usedBy: [], selected: id(721), cases: draftCases() });
    if (path === `/suites/${SUITE}/sector-questions`) return json({ sector: "fiscal_accounting_payroll", sectors: ["fiscal_accounting_payroll"], packs: [{ packId: PACK, versionId: VERSION, version: 1, sector: "fiscal_accounting_payroll", title: SEED.pack.title, summary: SEED.pack.summary, language: "es", items: 62, publishedAt: "2026-11-02T09:00:00Z", missing: 0, added: 62 }] });
    if (path === `/suites/${SUITE}/proposals` && method === "GET") return json({ ...state, refreshes: [
      { id: id(6001), period: "2026-11", status: "proposed", pages: { new: 1, changed: 1 }, proposalCount: 2, reasonCode: null, sourceTitle: "help.example.com" },
      { id: id(6002), period: "2026-11", status: "unchanged", pages: { new: 0, changed: 0 }, proposalCount: 0, reasonCode: null, sourceTitle: "docs.example.com" },
    ] });
    if (path === `/suites/${SUITE}/proposals` && method === "POST") {
      const body = route.request().postDataJSON() as { approve: string[]; reject: string[] };
      state = { ...state, proposals: state.proposals.filter((item) => ![...body.approve, ...body.reject].includes((item as { id: string }).id)) };
      return json({ suiteId: SUITE, added: body.approve.length, rejected: body.reject.length, version: 2, freeze: true, status: "frozen", suiteVersionId: id(722) });
    }
    if (path === "/workspace/library-settings" && method === "PUT") { state = { ...state, monthlyQuestions: (route.request().postDataJSON() as { monthlyQuestions: boolean }).monthlyQuestions }; return json({ sector: null, monthlyQuestions: state.monthlyQuestions }); }
    return json([]);
  });
  return writes;
}

for (const width of WIDTHS) {
  test(`a test set lists this month's proposed questions; the owner approves one into a new version at ${width}px`, async ({ page }) => {
    const writes = await routeTestSet(page, { monthlyQuestions: true, eligible: true });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/workspace/test-sets/${SUITE}?orgId=${ORG}&owner`);
    const monthly = page.getByRole("region", { name: "New questions every month" });
    await expect(monthly).toContainText("help.example.com · 2026-11: 1 new and 1 changed pages, 2 questions proposed");
    await expect(monthly).toContainText("docs.example.com · 2026-11: no changes");
    await expect(monthly.getByText("Changed page", { exact: true })).toBeVisible();
    await expect(monthly.getByText("New page", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Sector questions" })).toContainText("all 62 questions are in this test set");
    const approve = monthly.getByRole("button", { name: "Approve selected" });
    await expect(approve).toBeDisabled();
    await monthly.getByRole("checkbox", { name: /Select this question: How much is the monthly account fee now/ }).check();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l25-monthly-${width}.png`, fullPage: true });
    await approve.click();
    await expect(page.getByText("1 added, 0 rejected. Saved as a new version of the test set.")).toBeVisible();
    expect(writes).toEqual([{ path: `/suites/${SUITE}/proposals`, body: { orgId: ORG, approve: [PROPOSALS[0].id], reject: [] } }]);
    await expect(monthly.getByRole("checkbox")).toHaveCount(1);
  });
}

test("monthly questions: owners turn it on; free workspaces see the plan note; Spanish copy", async ({ page }) => {
  await spanish(page);
  const writes = await routeTestSet(page, { monthlyQuestions: false, eligible: true, proposals: [] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/test-sets/${SUITE}?orgId=${ORG}&owner`);
  const monthly = page.getByRole("region", { name: "Preguntas nuevas cada mes" });
  await monthly.getByRole("button", { name: "Activar preguntas mensuales" }).click();
  await expect(monthly).toContainText("Activado. Las fuentes se vuelven a leer al inicio de cada mes.");
  expect(writes).toEqual([{ path: "/workspace/library-settings", body: { orgId: ORG, monthlyQuestions: true } }]);
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.unrouteAll();
  await routeTestSet(page, { monthlyQuestions: false, eligible: false, proposals: [] });
  await page.reload();
  await expect(page.getByRole("region", { name: "Preguntas nuevas cada mes" })).toContainText("Disponible en los planes de pago por uso y gestionado.");
  await expect(page.getByRole("button", { name: "Activar preguntas mensuales" })).toHaveCount(0);
});

test("sector packs, expert review, the Prepare card and monthly questions are axe-clean", async ({ page }) => {
  await routePacks(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/ops/library/sector-packs?orgId=${ORG}&sector-packs`);
  await expect(page.getByRole("region", { name: "Sector packs" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Spanish tax, accounting and payroll" }).click();
  await expect(page.getByRole("region", { name: "Questions" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: SEED.items[0].question }).click();
  expect(await axe(page, ".p-panel")).toEqual([]);
  await page.unrouteAll();
  await routePrepare(page);
  await page.goto(`/workspace/evaluations/${EVAL}?orgId=${ORG}&editor`);
  await expect(page.getByRole("region", { name: "Sector questions" })).toBeVisible();
  expect(await axe(page, ".p-sector-card")).toEqual([]);
  await page.unrouteAll();
  await routeTestSet(page, { monthlyQuestions: true, eligible: true });
  await page.goto(`/workspace/test-sets/${SUITE}?orgId=${ORG}&owner`);
  await expect(page.getByRole("region", { name: "New questions every month" })).toBeVisible();
  expect(await axe(page, ".p-monthly")).toEqual([]);
});
