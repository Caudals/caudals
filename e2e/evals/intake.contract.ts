/**
 * UI contracts for better document intake (launch L-34, P-56) at 390, 768 and
 * 1440 px, in English and Spanish: drag and drop of 50 mixed files, "Import
 * help centre", the scanned-PDF ask and "What we understood about your
 * assistant". Runs against the isolated harness (ui.config.ts) with the
 * intake flag on (`?intake`); the API is routed per test.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const ORG = "00000000-0000-4000-8000-000000000001";
const EVALUATION = "00000000-0000-4000-8000-000000000340";
const PROJECT = "00000000-0000-4000-8000-000000000341";
const JOB = "00000000-0000-4000-8000-000000000342";
const WIDTHS = [390, 768, 1440] as const;
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
const json = (route: Route, data: unknown, status = 200) => route.fulfill({ status, json: status < 400 ? { data, meta: {} } : data });

type State = {
  sourceIds: string[];
  preparation: string;
  reason: string | null;
  sources: Record<string, unknown>;
  generation?: { status: string; job: { id: string; reasonCode: string | null } | null };
};

function summary(state: State) {
  return {
    evaluations: [{ id: EVALUATION, project_id: PROJECT, title: "Help assistant", project_title: "Help assistant", project_description: "Answers customer questions", latest_source_id: state.sourceIds[0] ?? null, latest_source_revision_id: null, source_ids: state.sourceIds, preparation_status: state.preparation, reason_code: state.reason, selected_suite_version_id: null, latest_run_id: null, latest_run_status: null, latest_run_phase: null }],
    systems: [], reports: [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true },
    usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
  };
}

/** Everything the evaluation page reads; tests add their own routes on top (registered later, matched first). */
async function routeBase(page: Page, state: State) {
  await page.route("**/api/evals/v1/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/workspace/summary")) return json(route, summary(state));
    const source = /\/sources\/([^/]+)$/.exec(url.pathname);
    if (source && state.sources[source[1]]) return json(route, state.sources[source[1]]);
    if (url.pathname.endsWith(`/evaluations/${EVALUATION}/generate`) && route.request().method() === "GET") return json(route, state.generation ?? { status: "idle", job: null, batches: [] });
    if (url.pathname.endsWith(`/evaluations/${EVALUATION}/context`)) return json(route, { status: state.preparation, questions: [], draft: null, casePreviews: [] });
    return json(route, []);
  });
}

async function noHorizontalScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll at ${width}px`).toBe(true);
}

const page = (state: State) => `/workspace/evaluations/${EVALUATION}?orgId=${ORG}&editor&intake`;

test("drops 50 mixed files: valid ones upload, duplicates are skipped, every failure is named, nothing is lost", async ({ page: browser }) => {
  const state: State = { sourceIds: [], preparation: "draft", reason: null, sources: {} };
  await routeBase(browser, state);
  const created = new Map<string, string>();
  let putFailures = 0;
  const uploads: string[] = [];
  await browser.route("**/api/evals/v1/sources/uploads", (route) => {
    const body = route.request().postDataJSON() as { title: string };
    uploads.push(body.title);
    if (body.title === "file-7.txt") return json(route, { duplicate: true, sourceId: "existing-7", artifactId: "artifact-existing-7" });
    const sourceId = `source-${body.title.replace(/\W/g, "-")}`;
    created.set(sourceId, body.title);
    return json(route, { sourceId, artifactId: `artifact-${sourceId}`, uploadUrl: `/api/evals/v1/artifacts/artifact-${sourceId}/upload?orgId=${ORG}` });
  });
  await browser.route("**/api/evals/v1/artifacts/*/upload**", (route) => {
    // file-9's first upload breaks; its retry works.
    if (route.request().url().includes("file-9") && putFailures++ === 0) return route.fulfill({ status: 500, body: "" });
    return json(route, { uploaded: true });
  });
  await browser.route("**/api/evals/v1/sources/*/finalize", (route) => {
    const sourceId = new URL(route.request().url()).pathname.split("/").at(-2)!;
    state.sources[sourceId] = { id: sourceId, title: created.get(sourceId), revisions: [{ id: `rev-${sourceId}` }], ingestion: { status: "completed", source_revision_id: `rev-${sourceId}`, reason_code: null, scan_suspected: false }, chunks: [{ id: `chunk-${sourceId}`, excerpt: "Refunds within 30 days." }] };
    return json(route, { status: "extracting" });
  });
  await browser.route("**/api/evals/v1/sources/source-*", (route) => {
    const sourceId = new URL(route.request().url()).pathname.split("/").at(-1)!;
    return json(route, state.sources[sourceId] ?? { id: sourceId, revisions: [], ingestion: null, chunks: [] });
  });

  await browser.setViewportSize({ width: 1440, height: 900 });
  await browser.goto(page(state));
  await expect(browser.getByText("Drop files here or choose documents")).toBeVisible();
  const text = (name: string, body: string) => ({ name, mimeType: "text/plain", buffer: Buffer.from(body) });
  const files = [
    ...Array.from({ length: 40 }, (_, index) => text(`file-${index}.txt`, `Policy ${index}: refunds within ${index + 1} days.`)),
    ...Array.from({ length: 3 }, (_, index) => text(`copy-of-${index}.txt`, `Policy ${index}: refunds within ${index + 1} days.`)),
    { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("png") },
    { name: "archive.zip", mimeType: "application/zip", buffer: Buffer.from("zip") },
    { name: "slides.pptx", mimeType: "application/octet-stream", buffer: Buffer.from("pptx") },
    { name: "README", mimeType: "text/plain", buffer: Buffer.from("no extension") },
    text("empty-1.txt", ""), text("empty-2.md", ""),
    { name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(25_000_001, 32) },
  ];
  expect(files).toHaveLength(50);
  // The picker path (the drop zone's own input); drag and drop is checked below.
  await browser.getByLabel("Choose documents").setInputFiles(files);
  const queue = browser.getByRole("list", { name: "Files being added" });
  await expect(queue.getByRole("listitem")).toHaveCount(50);
  await expect(browser.getByText("38 added · 4 already added · 8 not added")).toBeVisible({ timeout: 30_000 });
  await expect(queue.getByRole("listitem").filter({ hasText: "copy-of-1.txt" })).toContainText("The same file as another one in this batch.");
  await expect(queue.getByRole("listitem").filter({ hasText: "file-7.txt" })).toContainText("This file is already in this evaluation.");
  await expect(queue.getByRole("listitem").filter({ hasText: "photo.png" })).toContainText("Not a supported type");
  await expect(queue.getByRole("listitem").filter({ hasText: "empty-2.md" })).toContainText("This file is empty.");
  await expect(queue.getByRole("listitem").filter({ hasText: "huge.pdf" })).toContainText("Larger than 25 MB.");
  await expect(queue.getByRole("listitem").filter({ hasText: "file-9.txt" })).toContainText("The upload did not finish.");
  // Nothing invalid or duplicated reached the server.
  expect(uploads.filter((title) => !/^file-\d+\.txt$/.test(title))).toEqual([]);
  // One failure is retried on its own; the batch is unaffected.
  await browser.getByRole("button", { name: "Try again: file-9.txt" }).click();
  await expect(browser.getByText("39 added · 4 already added · 7 not added")).toBeVisible();
  await expect(browser.locator(".p-files li")).toHaveCount(39);

  // Drag and drop adds files the same way.
  const transfer = await browser.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["Shipping takes 3 days."], "shipping.md", { type: "text/markdown" }));
    data.items.add(new File(["Policy 0: refunds within 1 days."], "again.txt", { type: "text/plain" }));
    return data;
  });
  await browser.dispatchEvent(".p-drop-zone", "drop", { dataTransfer: transfer });
  await expect(queue.getByRole("listitem").filter({ hasText: "shipping.md" })).toContainText("Added");
  await expect(queue.getByRole("listitem").filter({ hasText: "again.txt" })).toContainText("Already added");
  for (const width of WIDTHS) {
    await browser.setViewportSize({ width, height: 900 });
    await noHorizontalScroll(browser, width);
  }
});

for (const width of WIDTHS) {
  test(`imports a help centre with a page list and a credit estimate at ${width}px`, async ({ page: browser }) => {
    const state: State = { sourceIds: [], preparation: "draft", reason: null, sources: {} };
    await routeBase(browser, state);
    const pages = Array.from({ length: 60 }, (_, index) => `https://help.example.test/help/article-${index}`);
    let polls = 0;
    const posted: Array<Record<string, unknown>> = [];
    await browser.route("**/api/evals/v1/sources/websites/preview", (route) => { posted.push(route.request().postDataJSON()); return json(route, { previewId: "preview-1", status: "queued", cap: 50 }); });
    await browser.route("**/api/evals/v1/sources/websites/preview/preview-1?**", (route) => json(route, {
      id: "preview-1", status: polls++ ? "ready" : "running", origin: "https://help.example.test", pathPrefix: "/help", discoveredFrom: "sitemap",
      pages: polls > 1 ? pages : [], foundTotal: 60, robotsExcluded: 2, outsidePrefix: 7, reasonCode: null, cap: 50, estimate: { creditsPerPage: "1" },
    }));
    await browser.route("**/api/evals/v1/sources/websites", (route) => { posted.push(route.request().postDataJSON()); return json(route, { sourceId: "help-source", jobId: "job-1", status: "queued", pages: 49 }); });
    await browser.setViewportSize({ width, height: 900 });
    await browser.goto(page(state));
    await browser.getByRole("button", { name: "Import help centre" }).click();
    const dialog = browser.getByRole("dialog", { name: "Import a help centre" });
    await dialog.getByLabel("Help centre or sitemap address").fill("https://help.example.test/help");
    await expect(dialog.getByLabel("Only pages under this path (optional)")).toHaveValue("/help");
    await dialog.getByRole("button", { name: "Find pages" }).click();
    await expect(dialog.getByText("60 pages found on help.example.test")).toBeVisible();
    await expect(dialog.getByText("2 left out because robots.txt asks crawlers not to read them.")).toBeVisible();
    await expect(dialog.getByText("50 of up to 50 pages selected")).toBeVisible();
    await expect(dialog.getByText("Reading 50 pages uses about 50 credits (1 per page).")).toBeVisible();
    await dialog.getByRole("checkbox", { name: "/help/article-0" }).uncheck();
    await expect(dialog.getByText("Reading 49 pages uses about 49 credits (1 per page).")).toBeVisible();
    // Over the cap, the import cannot start.
    await dialog.getByRole("checkbox", { name: "/help/article-55" }).check();
    await dialog.getByRole("checkbox", { name: "/help/article-56" }).check();
    await expect(dialog.getByText("Choose at most 50 pages.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Import 51 pages" })).toBeDisabled();
    await dialog.getByRole("checkbox", { name: "/help/article-56" }).uncheck();
    await dialog.getByRole("checkbox", { name: "/help/article-55" }).uncheck();
    await noHorizontalScroll(browser, width);
    await dialog.getByRole("button", { name: "Import 49 pages" }).click();
    await expect(dialog).toBeHidden();
    await expect(browser.locator(".p-files li").filter({ hasText: "help.example.test/help" })).toContainText("Reading 49 pages");
    expect(posted[0]).toEqual({ orgId: ORG, evaluationId: EVALUATION, url: "https://help.example.test/help", sitemapUrl: null, pathPrefix: "/help" });
    expect(posted[1]).toMatchObject({ orgId: ORG, evaluationId: EVALUATION, projectId: PROJECT, previewId: "preview-1" });
    expect((posted[1].selectedUrls as string[])).toEqual(pages.slice(1, 50));
  });
}

test("the help-centre import reads in Spanish", async ({ page: browser }) => {
  await spanish(browser);
  const state: State = { sourceIds: [], preparation: "draft", reason: null, sources: {} };
  await routeBase(browser, state);
  await browser.route("**/api/evals/v1/sources/websites/preview", (route) => json(route, { previewId: "preview-es", status: "queued", cap: 200 }));
  await browser.route("**/api/evals/v1/sources/websites/preview/preview-es?**", (route) => json(route, {
    id: "preview-es", status: "failed", origin: null, pathPrefix: null, discoveredFrom: null, pages: [], foundTotal: null, robotsExcluded: null, outsidePrefix: null,
    reasonCode: "website_robots_disallowed", cap: 200, estimate: { creditsPerPage: "1" },
  }));
  await browser.setViewportSize({ width: 390, height: 900 });
  await browser.goto(page(state));
  await browser.getByRole("button", { name: "Importar centro de ayuda" }).click();
  const dialog = browser.getByRole("dialog", { name: "Importar un centro de ayuda" });
  await dialog.getByLabel("Dirección del centro de ayuda o del sitemap").fill("https://ayuda.example.test/es/ayuda");
  await dialog.getByRole("button", { name: "Buscar páginas" }).click();
  await expect(dialog.getByText("El robots.txt del sitio no permite leer estas páginas.")).toBeVisible();
  await noHorizontalScroll(browser, 390);
});

for (const locale of ["en", "es"] as const) {
  test(`asks for a text version of a scanned PDF without blocking other sources (${locale})`, async ({ page: browser }) => {
    if (locale === "es") await spanish(browser);
    const state: State = {
      sourceIds: ["source-text", "source-mixed", "source-scan"], preparation: "draft", reason: null,
      sources: {
        "source-text": { id: "source-text", title: "policy.pdf", revisions: [{ id: "rev-text" }], ingestion: { status: "completed", source_revision_id: "rev-text", reason_code: null, scan_suspected: false }, chunks: [{ id: "c1", excerpt: "Refunds within 30 days." }] },
        "source-mixed": { id: "source-mixed", title: "mixed.pdf", revisions: [{ id: "rev-mixed" }], ingestion: { status: "completed", source_revision_id: "rev-mixed", reason_code: null, scan_suspected: true, page_count: 4, text_chars: 240, empty_pages: 3 }, chunks: [{ id: "c2", excerpt: "Cover page." }] },
        "source-scan": { id: "source-scan", title: "scan.pdf", revisions: [], ingestion: { status: "failed", source_revision_id: null, reason_code: "pdf_scanned", scan_suspected: true, page_count: 4, text_chars: 0, empty_pages: 4 }, chunks: [] },
      },
    };
    await routeBase(browser, state);
    await browser.setViewportSize({ width: 390, height: 900 });
    await browser.goto(page(state));
    const rows = browser.locator(".p-files > li");
    await expect(rows).toHaveCount(3);
    const title = locale === "es" ? "Parece un documento escaneado" : "This looks like a scanned document";
    await expect(rows.filter({ hasText: "mixed.pdf" })).toContainText(title);
    await expect(rows.filter({ hasText: "mixed.pdf" })).toContainText(locale === "es" ? "240 caracteres en 4 páginas, 3 de ellas vacías" : "240 characters on 4 pages, 3 of them empty");
    await expect(rows.filter({ hasText: "scan.pdf" })).toContainText(title);
    await expect(rows.filter({ hasText: "policy.pdf" })).not.toContainText(title);
    // The other sources are ready and the test set can still be written.
    await expect(browser.getByRole("button", { name: locale === "es" ? "Generar conjunto de pruebas" : "Generate test set" })).toBeEnabled();
    await rows.filter({ hasText: "scan.pdf" }).getByRole("button", { name: locale === "es" ? "Dejarlo fuera" : "Leave it out" }).click();
    await expect(browser.getByRole("dialog")).toBeVisible();
    for (const width of WIDTHS) {
      await browser.setViewportSize({ width, height: 900 });
      await noHorizontalScroll(browser, width);
    }
  });
}

function confirmationView() {
  const field = (confidence: number, excerpts: Array<{ sourceTitle: string; text: string }> = []) => ({ confidence, low: confidence < 0.7, excerpts });
  return {
    confirmation: { id: "confirmation-1", jobId: JOB, status: "pending", dueAt: new Date(Date.now() + 30 * 60_000).toISOString(), decidedAt: null, decidedByMe: false, editedFields: [], skipReason: null },
    context: {
      profileRevisionId: "profile-1",
      purpose: { value: "Answer customer questions about home insurance claims", ...field(0.9, [{ sourceTitle: "claims.pdf", text: "Our assistant helps policy holders report and follow claims." }]) },
      intendedUsers: { values: ["Policy holders"], ...field(0.4, [{ sourceTitle: "claims.pdf", text: "Policy holders can report a claim online." }]) },
      tasks: { values: ["Report a claim", "Check claim status"], ...field(0.8) },
      languages: { values: ["es"], ...field(0.6, [{ sourceTitle: "detected_from_sources", text: "" }]) },
      jurisdiction: { value: null, ...field(0) },
      asOf: { value: null, ...field(0) },
      boundaries: { values: ["Never promise a claim will be paid"], ...field(0.6) },
      sources: [{ revisionId: "11111111-1111-4111-8111-111111111111", title: "claims.pdf", rank: 1 }, { revisionId: "22222222-2222-4222-8222-222222222222", title: "help.example.test/help", rank: 2 }],
      conflicts: [{ field: "jurisdiction", values: ["Spain", "Portugal"], sources: ["claims.pdf", "help.example.test/help"] }],
      openQuestions: [{ field: "as_of", question: "Which date should date-sensitive answers use?", critical: false }],
    },
  };
}

async function routeConfirmation(page: Page) {
  const state: State = {
    sourceIds: ["source-a"], preparation: "needs_input", reason: "context_confirmation_required",
    sources: { "source-a": { id: "source-a", title: "claims.pdf", revisions: [{ id: "rev-a" }], ingestion: { status: "completed", source_revision_id: "rev-a", reason_code: null }, chunks: [{ id: "c", excerpt: "Claims." }] } },
    generation: { status: "needs_input", job: { id: JOB, reasonCode: "context_confirmation_required" } },
  };
  await routeBase(page, state);
  const decisions: Array<Record<string, unknown>> = [];
  await page.route(`**/api/evals/v1/evaluations/${EVALUATION}/context/confirmation**`, (route) => {
    if (route.request().method() === "POST") {
      decisions.push(route.request().postDataJSON());
      state.preparation = "generating"; state.reason = null;
      state.generation = { status: "drafting", job: { id: JOB, reasonCode: null } };
      return json(route, { status: "profile_ready", jobId: JOB, profileRevisionId: "profile-2", editedFields: ["purpose"], decision: "confirmed" });
    }
    return json(route, confirmationView());
  });
  return decisions;
}

for (const width of WIDTHS) {
  test(`shows what we understood, highlights low confidence and confirms corrections once at ${width}px`, async ({ page: browser }) => {
    const decisions = await routeConfirmation(browser);
    await browser.setViewportSize({ width, height: 900 });
    await browser.goto(page({} as State));
    const screen = browser.getByRole("region", { name: "What we understood about your assistant" });
    await expect(screen).toBeVisible();
    await expect(screen.getByText("Answer customer questions about home insurance claims")).toBeVisible();
    // Low confidence is flagged in words, not only colour.
    await expect(screen.locator(".p-ctx-row").filter({ hasText: "Who uses it" })).toContainText("Check this");
    await expect(screen.locator(".p-ctx-row").filter({ hasText: "What it is for" })).not.toContainText("Check this");
    await expect(screen.getByText("Never promise a claim will be paid")).toBeVisible();
    await expect(screen.getByText("Which date should date-sensitive answers use?")).toBeVisible();
    // Excerpts one click away.
    const users = screen.locator(".p-ctx-row").filter({ hasText: "Who uses it" });
    await users.getByRole("button", { name: "Show where this comes from" }).click();
    await expect(users.getByText("Policy holders can report a claim online.")).toBeVisible();
    // Correct one field inline, then confirm once.
    await screen.locator(".p-ctx-row").filter({ hasText: "What it is for" }).getByRole("button", { name: "Edit" }).click();
    await screen.getByLabel("What it is for", { exact: true }).fill("Help policy holders report and follow home insurance claims");
    await expect(screen.locator(".p-ctx-row").filter({ hasText: "What it is for" })).toContainText("Corrected");
    await screen.locator(".p-ctx-row").filter({ hasText: "When sources disagree" }).getByRole("button", { name: "Edit" }).click();
    await screen.getByLabel("Trust first").selectOption({ label: "help.example.test/help" });
    await noHorizontalScroll(browser, width);
    await screen.getByRole("button", { name: "Confirm and write the tests" }).click();
    await expect(screen).toBeHidden();
    expect(decisions).toEqual([{ orgId: ORG, jobId: JOB, decision: "confirm", edits: { purpose: "Help policy holders report and follow home insurance claims", primarySourceRevisionId: "22222222-2222-4222-8222-222222222222" } }]);
  });
}

test("skipping keeps the inferred context and says the report will mention it (Spanish)", async ({ page: browser }) => {
  await spanish(browser);
  const decisions = await routeConfirmation(browser);
  await browser.setViewportSize({ width: 390, height: 900 });
  await browser.goto(page({} as State));
  const screen = browser.getByRole("region", { name: "Lo que hemos entendido de tu asistente" });
  await expect(screen).toBeVisible();
  await expect(screen.getByText("Si lo omites, las pruebas usan lo que hemos entendido y el informe indica que el contexto no se confirmó.")).toBeVisible();
  await expect(screen.locator(".p-ctx-row").filter({ hasText: "Quién lo usa" })).toContainText("Revísalo");
  await noHorizontalScroll(browser, 390);
  await screen.getByRole("button", { name: "Omitir y usarlo tal cual" }).click();
  await expect(screen).toBeHidden();
  expect(decisions).toEqual([{ orgId: ORG, jobId: JOB, decision: "skip" }]);
});

test("with the flag off the Prepare page keeps today's file picker", async ({ page: browser }) => {
  const state: State = { sourceIds: [], preparation: "draft", reason: null, sources: {} };
  await routeBase(browser, state);
  await browser.goto(`/workspace/evaluations/${EVALUATION}?orgId=${ORG}&editor`);
  await expect(browser.getByRole("button", { name: "Add documents" })).toBeVisible();
  await expect(browser.getByRole("button", { name: "Import help centre" })).toHaveCount(0);
  await expect(browser.getByText("Drop files here or choose documents")).toHaveCount(0);
});
