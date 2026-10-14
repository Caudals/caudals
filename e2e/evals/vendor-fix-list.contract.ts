/**
 * UI contracts for "Send to my vendor" (launch P-54): the owner's button
 * beside "Fix these first", its dialog (what the vendor sees and does not,
 * expiry presets, open counts, revocation, a preview of the vendor's page)
 * and the vendor's Paper page (what this is, the fixes with their evidence,
 * hypotheses labelled, downloads, the partner programme invitation with the
 * referral), at 390 and 1440 px in English and Spanish. Runs against the
 * isolated harness (ui.config.ts).
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { seriousAxeViolations } from "./axe";
import { expectSpanishOnly } from "./spanish-leaks";
import { projectFixList } from "../../lib/evals/reports/fix-list-share";
import type { ReportSnapshot } from "../../lib/evals/reports/contracts";

const ORG = "00000000-0000-4000-8000-000000000001";
const REPORT = "00000000-0000-4000-8000-000000000301";
const REVISION = "00000000-0000-4000-8000-000000000311";
const RUN = "00000000-0000-4000-8000-000000000321";
const TOKEN = "V".repeat(43);
const CREATED = "2026-10-08T10:00:00.000Z";
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/** A preliminary report with three fixes, a passing answer and an unscored one. Synthetic. */
function snapshot(): ReportSnapshot {
  const faq = "Investment FAQ", fees = "Fees and charges 2026";
  const excerpt = (title: string | null, text: string) => [{ source_revision_id: "src-1", anchor: "a", title, excerpt: text }];
  const base = { topic: "fees", review_status: "unreviewed", source_refs: [{ source_revision_id: "src-1", anchor: "a" }], graded_by: "judge" as const, language: "en", contradictions: [], unsupported_claims: [], key_facts: [] };
  const result = (n: number, fields: Record<string, unknown>) => ({ ...base, case_revision_id: `case-${n}`, assessment_id: `a${n}`, observation_id: `obs-${n}`, ...fields }) as unknown as ReportSnapshot["results"][number];
  return {
    schema_version: "1.0", report_revision_id: REVISION, run_id: RUN, created_at: CREATED, content_hash: "a".repeat(64),
    system: { name: "Investment assistant", target_revision_id: "t1", purpose: "Answer customers about investment portfolios", execution_mode: "deployed_system" },
    scope: { suite_version_id: "s1", evidence_policy: "source_grounded", started_at: CREATED, finished_at: CREATED, languages: ["en"], review_status: "preliminary" },
    metrics: { n_planned: 7, n_eligible: 7, n_executed: 7, n_scorable: 6, n_pass: 2, n_partial: 1, n_fail: 3, n_unscorable: 1, n_pending: 0, n_unresolved: 1, strict_pass_rate: 2 / 6, rubric_score: null, assessed_coverage: 6 / 7, execution_completion: 1, pass_bounds: null, wilson_interval: null, family_cluster_interval: null, critical_unassessed: 0, headline_status: "complete" },
    findings: [], improvements: [], takeaways: [],
    methodology: { cef_version: "1.0", scorer_version: "grading-v2", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "Frozen suite membership.", exclusions: [], review_coverage: "none", cost: null, limitations: [] },
    results: [
      result(1, { title: "Minimum", severity: "high", outcome: "pass", label: "correct", input: "What is the minimum to open a portfolio?", output: "€1,000.", rationale: "Correct.", expected: "€1,000.", source_excerpts: excerpt(faq, "The minimum is €1,000.") }),
      result(3, { title: "Contributions", severity: "medium", outcome: "partial", label: "partially_correct", input: "How often can I schedule contributions?", output: "Monthly.", rationale: "Leaves out quarterly and yearly.", expected: "Monthly, quarterly or yearly.", failure_category: "missing_information", likely_cause: "knowledge_gap", key_facts: [{ fact: "quarterly or yearly", status: "missing" }], source_excerpts: excerpt(faq, "Monthly, quarterly or yearly.") }),
      result(4, { title: "Management fee", severity: "critical", outcome: "fail", label: "incorrect", input: "What management fee applies under €10,000?", output: "0.60% a year.", rationale: "States 0.60% instead of 0.40%.", expected: "0.40% a year.", failure_category: "wrong_information", likely_cause: "outdated_document", contradictions: ["Says 0.60% where the fee table says 0.40%."], source_excerpts: excerpt(fees, "Management fee: 0.40% a year up to €10,000.") }),
      result(5, { title: "Custody fee", severity: "high", outcome: "fail", label: "incorrect", input: "Is there a custody fee?", output: "Yes, 0.15%.", rationale: "There is no custody fee.", expected: "No custody fee.", failure_category: "wrong_information", likely_cause: "outdated_document", source_excerpts: excerpt(fees, "No custody fee.") }),
      result(6, { title: "Instalments", severity: "medium", outcome: "fail", label: "not_answered", input: "In how many instalments can I pay?", output: "Could you rephrase that?", rationale: "Asks to rephrase without answering.", expected: "12 instalments.", failure_category: "no_answer", source_excerpts: excerpt(null, "Pay in 12 instalments.") }),
      result(7, { title: "Statistics", severity: "low", outcome: "unscorable", label: "test_issue", input: "Which historical data does the statistics page offer?", output: "Returns and composition.", rationale: "The expected answer is a table header.", expected: "Service" }),
      result(8, { title: "Transfers", severity: "low", outcome: "pass", label: "correct", input: "Can I transfer an existing fund?", output: "Yes.", rationale: "Correct.", expected: "Yes.", source_excerpts: excerpt(faq, "Transfers are accepted.") }),
    ],
  };
}
const FIX_TITLES = {
  en: ["Update the outdated content behind “Fees and charges 2026”", "Give the assistant the content of “Investment FAQ”", "Answer instead of deflecting"],
  es: ["Actualiza el contenido desactualizado de «Fees and charges 2026»", "Da al asistente el contenido de «Investment FAQ»", "Responde en lugar de desviar la pregunta"],
};

/** The vendor page's exchange: the fix-list projection the server returns, or another answer. */
async function routeVendor(page: Page, locale: "en" | "es", reply?: { status?: number; json: unknown }) {
  if (locale === "es") await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  const exchanges: unknown[] = [];
  await page.route("**/api/evals/v1/share/exchange", (route) => {
    exchanges.push(route.request().postDataJSON());
    return route.fulfill(reply ?? { json: { data: projectFixList(snapshot()), meta: { request_id: "r", share: { label: null, scope: "fix_list", expiresAt: "2026-11-07T10:00:00.000Z" }, referral: "sr-0123456789ab" } } });
  });
  return exchanges;
}

for (const width of [390, 1440] as const) {
  for (const locale of ["en", "es"] as const) {
    test(`the vendor's fix list at ${width}px (${locale}) explains itself and shows only the fixes and their evidence`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const exchanges = await routeVendor(page, locale);
      await page.goto(`/share/fixes#token=${TOKEN}`);
      const intro = page.locator("[data-vendor-intro]");
      await expect(intro.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "What to fix in Investment assistant" : "Qué corregir en Investment assistant");
      await expect(intro).toContainText(locale === "en" ? "sent you the problems to fix first" : "te envía los problemas que conviene corregir primero");
      await expect(intro).toContainText(locale === "en" ? "Likely causes are hypotheses" : "Las causas probables son hipótesis");
      await expect(intro).toContainText(locale === "en" ? "not the full report" : "no el informe completo");
      await expect(intro.locator("[data-fix-count]")).toHaveText("3");
      await expect(intro.locator("[data-answer-count]")).toHaveText("4");
      await expect(intro.getByRole("link", { name: locale === "en" ? "How Caudals grades answers" : /Caudals/ })).toHaveAttribute("href", locale === "en" ? "https://caudals.com/en/methodology" : "https://caudals.com/es/metodologia");
      expect(exchanges).toEqual([{ token: TOKEN }]);
      // The token never stays in the address bar.
      expect(page.url()).not.toContain(TOKEN);

      const fixes = page.locator("[data-vendor-fixes] [data-fix]");
      await expect(fixes.locator("h3")).toHaveText(FIX_TITLES[locale]);
      await expect(fixes.first().locator("[data-basis]")).toHaveText(locale === "en" ? "Likely cause (hypothesis): outdated document" : /hipótesis/);
      await expect(fixes.first()).toContainText(locale === "en" ? "1 critical" : "1 crítica");
      // Evidence: each fix's answers, opened one at a time.
      await expect(page.locator("[data-evidence]")).toHaveCount(4);
      const first = fixes.first().locator("[data-evidence]").first();
      await first.locator("summary").click();
      await expect(first).toContainText("0.60% a year.");
      await expect(first).toContainText("0.40% a year.");
      await expect(first).toContainText("Management fee: 0.40% a year up to €10,000.");
      await expect(first).toContainText("Fees and charges 2026");
      await expect(first).toContainText("Says 0.60% where the fee table says 0.40%.");

      // Nothing else of the report: no score, no passing or unscored answer, no summary.
      const text = await page.locator("main").innerText();
      for (const absent of ["What is the minimum to open a portfolio?", "Can I transfer an existing fund?", "Which historical data", "33%", "Executive summary", "Resumen ejecutivo", "Methodology"]) expect(text).not.toContain(absent);

      // The partner programme invitation carries the sharing workspace's referral.
      const cta = page.locator("[data-vendor-cta]");
      await expect(cta.getByRole("heading")).toHaveText(locale === "en" ? "Build assistants for your clients?" : "¿Desarrollas asistentes para tus clientes?");
      await expect(cta.getByRole("link", { name: locale === "en" ? "Test an assistant free" : "Prueba gratis un asistente" })).toHaveAttribute("href", `https://caudals.com/${locale}/demo?utm_source=vendor_fix_list&utm_medium=referral&utm_campaign=partner_programme&ref=sr-0123456789ab`);
      await expect(cta.getByRole("link", { name: locale === "en" ? "Ask about the partner programme" : "Pregunta por el programa de partners" })).toHaveAttribute("href", `https://caudals.com/${locale === "en" ? "en/contact" : "es/contacto"}?offer=not-sure&utm_source=vendor_fix_list&utm_medium=referral&utm_campaign=partner_programme&ref=sr-0123456789ab`);
      expect(await noHorizontalScroll(page)).toBe(true);
      // No English interface copy on the Spanish page (launch L-23); the fixture's answers are content.
      if (locale === "es") await expectSpanishOnly(page, "vendor fix list");
      await page.screenshot({ path: `/tmp/caudals-p54-vendor-${width}-${locale}.png`, fullPage: true });
    });
  }
}

test("the vendor downloads the fix list as Markdown and CSV", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeVendor(page, "en");
  await page.goto(`/share/fixes#token=${TOKEN}`);
  const intro = page.locator("[data-vendor-intro]");
  const [markdown] = await Promise.all([page.waitForEvent("download"), intro.getByRole("button", { name: "Download Markdown" }).click()]);
  expect(markdown.suggestedFilename()).toBe("Caudals-Investment-assistant-fixes-2026-10-08.md");
  const md = await readFile((await markdown.path())!, "utf8");
  expect(md).toContain("## 1. Update the outdated content behind “Fees and charges 2026”");
  expect(md).toContain("Likely cause (hypothesis): outdated document");
  expect(md).not.toContain("What is the minimum to open a portfolio?");
  const [csv] = await Promise.all([page.waitForEvent("download"), intro.getByRole("button", { name: "Download CSV" }).click()]);
  expect(csv.suggestedFilename()).toBe("Caudals-Investment-assistant-fixes-2026-10-08.csv");
  const rows = (await readFile((await csv.path())!, "utf8")).trim().split("\r\n");
  expect(rows[0]).toBe("fix,fix_title,likely_cause_hypothesis,problem,source,severity,what_to_do,result,question,answer,expected_answer,why,assessment_id,case_revision_id");
  expect(rows).toHaveLength(5);
});

test("an invalid, expired or revoked link says so", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await routeVendor(page, "es", { status: 404, json: { error: { code: "SHARE_UNAVAILABLE" } } });
  await page.goto(`/share/fixes#token=${TOKEN}`);
  await expect(page.getByRole("alert")).toContainText("Lista de correcciones no disponible");
  await expect(page.locator("[data-vendor-fixes]")).toHaveCount(0);
});

test("each link opens on its own page: a fix list leaves /share, a report leaves /share/fixes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let fixList = true;
  await page.route("**/api/evals/v1/share/exchange", (route) => route.fulfill({ json: fixList
    ? { data: projectFixList(snapshot()), meta: { request_id: "r", share: { label: null, scope: "fix_list", expiresAt: null }, referral: "sr-0123456789ab" } }
    : { data: Object.fromEntries(Object.entries(snapshot()).filter(([key]) => !["results", "findings"].includes(key))), meta: { request_id: "r", share: { label: null, scope: "report", expiresAt: null }, referral: "sr-0123456789ab" } } }));
  await page.goto(`/share#token=${TOKEN}`);
  await expect(page).toHaveURL(/\/share\/fixes$/);
  await expect(page.locator("[data-vendor-fixes] [data-fix]")).toHaveCount(3);
  fixList = false;
  // A fresh document: the same path with a new fragment would not reload the page.
  await page.goto("about:blank");
  await page.goto(`/share/fixes#token=${TOKEN}`);
  await expect(page).toHaveURL(/\/share$/);
  await expect(page.locator("[data-share-intro]")).toBeVisible();
});

/* --------------------------------------------------------- owner side --- */

async function routeReport(page: Page, shares: Array<Record<string, unknown>> = []) {
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === `/api/evals/v1/reports/${REPORT}`) {
      return route.fulfill({ json: { data: { report: { current_revision_id: REVISION, publication_status: "published", title: "Investment assistant — October" }, revisions: [{ id: REVISION, run_id: RUN, review_status: "preliminary", created_at: CREATED, snapshot: snapshot() }] }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/shares`) {
      if (method === "GET") return route.fulfill({ json: { data: shares, meta: {} } });
      calls.push({ method, path: url.pathname, body: route.request().postDataJSON() });
      return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000361", token: TOKEN }, meta: {} } });
    }
    if (url.pathname.startsWith("/api/evals/v1/shares/") && method === "DELETE") {
      calls.push({ method, path: url.pathname });
      return route.fulfill({ json: { data: { id: url.pathname.split("/").at(-1), revoked_at: CREATED }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/runs/${RUN}/comparison`) return route.fulfill({ json: { data: { candidate: { runId: RUN, evaluationId: null, status: "completed", createdAt: CREATED, reportId: REPORT, score: { pass: 2, scored: 6 } }, baseline: null, comparable: false, reasons: ["no_baseline"], status: null, counts: null, changes: [], focus: [] }, meta: {} } });
    if (url.pathname.startsWith("/api/evals/v1/reports/") || url.pathname === "/api/evals/v1/runs") return route.fulfill({ json: { data: [], meta: {} } });
    return route.fallback();
  });
  return calls;
}
const VENDOR_LINKS = [
  { id: "00000000-0000-4000-8000-000000000371", report_revision_id: REVISION, audience: "bearer", recipient: null, permitted_fields: ["fix_list"], expires_at: "2026-11-07T10:00:00Z", revoked_at: null, access_count: 2, open_count: 2, last_opened_at: "2026-10-11T09:00:00Z" },
  { id: "00000000-0000-4000-8000-000000000372", report_revision_id: REVISION, audience: "bearer", recipient: null, permitted_fields: ["system", "metrics"], expires_at: "2026-11-07T10:00:00Z", revoked_at: null, access_count: 0, open_count: 0, last_opened_at: null },
];

for (const width of [390, 1440] as const) {
  test(`the owner sends the fix list to a vendor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await routeReport(page, VENDOR_LINKS);
    await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
    const fixes = page.locator("[data-fixes]");
    await fixes.getByRole("button", { name: "Send to my vendor" }).click();
    const dialog = page.getByRole("dialog", { name: "Send the fix list to your vendor" });
    await expect(dialog).toContainText("3 fixes and the answers behind them (4 answers)");
    await expect(dialog).toContainText("Your score, your other answers, the findings, the methodology");
    await expect(dialog).toContainText("partner programme");
    const presets = dialog.getByRole("group", { name: "Link expires after" });
    await expect(presets.getByRole("button")).toHaveText(["7 days", "30 days", "90 days"]);
    await expect(presets.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    // Only fix-list links are listed here, with how often each was opened.
    const links = dialog.locator("[data-vendor-link]");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText(/Opened 2 times, last on/);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-p54-owner-dialog-${width}.png` });

    // The preview is the vendor's page, without the score.
    await dialog.getByRole("button", { name: "Preview what your vendor sees" }).click();
    const preview = page.locator("[data-vendor-preview]");
    await expect(preview.locator("[data-fix] h3")).toHaveText(FIX_TITLES.en);
    await expect(preview).not.toContainText("What is the minimum to open a portfolio?");
    await page.keyboard.press("Escape");

    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Revoke" }).click();
    await expect.poll(() => calls.find((call) => call.method === "DELETE")?.path).toBe("/api/evals/v1/shares/00000000-0000-4000-8000-000000000371");

    const before = Date.now();
    await dialog.getByRole("button", { name: "Create link" }).click();
    const ready = page.getByRole("dialog", { name: "Link ready" });
    await expect(ready.getByLabel("Private link")).toHaveValue(new RegExp(`/share/fixes#token=${TOKEN}$`));
    const posted = calls.find((call) => call.method === "POST")!.body!;
    expect(posted).toMatchObject({ orgId: ORG, reportRevisionId: REVISION, audience: "bearer", permittedFields: ["fix_list"] });
    expect(posted.recipient).toBeUndefined();
    const days = (Date.parse(String(posted.expiresAt)) - before) / 86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);
    await page.screenshot({ path: `/tmp/caudals-p54-owner-${width}.png`, fullPage: true });
  });
}

test("the report's share list names fix-list links, and the owner's Spanish button and dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await routeReport(page, VENDOR_LINKS);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
  await page.locator("[data-fixes]").getByRole("button", { name: "Enviar a mi proveedor" }).click();
  const dialog = page.getByRole("dialog", { name: "Envía la lista de correcciones a tu proveedor" });
  await expect(dialog).toContainText("3 correcciones y las respuestas en que se basan (4 respuestas)");
  await expectSpanishOnly(page, "send to my vendor dialog");
  await dialog.getByRole("button", { name: "Ver lo que verá tu proveedor" }).click();
  await expect(page.locator("[data-vendor-preview] [data-fix] h3")).toHaveText(FIX_TITLES.es);
  await expectSpanishOnly(page, "vendor preview");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.locator(".p-head-actions").getByRole("button", { name: "Compartir" }).click();
  await expect(page.getByRole("dialog").getByText("Solo la lista de correcciones")).toBeVisible();
});

test("only owners see Send to my vendor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeReport(page);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&editor`);
  await expect(page.locator("[data-fixes]").getByRole("heading", { name: "Fix these first" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to my vendor" })).toHaveCount(0);
});

test("the vendor's page and the owner's dialog have no serious accessibility violations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await routeVendor(page, "en");
  await page.goto(`/share/fixes#token=${TOKEN}`);
  await page.locator("[data-evidence] summary").first().click();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.unrouteAll();
  await routeReport(page, VENDOR_LINKS);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
  await page.locator("[data-fixes]").getByRole("button", { name: "Send to my vendor" }).click();
  await expect(page.getByRole("dialog", { name: "Send the fix list to your vendor" })).toBeVisible();
  expect(await seriousAxeViolations(page, { include: "[role=dialog]" })).toEqual([]);
});
