/**
 * The report on a phone and its states (launch UI review R2): at 390 px the
 * owner's and operator's action row wraps instead of widening the canvas, the
 * result evidence view and its navigation fit in Spanish, the results and the
 * reports list become blocks instead of clipped tables, the shared-view
 * preview fits its panel, the verdict comes before the run comparison, and a
 * withdrawn report says so and offers no next steps. Runs against the
 * isolated harness (ui.config.ts).
 */
import { expect, test, type Page } from "@playwright/test";

const ORG = "00000000-0000-4000-8000-000000000001";
const REPORT = "00000000-0000-4000-8000-000000000301";
const REVISION = "00000000-0000-4000-8000-000000000311";
const RUN = "00000000-0000-4000-8000-000000000321";
const CREATED = "2026-10-08T10:00:00.000Z";

/** A preliminary, incomplete report; one result still waits for its grade. Synthetic. */
function snapshot() {
  const base = { topic: "fees_and_charges", review_status: "unreviewed", source_refs: [{ source_revision_id: "src-1", anchor: "a" }], graded_by: "judge", language: "en", contradictions: [], unsupported_claims: [], key_facts: [] };
  const excerpt = [{ source_revision_id: "src-1", anchor: "a", title: "Fees and charges 2026", excerpt: "Management fee: 0.40% a year." }];
  const result = (n: number, fields: Record<string, unknown>) => ({ ...base, case_revision_id: `case-${n}`, assessment_id: `a${n}`, observation_id: `o${n}`, source_excerpts: excerpt, ...fields });
  return {
    schema_version: "1.0", report_revision_id: REVISION, run_id: RUN, created_at: CREATED, content_hash: "a".repeat(64),
    system: { name: "Investment assistant", target_revision_id: "t1", purpose: "Answer customers about investment portfolios", execution_mode: "deployed_system" },
    scope: { suite_version_id: "s1", evidence_policy: "source_grounded", started_at: CREATED, finished_at: CREATED, languages: ["en"], review_status: "preliminary" },
    metrics: { n_planned: 4, n_eligible: 4, n_executed: 4, n_scorable: 3, n_pass: 1, n_partial: 0, n_fail: 2, n_unscorable: 1, n_pending: 0, n_unresolved: 1, strict_pass_rate: 1 / 3, rubric_score: null, assessed_coverage: 0.75, execution_completion: 1, pass_bounds: null, wilson_interval: { low: 0.061, high: 0.792 }, family_cluster_interval: null, critical_unassessed: 0, headline_status: "incomplete" },
    findings: [], improvements: [], takeaways: [],
    methodology: { cef_version: "1.0", scorer_version: "grading-v2", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "Frozen suite membership; no post-result selection.", exclusions: [], review_coverage: "Automated preliminary assessment; critical and disputed results require review.", cost: null, limitations: [] },
    results: [
      result(1, { title: "Minimum", topic: "account_opening", severity: "high", outcome: "pass", label: "correct", input: "What is the minimum to open a portfolio?", output: "€1,000.", rationale: "Correct.", expected: "€1,000." }),
      result(2, { title: "Management fee", severity: "critical", outcome: "fail", label: "incorrect", input: "Using policy A, calculate the total for a subtotal of EUR 123.45. Return the amount and currency.", output: "0.60% a year.", rationale: "States 0.60% instead of 0.40%.", expected: "0.40% a year.", failure_category: "wrong_information", likely_cause: "outdated_document" }),
      result(3, { title: "Custody fee", severity: "high", outcome: "fail", label: "incorrect", input: "Is there a custody fee?", output: "Yes, 0.15%.", rationale: "There is no custody fee.", expected: "No custody fee.", failure_category: "wrong_information", likely_cause: "outdated_document" }),
      result(4, { title: "Statistics", severity: "medium", outcome: "unscorable", label: "pending", input: "Which historical data does the statistics page offer?", output: "Returns and composition.", rationale: "Waiting for the answer judge.", expected: "Returns" }),
    ],
  };
}

async function routeReport(page: Page, status = "published") {
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/evals/v1/reports/${REPORT}`)
      return route.fulfill({ json: { data: { report: { current_revision_id: REVISION, publication_status: status, title: "Investment assistant — October" }, revisions: [{ id: REVISION, run_id: RUN, review_status: "preliminary", created_at: CREATED, snapshot: snapshot() }] }, meta: {} } });
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/questions`)
      return route.fulfill({ json: { data: { enabled: true, canAsk: true, canDelete: true, limits: { perReportDay: 20, usedToday: 0, freeMonth: 10, usedMonth: 0, remaining: 10 }, cost: { basis: "contract" }, questions: [] }, meta: {} } });
    // The run before this one scored 1 of 1; this one is compared with it.
    if (url.pathname === `/api/evals/v1/runs/${RUN}/comparison`)
      return route.fulfill({ json: { data: { candidate: { runId: RUN, evaluationId: "00000000-0000-4000-8000-000000000351", status: "completed", createdAt: CREATED, reportId: REPORT, score: { pass: 0, scored: 0 } },
        baseline: { runId: "00000000-0000-4000-8000-000000000322", evaluationId: "00000000-0000-4000-8000-000000000351", status: "completed", createdAt: "2026-10-01T10:00:00.000Z", reportId: null, score: { pass: 1, scored: 1 } },
        comparable: true, reasons: [], status: "unchanged", counts: { improved: 0, regressed: 0, unchanged: 0, unassessed: 1 }, changes: [], focus: [] }, meta: {} } });
    if (url.pathname.endsWith("/workspace/summary"))
      return route.fulfill({ json: { data: {
        evaluations: [], systems: [], usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
        entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: true },
        reports: [0, 1, 2].map((i) => ({ id: `00000000-0000-4000-8000-00000000040${i}`, title: `Synthetic policy A chatbot evaluation ${i + 1}`, current_revision_id: `00000000-0000-4000-8000-00000000041${i}`, evaluation_id: null, system_name: "Caudals protected synthetic chatbot", strict_pass_rate: i === 1 ? null : 0.75, n_pass: 3, n_scorable: 4, review_status: "preliminary", headline_status: i === 1 ? "incomplete" : "complete", revision_created_at: CREATED })),
      }, meta: {} } });
    if (url.pathname.startsWith("/api/evals/v1/reports/") || url.pathname === "/api/evals/v1/runs") return route.fulfill({ json: { data: [], meta: {} } });
    return route.fallback();
  });
}

/** How far the content runs past the right edge: the canvas scrolls inside the shell, so the document alone would hide it. */
const overflow = (page: Page, selector = ".p-canvas") => page.evaluate((target) => {
  const element = document.querySelector(target);
  return Math.max(document.documentElement.scrollWidth - innerWidth, element ? element.scrollWidth - element.clientWidth : 0);
}, selector);
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });

test("at 390 px the operator's report fits: the action row wraps, the verdict comes before the comparison", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await spanish(page);
  await routeReport(page);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&mode=operators&questions`);
  const actions = page.locator(".p-report > .p-head .p-head-actions");
  await expect(actions.getByRole("link", { name: "Presentar" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Pregunta a tu informe" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Compartir" })).toBeVisible();
  expect(await overflow(page)).toBe(0);
  // The actions sit under the title and inside the canvas.
  const [title, row] = [await page.locator(".p-report h1").boundingBox(), await actions.boundingBox()];
  expect(row!.y).toBeGreaterThan(title!.y + title!.height - 1);
  expect(row!.x + row!.width).toBeLessThanOrEqual(390);
  // Verdict first: the score, then the comparison with the previous run, which says plainly that this run has no score.
  const [score, comparison] = [await page.locator(".p-scoreboard").boundingBox(), await page.locator(".p-report-intro").boundingBox()];
  expect(score!.y).toBeLessThan(comparison!.y);
  await expect(page.getByTestId("comparison-score")).toHaveText("Sin puntuación en esta ejecución; antes 100 %.");
  await expect(page.locator("[data-sample]")).toHaveText("Muestra: 3 respuestas puntuadas de 4 preguntas.");
  await expect(page.locator(".p-scoreboard-caption")).toHaveText("Intervalo del 95 %: 6 %–79 %");
  // Topics read as words, never as codes.
  await expect(page.locator(".p-stacks-label").first()).toHaveText("Fees and charges");
});

test("at 390 px the results are blocks and the evidence view fits, in Spanish", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await spanish(page);
  await routeReport(page);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&mode=operators&tab=results`);
  const row = page.locator(".p-table tbody tr").filter({ hasText: "custody fee" });
  await expect(row).toBeVisible();
  await expect(row.locator("td[data-label]")).toHaveText("Alta");
  expect(await overflow(page)).toBe(0);
  expect(await overflow(page, ".p-table-wrap")).toBe(0);
  // The pending result's engine sentence is in Spanish (engineText), in its row and in its evidence view.
  await expect(page.locator(".p-table tbody tr").filter({ hasText: "statistics page" })).toContainText("Esperando al juez de respuestas.");
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&mode=operators&tab=results&result=a4`);
  await expect(page.locator(".p-verdict")).toContainText("Esperando al juez de respuestas.");
  await expect(page.locator(".p-verdict")).not.toContainText("Waiting for the answer judge");

  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&mode=operators&tab=results&result=a2`);
  await expect(page.getByRole("heading", { name: /Using policy A/ })).toBeVisible();
  for (const name of ["Todos los resultados", "Copiar pregunta", "Resultado siguiente"]) {
    const box = await page.locator(".p-review-nav").getByRole("button", { name }).boundingBox();
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(390);
  }
  expect(await overflow(page)).toBe(0);
});

test("at 390 px the reports list stacks and the shared-view preview fits its panel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeReport(page);
  await page.goto(`/workspace/reports?orgId=${ORG}&owner`);
  const first = page.locator(".p-table tbody tr").first();
  await expect(first.getByRole("button", { name: /More actions/ })).toBeVisible();
  expect(await overflow(page)).toBe(0);
  expect(await overflow(page, ".p-table-wrap")).toBe(0);

  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
  await page.locator("[data-summary]").getByRole("button", { name: "Share" }).click();
  await page.getByRole("button", { name: "Preview shared view" }).click();
  const report = page.getByRole("dialog", { name: "Shared view preview" }).locator(".p-report");
  await expect(report.locator("h1")).toHaveText("Investment assistant");
  const box = await report.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test("a withdrawn report says so first and offers no next steps", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeReport(page, "withdrawn");
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&mode=operators&questions`);
  await expect(page.getByText("This report was withdrawn and no longer stands. Don't share it or act on its results.")).toBeVisible();
  await expect(page.locator(".p-head-meta").getByText("Withdrawn")).toBeVisible();
  await expect(page.locator("[data-summary]")).toBeVisible();
  await expect(page.getByRole("group", { name: "Next steps" })).toHaveCount(0);
  for (const name of ["Share", "Ask this report"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Present" })).toHaveCount(0);
});

test("on a phone the presenter view drops the key list and keeps the notes large", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/example/present?owner&view=presenter`);
  await expect(page.locator("[data-notes]")).toBeVisible();
  await expect(page.locator(".p-readout-keys")).toBeHidden();
  expect(await page.locator("[data-notes]").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(20);
});
