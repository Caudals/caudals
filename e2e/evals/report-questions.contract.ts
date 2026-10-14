/**
 * UI contracts for "Ask your report" (launch L-36, spec P-58): the action in
 * the report heading, the typical cost and limits before the first question,
 * a question answered with citations that open the evidence (a result, a
 * finding), the fixed refusal with the methodology and readout links, the
 * fixed "can't answer" and failure sentences, viewers, owners deleting, the
 * feature off, and Spanish, at 390, 768 and 1440 px. Runs against the
 * isolated harness (ui.config.ts); the API is routed per test.
 */
import { expect, test, type Page } from "@playwright/test";
import { seriousAxeViolations } from "./axe";

const WIDTHS = [390, 768, 1440] as const;
const ORG = "00000000-0000-4000-8000-000000000001";
const REPORT = "00000000-0000-4000-8000-000000000301";
const REVISION = "00000000-0000-4000-8000-000000000311";
const RUN = "00000000-0000-4000-8000-000000000321";
const CREATED = "2026-10-08T10:00:00.000Z";
const Q1 = "00000000-0000-4000-8000-000000000a01";
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/** A synthetic report: one failed and one correct answer, one finding. */
function snapshot() {
  const base = { topic: "fees", review_status: "unreviewed", source_refs: [{ source_revision_id: "src-1", anchor: "a" }], graded_by: "judge", language: "en", contradictions: [], unsupported_claims: [], key_facts: [] };
  return {
    schema_version: "1.0", report_revision_id: REVISION, run_id: RUN, created_at: CREATED, content_hash: "a".repeat(64),
    system: { name: "Investment assistant", target_revision_id: "t1", purpose: "Answer customers about investment portfolios", execution_mode: "deployed_system" },
    scope: { suite_version_id: "s1", evidence_policy: "source_grounded", started_at: CREATED, finished_at: CREATED, languages: ["en"], review_status: "preliminary" },
    metrics: { n_planned: 2, n_eligible: 2, n_executed: 2, n_scorable: 2, n_pass: 1, n_partial: 0, n_fail: 1, n_unscorable: 0, n_pending: 0, n_unresolved: 0, strict_pass_rate: 0.5, rubric_score: null, assessed_coverage: 1, execution_completion: 1, pass_bounds: null, wilson_interval: null, family_cluster_interval: null, critical_unassessed: 0, headline_status: "complete" },
    findings: [{ id: "f-fees", title: "States an outdated management fee", severity: "critical", evidence_strength: "single_run", frequency_n: 1, frequency_denominator: 2, observation: "The assistant gave last year's fee.", cause_hypothesis: "An outdated fee table.", recommendation: "Replace the fee table.", assessment_ids: ["a-fee"] }],
    improvements: [], takeaways: [],
    methodology: { cef_version: "1.0", scorer_version: "grading-v2", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "Frozen suite.", exclusions: [], review_coverage: "none", cost: null, limitations: [] },
    results: [
      { ...base, case_revision_id: "c1", assessment_id: "a-fee", observation_id: "o1", title: "Management fee", severity: "critical", outcome: "fail", label: "incorrect", input: "What management fee applies under €10,000?", output: "0.60% a year.", rationale: "States 0.60% instead of 0.40%.", expected: "0.40% a year.", failure_category: "wrong_information", likely_cause: "outdated_document" },
      { ...base, case_revision_id: "c2", assessment_id: "a-min", observation_id: "o2", title: "Minimum", severity: "high", outcome: "pass", label: "correct", input: "What is the minimum to open a portfolio?", output: "€1,000.", rationale: "Correct.", expected: "€1,000." },
    ],
  };
}

type Question = Record<string, unknown>;
const answered = (overrides: Question = {}): Question => ({
  id: Q1, revisionId: REVISION, question: "Why did the fee answer fail?", language: "en", status: "answered", reason: null,
  sentences: [
    { text: "It gave 0.60% a year instead of 0.40%.", refs: [{ kind: "result", id: "a-fee", label: "T1" }] },
    { text: "The report's likely cause is an outdated fee table.", refs: [{ kind: "finding", id: "f-fees", label: "F1" }, { kind: "result", id: "a-fee", label: "T1" }] },
  ],
  credits: "1", createdAt: CREATED, finishedAt: CREATED, ...overrides,
});
function state(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true, canAsk: true, canDelete: true,
    limits: { perReportDay: 20, usedToday: 0, freeMonth: 10, usedMonth: 0, remaining: 10 },
    cost: { basis: "credits", typicalCredits: "1", maxCredits: "3", typicalEuro: "0.01" },
    questions: [] as Question[], ...overrides,
  };
}

async function routeReport(page: Page, options: { state?: ReturnType<typeof state> | null; reply?: Question; settle?: Question } = {}) {
  const calls = { posted: [] as Array<Record<string, unknown>>, deleted: [] as string[] };
  let current = options.state === undefined ? state() : options.state;
  let polls = 0;
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === `/api/evals/v1/reports/${REPORT}`) {
      return route.fulfill({ json: { data: { report: { current_revision_id: REVISION, publication_status: "published", title: "Investment assistant — October" }, revisions: [{ id: REVISION, run_id: RUN, review_status: "preliminary", created_at: CREATED, snapshot: snapshot() }] }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/questions`) {
      if (!current) return route.fulfill({ status: 404, json: { error: { code: "SCOPE_DENIED", message: "This surface is not available." } } });
      if (method === "GET") return route.fulfill({ json: { data: current, meta: {} } });
      calls.posted.push(route.request().postDataJSON());
      const created = options.reply ?? { ...answered(), status: "queued", sentences: null, credits: null, finishedAt: null, createdAt: new Date().toISOString(), question: route.request().postDataJSON().question };
      current = { ...current, questions: [...current.questions, options.settle ?? created], limits: { ...current.limits, usedToday: current.limits.usedToday + 1, usedMonth: (current.limits.usedMonth ?? 0) + 1, remaining: current.limits.remaining - 1 } };
      return route.fulfill({ json: { data: created, meta: {} } });
    }
    if (url.pathname.startsWith(`/api/evals/v1/reports/${REPORT}/questions/`)) {
      const id = url.pathname.split("/").at(-1)!;
      if (method === "DELETE") {
        calls.deleted.push(id);
        current = current && { ...current, questions: current.questions.filter((item: Question) => item.id !== id) };
        return route.fulfill({ json: { data: { id, deleted: true }, meta: {} } });
      }
      polls++;
      const settled = current?.questions.find((item: Question) => item.id === id);
      return route.fulfill({ json: { data: polls > 1 ? settled : { ...settled, status: "queued", sentences: null }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/runs/${RUN}/comparison`) return route.fulfill({ json: { data: { candidate: { runId: RUN, evaluationId: null, status: "completed", createdAt: CREATED, reportId: REPORT, score: { pass: 1, scored: 2 } }, baseline: null, comparable: false, reasons: ["no_baseline"], status: null, counts: null, changes: [], focus: [] }, meta: {} } });
    if (url.pathname.startsWith("/api/evals/v1/reports/") || url.pathname === "/api/evals/v1/runs") return route.fulfill({ json: { data: [], meta: {} } });
    return route.fallback();
  });
  return calls;
}

for (const width of WIDTHS) {
  test(`ask this report at ${width}px: cost first, then a cited answer whose citations open the evidence`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await routeReport(page, { settle: answered({ question: "Why did the fee answer fail?" }) });
    await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&questions`);
    await page.getByRole("button", { name: "Ask this report" }).click();
    const panel = page.getByRole("dialog", { name: "Ask this report" });
    await expect(panel.getByText("Answers use only this report's results, findings and method, and link to the evidence.")).toBeVisible();
    // Before the first question: what it costs, that failures are refunded, and the limits.
    await expect(panel.locator("[data-question-cost]")).toContainText("Typical cost: 1 credit per question (≈ €0.01), at most 3 credits.");
    await expect(panel.locator("[data-question-cost]")).toContainText("Only completed answers are charged. Failed and timed-out questions are refunded.");
    await expect(panel.locator("[data-question-cost]")).toContainText("0 of 10 report questions this month on the free plan.");
    await expect(panel.getByRole("heading", { name: "Ask anything this report can answer" })).toBeVisible();
    await panel.getByLabel("Your question").fill("Why did the fee answer fail?");
    await panel.getByRole("button", { name: "Ask", exact: true }).click();
    await expect.poll(() => calls.posted).toEqual([{ orgId: ORG, revisionId: REVISION, question: "Why did the fee answer fail?", locale: "en" }]);
    await expect(panel.getByText("Reading the report…")).toBeVisible();
    const answer = panel.locator("[data-answer]");
    await expect(answer.locator("p").first()).toContainText("It gave 0.60% a year instead of 0.40%.");
    await expect(answer.getByRole("button", { name: "Open result T1: What management fee applies under €10,000?" }).first()).toBeVisible();
    await expect(answer.getByRole("button", { name: "Open finding F1: States an outdated management fee" })).toBeVisible();
    await expect(answer.getByText("Charged: 1 credit")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(await seriousAxeViolations(page, { include: "[data-questions-panel]" })).toEqual([]);
    await page.screenshot({ path: `/tmp/caudals-l36-questions-${width}.png`, fullPage: false });
    // A result citation closes the panel and opens that result.
    await answer.getByRole("button", { name: /Open result T1/ }).first().click();
    await expect(panel).toBeHidden();
    await expect(page.locator("#result-question")).toContainText("What management fee applies under €10,000?");
    await expect(page).toHaveURL(/result=a-fee/);
    // A finding citation opens the Findings tab on that finding.
    await page.getByRole("button", { name: "Ask this report" }).click();
    await page.getByRole("dialog", { name: "Ask this report" }).getByRole("button", { name: /Open finding F1/ }).click();
    await expect(page.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#finding-f-fees")).toBeFocused();
  });
}

test("fixed refusal, can't-answer and failure sentences, with the methodology and readout links", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await routeReport(page, { state: state({ questions: [
    answered({ id: "00000000-0000-4000-8000-000000000a02", question: "Are we compliant with the AI Act?", status: "refused", reason: "out_of_scope_compliance", sentences: null, credits: null }),
    answered({ id: "00000000-0000-4000-8000-000000000a03", question: "What's the weather tomorrow?", status: "unanswerable", reason: "not_in_report", sentences: null, credits: null }),
    answered({ id: "00000000-0000-4000-8000-000000000a04", question: "Which answer was best?", status: "failed", reason: "service_unavailable", sentences: null, credits: null }),
    answered({ id: "00000000-0000-4000-8000-000000000a05", question: "Which answer was worst?", status: "timed_out", reason: "queue_deadline", sentences: null, credits: null }),
  ] }) });
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&questions`);
  await page.getByRole("button", { name: "Ask this report" }).click();
  const panel = page.getByRole("dialog", { name: "Ask this report" });
  const refused = panel.locator('[data-fixed="refused"]');
  await expect(refused).toContainText("I can only answer questions about this report's results, findings and method.");
  await expect(refused.getByRole("link", { name: "How we evaluate" })).toHaveAttribute("href", /\/en\/methodology$/);
  await expect(refused.getByRole("link", { name: "Book a readout" })).toHaveAttribute("href", /cal\.com\/caudals\/call/);
  await expect(panel.locator('[data-fixed="unanswerable"]')).toHaveText("I can't answer that from this report.");
  await expect(panel.locator('[data-fixed="failed"]')).toHaveText("We couldn't answer this question. You haven't been charged.");
  await expect(panel.locator('[data-fixed="timed_out"]')).toHaveText("The model didn't answer in time. You haven't been charged.");
  // The words never appear in what the panel answers.
  for (const text of await panel.locator(".p-qa-answer").allInnerTexts()) expect(text).not.toMatch(/complian|certif/i);
});

test("owners delete a question; viewers read without asking; the feature off hides the action", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const calls = await routeReport(page, { state: state({ questions: [answered()] }) });
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&questions`);
  await page.getByRole("button", { name: "Ask this report" }).click();
  const panel = page.getByRole("dialog", { name: "Ask this report" });
  await panel.getByRole("button", { name: "Delete question" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this question?" });
  await expect(confirm.getByText("Credits already charged are not refunded.", { exact: false })).toBeVisible();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => calls.deleted).toEqual([Q1]);
  await expect(page.getByText("Question deleted.")).toBeVisible();

  const viewer = await page.context().newPage();
  await viewer.setViewportSize({ width: 390, height: 900 });
  await routeReport(viewer, { state: state({ canAsk: false, canDelete: false, questions: [answered()] }) });
  await viewer.goto(`/workspace/reports/actions?orgId=${ORG}&viewer&questions`);
  await viewer.getByRole("button", { name: "Ask this report" }).click();
  const read = viewer.getByRole("dialog", { name: "Ask this report" });
  await expect(read.locator("[data-answer]")).toContainText("It gave 0.60% a year instead of 0.40%.");
  await expect(read.getByLabel("Your question")).toHaveCount(0);
  await expect(read.getByRole("button", { name: "Delete question" })).toHaveCount(0);
  await expect(read.getByText("Viewers can read questions and answers. Owners and editors can ask.")).toBeVisible();
  expect(await noHorizontalScroll(viewer)).toBe(true);

  const off = await page.context().newPage();
  await routeReport(off, { state: null });
  await off.goto(`/workspace/reports/actions?orgId=${ORG}&owner&questions`);
  await expect(off.getByRole("heading", { name: "Investment assistant" })).toBeVisible();
  await expect(off.getByRole("button", { name: "Ask this report" })).toHaveCount(0);
});

test("the daily limit closes the field with its reason", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await routeReport(page, { state: state({ limits: { perReportDay: 20, usedToday: 20, freeMonth: null, usedMonth: null, remaining: 0 }, cost: { basis: "contract", typicalCredits: null, maxCredits: null, typicalEuro: null } }) });
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&questions`);
  await page.getByRole("button", { name: "Ask this report" }).click();
  const panel = page.getByRole("dialog", { name: "Ask this report" });
  await expect(panel.getByText("You've asked 20 questions about this report today. Try again tomorrow.")).toBeVisible();
  await expect(panel.getByLabel("Your question")).toBeDisabled();
  await expect(panel.locator("[data-question-cost]")).toContainText("Questions are included in your contract.");
  await expect(panel.locator("[data-question-cost]")).toContainText("20 of 20 questions about this report today.");
});

for (const width of [390, 1440] as const) {
  test(`Spanish at ${width}px: the panel in Spanish, each answer in the language of its question`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
    await routeReport(page, { state: state({ questions: [
      answered({ question: "¿Por qué falló la respuesta sobre la comisión?", language: "es", sentences: [{ text: "Dio un 0,60 % anual en lugar del 0,40 %.", refs: [{ kind: "result", id: "a-fee", label: "T1" }] }] }),
      answered({ id: "00000000-0000-4000-8000-000000000a06", question: "¿Somos conformes con la normativa?", language: "es", status: "refused", reason: "out_of_scope_compliance", sentences: null, credits: null }),
      answered({ id: "00000000-0000-4000-8000-000000000a07", question: "What is the weather?", language: "en", status: "unanswerable", reason: "not_in_report", sentences: null, credits: null }),
    ] }) });
    await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&questions`);
    await page.getByRole("button", { name: "Pregunta a tu informe" }).click();
    const panel = page.getByRole("dialog", { name: "Pregunta a tu informe" });
    await expect(panel.locator("[data-question-cost]")).toContainText("Coste habitual: 1 crédito por pregunta (≈ 0,01 €), como máximo 3 créditos.");
    await expect(panel.locator("[data-answer]")).toContainText("Dio un 0,60 % anual en lugar del 0,40 %.");
    await expect(panel.getByRole("button", { name: "Abrir el resultado T1: What management fee applies under €10,000?" })).toBeVisible();
    await expect(panel.getByText("Cobrado: 1 crédito")).toBeVisible();
    await expect(panel.locator('[data-fixed="refused"]')).toContainText("Solo puedo responder preguntas sobre los resultados, hallazgos y método de este informe.");
    await expect(panel.locator('[data-fixed="refused"]').getByRole("link", { name: "Cómo evaluamos" })).toHaveAttribute("href", /\/es\//);
    // A question asked in English is answered in English, whatever the interface language.
    await expect(panel.locator('[data-fixed="unanswerable"]')).toHaveText("I can't answer that from this report.");
    await expect(panel.getByLabel("Tu pregunta")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l36-questions-es-${width}.png`, fullPage: false });
  });
}
