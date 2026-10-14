import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * Launch L-18 UI contracts (spec v2 P-19, P-24, P-25, §6.7, §6.10):
 * Settings → Monitoring on credits (weekly or monthly, the estimate per run
 * and per month, the schedule's credit limit, skipped reasons, outcomes with
 * the score against last time), "Run again" and the comparison that opens on
 * its own on the results and the report, "Re-run these questions" through a
 * confirmation, and scheduled-run notices with their newly broken questions.
 * English and Spanish, 390/768/1440 px, no horizontal scroll, axe. The
 * harness renders the client only: the server side is in
 * tests/evals/schedule-credits-db.test.ts.
 */
const org = "00000000-0000-4000-8000-000000000001";
const evaluationId = "00000000-0000-4000-8000-000000000a01";
const runId = "00000000-0000-4000-8000-000000000a02";
const previousRunId = "00000000-0000-4000-8000-000000000a03";
const reportId = "00000000-0000-4000-8000-000000000301";
const previousReportId = "00000000-0000-4000-8000-000000000a05";
const revisionId = "00000000-0000-4000-8000-000000000a06";
const scheduleId = "00000000-0000-4000-8000-000000000a07";
const suiteVersionId = "00000000-0000-4000-8000-000000000a08";
const systemRevision = "00000000-0000-4000-8000-000000000a09";
const caseIds = ["00000000-0000-4000-8000-000000000b01", "00000000-0000-4000-8000-000000000b02", "00000000-0000-4000-8000-000000000b03"];
const M = 1_000_000;
const ucr = (credits: number) => String(Math.round(credits * M));
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

/** A short preliminary report: two failing answers with causes (so "Fix these first" shows), one correct. */
function snapshot(run = runId) {
  const excerpt = (title: string, text: string) => [{ source_revision_id: "src-1", anchor: "a", title, excerpt: text }];
  const base = { topic: "fees", review_status: "unreviewed", source_refs: [{ source_revision_id: "src-1", anchor: "a" }], graded_by: "judge", language: "en", contradictions: [], unsupported_claims: [], key_facts: [] };
  return {
    schema_version: "1.0", report_revision_id: revisionId, run_id: run, created_at: CREATED, content_hash: "a".repeat(64),
    system: { name: "Claims assistant", target_revision_id: systemRevision, purpose: "Answer customers about claims", execution_mode: "deployed_system" },
    scope: { suite_version_id: suiteVersionId, evidence_policy: "source_grounded", started_at: CREATED, finished_at: CREATED, languages: ["en"], review_status: "preliminary" },
    metrics: { n_planned: 3, n_eligible: 3, n_executed: 3, n_scorable: 3, n_pass: 1, n_partial: 0, n_fail: 2, n_unscorable: 0, n_pending: 0, n_unresolved: 0, strict_pass_rate: 1 / 3, rubric_score: null,
      assessed_coverage: 1, execution_completion: 1, pass_bounds: { low: 1 / 3, high: 1 / 3 }, wilson_interval: { low: 0.06, high: 0.79 }, family_cluster_interval: null, critical_unassessed: 0, headline_status: "complete" },
    findings: [], improvements: [], takeaways: [],
    methodology: { cef_version: "1.0", scorer_version: "grading-v2", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "Frozen suite membership; no post-result selection.", exclusions: [], review_coverage: "none", cost: null, limitations: [] },
    results: [
      { ...base, case_revision_id: caseIds[0], assessment_id: "a1", observation_id: "o1", title: "Management fee", severity: "critical", outcome: "fail", label: "incorrect", input: "What management fee applies?", output: "0.60%.", rationale: "States 0.60% instead of 0.40%.", expected: "0.40%.", failure_category: "wrong_information", likely_cause: "outdated_document", source_excerpts: excerpt("Fees 2026", "Management fee: 0.40%.") },
      { ...base, case_revision_id: caseIds[1], assessment_id: "a2", observation_id: "o2", title: "Custody fee", severity: "high", outcome: "fail", label: "incorrect", input: "Is there a custody fee?", output: "Yes, 0.15%.", rationale: "There is no custody fee.", expected: "No custody fee.", failure_category: "wrong_information", likely_cause: "outdated_document", source_excerpts: excerpt("Fees 2026", "No custody fee.") },
      { ...base, case_revision_id: caseIds[2], assessment_id: "a3", observation_id: "o3", title: "Instalments", severity: "medium", outcome: "pass", label: "correct", input: "In how many instalments can I pay?", output: "12.", rationale: "Correct.", expected: "12 instalments.", source_excerpts: excerpt("Payments", "Pay in 12 instalments.") },
    ],
  };
}

const comparison = (o: { comparable?: boolean; baseline?: boolean; focus?: boolean } = {}) => ({
  candidate: { runId, evaluationId, status: "completed", createdAt: CREATED, reportId, score: { pass: 1, scored: 3 } },
  baseline: o.baseline === false ? null : { runId: previousRunId, status: "completed", createdAt: "2026-09-08T10:00:00.000Z", reportId: previousReportId, score: { pass: 2, scored: 3 } },
  comparable: o.comparable ?? true,
  reasons: o.comparable === false ? ["suite_changed"] : [],
  status: o.comparable === false ? "incompatible" : "compatible",
  counts: o.comparable === false ? null : { improved: 1, regressed: 2, unchanged: 0, unassessed: 0, added: 0, removed: 0 },
  changes: o.comparable === false ? [] : [
    { caseRevisionId: caseIds[0], title: "Management fee", severity: "critical", before: "pass", after: "fail", direction: "regressed", assessmentId: "a1", baselineAssessmentId: "p1" },
    { caseRevisionId: caseIds[1], title: "Custody fee", severity: "high", before: "pass", after: "fail", direction: "regressed", assessmentId: "a2", baselineAssessmentId: "p2" },
    { caseRevisionId: caseIds[2], title: "Instalments", severity: "medium", before: "fail", after: "pass", direction: "improved", assessmentId: "a3", baselineAssessmentId: "p3" },
  ],
  focus: o.focus ? [{ caseRevisionId: caseIds[0], title: "Management fee", severity: "critical", before: "pass", after: "fail", assessmentId: "a1" }] : [],
});

const workspaceSummary = (o: { runStatus?: string | null; plan?: string } = {}) => ({
  evaluations: [{ id: evaluationId, title: "Claims assistant review", project_id: "00000000-0000-4000-8000-000000000a10", project_title: "Claims", project_description: "",
    latest_source_id: null, latest_source_revision_id: null, preparation_status: "ready", reason_code: null, selected_suite_version_id: suiteVersionId,
    selected_target_id: "00000000-0000-4000-8000-000000000a11", commercial_cap: "10", currency: "EUR", latest_run_id: o.runStatus === null ? null : runId,
    latest_run_status: o.runStatus === null ? null : o.runStatus ?? "completed", latest_run_phase: "done", created_at: CREATED }],
  systems: [{ id: "00000000-0000-4000-8000-000000000a11", project_id: "00000000-0000-4000-8000-000000000a10", title: "Claims chat", target_revision_id: systemRevision,
    document: { kind: "openai_compatible" }, connection_status: "connected", runner_status: null, runner_id: null, error_code: null }],
  reports: o.runStatus === null ? [] : [{ id: reportId, title: "Claims assistant review", current_revision_id: revisionId, evaluation_id: evaluationId, run_id: runId }],
  entitlement: { plan: o.plan ?? "payg", max_systems: 10, max_tests_per_set: 500, max_runs_per_month: null, max_members: 10, max_active_runs: 2, monthly_spend_limit: "500",
    currency: "EUR", allowed_connection_types: ["website", "openai_compatible", "https_json"], can_export: true, can_schedule: true },
  usage: { settled: "0", outstanding: "0" },
  preferences: { completion: true, required_input: true, failure: true, email: false },
});

const billingSummary = {
  orgId: org, level: "owner", role: "owner", plan: "payg", billingMode: "credits", balance: { availableUcr: ucr(1820), heldUcr: "0" }, frozen: false, gate: "enforced",
  month: { period: "2026-10", from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", usedUcr: ucr(100), committedUcr: ucr(100) },
  caps: { monthlyUcr: null, perRunUcr: null, perRunMultiplier: 2 }, lowBalance: { thresholdUcr: ucr(500), below: false }, allowance: null, nextExpiry: null, alerts: [],
  autoRecharge: null, card: null, payments: { access: "test_workspace", mode: "test", pendingOrders: 0 }, asOf: new Date().toISOString(),
};
const estimate = {
  evaluationId, suiteVersionId, targetRevisionId: systemRevision, connection: "api", priceBook: { id: "p", revision: 1 },
  questions: { count: 50, executions: 50, judged: 50, generated: 0 }, credits: { p50: "270", p90: "340" }, euros: { p50: "2.70", p90: "3.40" },
  ucr: { p50: ucr(270), p90: ucr(340) }, largestHold: { ucr: ucr(2), credits: "2" }, eta: { p50Seconds: 600, p90Seconds: 900, basis: "measured" },
  balance: { billingMode: "credits", requiresCredits: true, availableCredits: "1820", coversP90: true, addCredits: "0" },
  models: { judge: { modelId: "deepseek", free: false, priced: true, rate: "Caudals Local", credits: { input: "50", output: "200" }, webResearch: false, statsSource: "role", samples: 40 } },
  lines: [], unpriced: [], estimatedAt: new Date().toISOString(), gate: { enforced: true, autoRechargeCovers: false, autoRechargePackCredits: null, canStart: true },
};
const schedules = [{
  id: scheduleId, project_id: "00000000-0000-4000-8000-000000000a10", evaluation_id: evaluationId, target_revision_id: systemRevision, suite_version_id: suiteVersionId,
  timezone: "Europe/Madrid", cadence: "monthly", local_time: "09:00:00", weekday: null, day_of_month: 1, max_run_spend: "10", currency: "EUR", source_max_age_days: null,
  status: "active", reason_code: null, next_due_at: "2026-11-01T08:00:00.000Z", version: 1, updated_at: CREATED,
  latest_dispatch_status: "skipped", latest_dispatch_reason: "credits_exhausted", latest_scheduled_for: "2026-10-01T07:00:00.000Z", latest_alert_status: null, credit_cap_ucr: ucr(500),
}];
const alerts = [
  { id: "al-2", schedule_id: scheduleId, candidate_run_id: runId, status: "regression", reason_codes: ["paired_case_regressed"], created_at: "2026-09-01T08:30:00.000Z",
    summary: { comparable: true, reasons: ["paired_case_regressed"], candidate: { runId, reportId, score: { pass: 36, scored: 50 } }, baseline: { runId: previousRunId, reportId: previousReportId, score: { pass: 40, scored: 50 } }, newlyBrokenTotal: 2 } },
  { id: "al-1", schedule_id: scheduleId, candidate_run_id: previousRunId, status: "inconclusive", reason_codes: ["suite_changed"], created_at: "2026-08-01T08:30:00.000Z",
    summary: { comparable: false, reasons: ["suite_changed"], candidate: { runId: previousRunId, reportId: previousReportId, score: { pass: 40, scored: 50 } }, baseline: { runId: "x", reportId: null, score: { pass: 30, scored: 40 } }, newlyBrokenTotal: 0 } },
];
const notices = [
  { id: "00000000-0000-4000-8000-000000000c01", kind: "monitor_regression", category: "failure", created_at: new Date().toISOString(), read: false,
    payload: { evaluationId, evaluationTitle: "Claims assistant review", reportId, comparable: true, pass: 36, scored: 50, previousPass: 40, previousScored: 50, brokenTotal: 2,
      broken: [{ title: "Management fee", assessmentId: "a1", before: "pass", after: "fail" }, { title: "Custody fee", assessmentId: "a2", before: "pass", after: "fail" }] } },
  { id: "00000000-0000-4000-8000-000000000c02", kind: "schedule_skipped", category: "billing", created_at: new Date(Date.now() - 60_000).toISOString(), read: false,
    payload: { reason: "credits_exhausted", needed: 340, available: 120, evaluationTitle: "Claims assistant review", scheduleId } },
];

type Calls = { schedules: Array<{ body: Record<string, unknown>; key: string | null }>; patches: Array<Record<string, unknown>>; started: number; comparisons: string[] };
async function route(page: Page, o: { billing?: boolean; runStatus?: string | null; comparison?: Parameters<typeof comparison>[0] } = {}) {
  const calls: Calls = { schedules: [], patches: [], started: 0, comparisons: [] };
  await page.route("**/api/evals/v1/**", async (request) => {
    const url = new URL(request.request().url());
    const path = url.pathname.replace("/api/evals/v1", "");
    const method = request.request().method();
    const json = (data: unknown, status = 200) => request.fulfill({ status, json: status === 200 ? { data, meta: {} } : data });
    if (path === "/workspace/summary") return json(workspaceSummary({ runStatus: o.runStatus }));
    if (path === "/billing/summary") return o.billing ? json(billingSummary) : json({ error: { code: "SCOPE_DENIED" } }, 404);
    if (path === "/billing/estimates") return json(estimate);
    if (path === "/schedules" && method === "POST") { calls.schedules.push({ body: request.request().postDataJSON(), key: request.request().headers()["idempotency-key"] ?? null }); return json({ id: scheduleId, status: "active", version: 1 }); }
    if (path === "/schedules") return json(schedules);
    if (path === `/schedules/${scheduleId}`) { calls.patches.push(request.request().postDataJSON()); return json({ id: scheduleId, version: 1, credit_cap_ucr: ucr(800) }); }
    if (path === "/alerts") return json(alerts);
    if (path === `/evaluations/${evaluationId}/start`) { calls.started++; return json({ id: "00000000-0000-4000-8000-000000000a12" }); }
    if (path === `/runs/${runId}/comparison`) { calls.comparisons.push(url.search); return json(comparison(o.comparison)); }
    if (path === `/runs/${runId}`) return json({ run: { id: runId, status: "completed", phase: "done", execution_mode: "deployed_system", suite_version_id: suiteVersionId, created_at: CREATED, reason_code: null },
      units: [{ id: "u1", status: "succeeded" }, { id: "u2", status: "succeeded" }, { id: "u3", status: "succeeded" }], targetUsage: { calls: 3, unknown: 0 } });
    if (path === `/reports/${reportId}`) return json({ report: { current_revision_id: revisionId, publication_status: "published", title: "Claims assistant review" },
      revisions: [{ id: revisionId, run_id: runId, review_status: "preliminary", created_at: CREATED, snapshot: snapshot() }] });
    if (path === "/suites") return json([{ suite_version_id: suiteVersionId, case_count: 3 }]);
    if (path === "/notifications") return json({ notifications: notices, unread: 2, nextCursor: null });
    if (path === "/runs") return json([{ id: previousRunId, status: "completed", created_at: "2026-09-08T10:00:00.000Z", suite_version_id: suiteVersionId }]);
    if (path === "/comparisons") return json({ status: "compatible", improved: 1, regressed: 2, unchanged: 0, unassessed: 0, reasons: [] });
    if (path === `/evaluations/${evaluationId}/control`) return json({ subject: { kind: "run", id: runId, status: "completed", phase: "done", updatedAt: CREATED }, restart: null, actions: [] });
    return json([]);
  });
  return calls;
}

/* ------------------------------------------------- Settings → Monitoring --- */

test("schedules on credits: weekly or monthly, the estimate per run and per month, and a credit limit", async ({ page }) => {
  const calls = await route(page, { billing: true });
  await page.goto(`/workspace/settings?owner&billing&orgId=${org}&tab=monitoring`);
  const table = page.getByRole("table", { name: "Scheduled runs" });
  await expect(table.getByTestId("schedule-cap")).toHaveText("Limit 500 credits a month");
  await expect(table.getByTestId("schedule-reason")).toHaveText("Skipped: not enough credits");
  const outcomes = page.getByRole("table", { name: "Monitoring outcomes" });
  await expect(outcomes.getByTestId("outcome-score").first()).toHaveText("72% (was 80%)");
  await expect(outcomes.getByText("2 newly broken")).toBeVisible();
  await expect(outcomes.getByText("Not comparable: the test set changed")).toBeVisible();
  await noHorizontalScroll(page);

  await page.getByRole("button", { name: "New schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "New schedule" });
  await expect(dialog.getByLabel("Cadence").locator("option")).toHaveText(["Weekly", "Monthly"]);
  await expect(dialog.getByText(/Workspaces on credits schedule weekly or monthly\./)).toBeVisible();
  await expect(dialog.getByLabel(/Maximum run spend/)).toHaveCount(0);
  const box = dialog.getByTestId("schedule-estimate");
  await expect(box.getByText("Per run: about 270–340 credits (≈ €2.70–€3.40).")).toBeVisible();
  await expect(box.getByText("Per month: about 1,080–1,700 credits (4–5 runs).")).toBeVisible();
  await expect(box.getByText("You have 1,820 credits.")).toBeVisible();
  await dialog.getByLabel("Cadence").selectOption("monthly");
  await expect(box.getByText("Per month: about 270–340 credits (one run).")).toBeVisible();
  await dialog.getByLabel("Credit limit per month").fill("300");
  await expect(box.getByText("This limit is below one run's estimate, so every run would be skipped.")).toBeVisible();
  await dialog.getByLabel("Credit limit per month").fill("1000");
  await expect(box.getByText(/below one run's estimate/)).toHaveCount(0);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `dialog fits at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await axe(page, "[role=dialog]");
  await dialog.getByRole("button", { name: "Create schedule" }).click();
  await expect.poll(() => calls.schedules.length).toBe(1);
  expect(calls.schedules[0].body).toMatchObject({ orgId: org, evaluationId, cadence: "monthly", dayOfMonth: 1, weekday: null, creditCapCredits: 1000, maxRunSpend: "10", suiteVersionId });
  expect(calls.schedules[0].key).toBeTruthy();

  // Owners change a schedule's limit from its menu.
  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: "Credit limit" }).click();
  const capDialog = page.getByRole("dialog", { name: "Credit limit" });
  await expect(capDialog.getByLabel("Credit limit per month")).toHaveValue("500");
  await capDialog.getByLabel("Credit limit per month").fill("800");
  await capDialog.getByRole("button", { name: "Save limit" }).click();
  await expect.poll(() => calls.patches.length).toBe(1);
  expect(calls.patches[0]).toEqual({ orgId: org, expectedVersion: 1, creditCapCredits: 800 });
});

test("schedules on a contract keep every cadence and the agreed spend, with no credit estimate", async ({ page }) => {
  await route(page, { billing: false });
  await page.goto(`/workspace/settings?owner&orgId=${org}&tab=monitoring`);
  await page.getByRole("button", { name: "New schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "New schedule" });
  await expect(dialog.getByLabel("Cadence").locator("option")).toHaveText(["Daily", "Weekly", "Monthly"]);
  await expect(dialog.getByLabel(/Maximum run spend/)).toBeVisible();
  await expect(dialog.getByTestId("schedule-estimate")).toHaveCount(0);
  await expect(dialog.getByLabel("Credit limit per month")).toHaveCount(0);
});

test("schedules in Spanish at 390 px", async ({ page }) => {
  await spanish(page);
  await route(page, { billing: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/workspace/settings?owner&billing&orgId=${org}&tab=monitoring`);
  await expect(page.getByTestId("schedule-cap")).toHaveText("Límite de 500 créditos al mes");
  await expect(page.getByTestId("schedule-reason")).toHaveText("Omitida: no hay créditos suficientes");
  await expect(page.getByText("2 empeoradas")).toBeVisible();
  await page.getByRole("button", { name: "Nueva programación" }).click();
  const box = page.getByTestId("schedule-estimate");
  await expect(box.getByText(/Por ejecución: unos 270–340 créditos/)).toBeVisible();
  await expect(box.getByText(/Al mes: unos 1080–1700 créditos \(4–5 ejecuciones\)\.|Al mes: unos 1\.080–1\.700 créditos \(4–5 ejecuciones\)\./)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

/* --------------------------------------------- Run again → the comparison --- */

test("results: Run again starts from the estimate, and the comparison with the last run opens on its own", async ({ page }) => {
  const calls = await route(page, { billing: true });
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&billing&orgId=${org}`);
  const panel = page.locator("[data-comparison=comparable]");
  await expect(panel.getByRole("heading", { name: /^Compared with the run on / })).toBeVisible();
  await expect(panel.getByTestId("comparison-score")).toHaveText("Score 33%, was 67%.");
  await expect(panel.locator(".p-stat").filter({ hasText: "Regressed" })).toContainText("2");
  await expect(panel.getByRole("link", { name: "Management fee" })).toHaveAttribute("href", new RegExp(`/workspace/reports/${reportId}\\?result=a1`));
  await expect(panel.getByRole("link", { name: "Open that run's report" })).toHaveAttribute("href", new RegExp(`/workspace/reports/${previousReportId}`));
  await noHorizontalScroll(page);
  await axe(page, "[data-comparison]");
  // Run again: the estimate dialog first (billing shows), then the run starts on the frozen test set.
  await page.getByTestId("run-again").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/About 270–340 credits/)).toBeVisible();
  await dialog.getByTestId("estimate-start").click();
  await expect.poll(() => calls.started).toBe(1);
  // Compare: pick an earlier run; the counts and the questions that moved.
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  const compare = page.getByRole("dialog", { name: "Compare runs" });
  await compare.getByLabel("Compare with run").selectOption(previousRunId);
  await compare.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(compare.getByText("Management fee")).toBeVisible();
  expect(calls.comparisons.some(query => query.includes(`baselineRunId=${previousRunId}`))).toBe(true);
});

test("results: runs that cannot be compared say why, and a first run shows no comparison", async ({ page }) => {
  await route(page, { comparison: { comparable: false } });
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&orgId=${org}`);
  await expect(page.locator("[data-comparison=not-comparable]").getByText("These runs can't be compared: the test set changed. Scores from different test sets are never set side by side.")).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await route(page, { comparison: { baseline: false } });
  await page.reload();
  await expect(page.getByText("1 of 3 answers correct")).toBeVisible();
  await expect(page.locator("[data-comparison]")).toHaveCount(0);
});

test("report: the comparison tops the overview, and Re-run these questions asks first, then runs the test set again", async ({ page }) => {
  const calls = await route(page, { comparison: { focus: true } });
  await page.goto(`/workspace/reports/actions?owner&orgId=${org}`);
  await expect(page.locator("[data-comparison=comparable]").getByRole("heading", { name: /^Compared with the run on / })).toBeVisible();
  // Its question links open the answer in this report.
  await page.locator("[data-comparison]").getByRole("button", { name: "Custody fee" }).click();
  await expect(page.getByRole("article", { name: "Is there a custody fee?" }).getByText("There is no custody fee.")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("result")).toBe("a2");
  await page.getByRole("tab", { name: "Overview" }).click();
  const fixes = page.locator("[data-fixes]");
  await expect(fixes.getByText(/runs the whole approved test set again/)).toBeVisible();
  await fixes.getByRole("button", { name: "Re-run these questions" }).first().click();
  await page.waitForURL(new RegExp(`/workspace/evaluations/${evaluationId}\\?`));
  expect(new URL(page.url()).searchParams.get("focus")).toBe(`${caseIds[0]},${caseIds[1]}`);
  const confirm = page.getByRole("dialog", { name: "Run the test set again?" });
  await expect(confirm.getByText("This re-runs the 3 questions of the approved test set, so the scores stay comparable.", { exact: false })).toBeVisible();
  await expect(confirm.getByText("The 2 questions from the fix are listed first in the comparison.")).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has("rerun")).toBe(false);
  expect(calls.started).toBe(0);
  await confirm.getByRole("button", { name: "Run again" }).click();
  await expect.poll(() => calls.started).toBe(1);
  // The fix's questions come first in the comparison.
  await expect(page.locator("[data-comparison]").getByRole("heading", { name: "The questions you re-ran" })).toBeVisible();
});

test("comparison and re-run in Spanish at 390 px", async ({ page }) => {
  await spanish(page);
  await route(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/workspace/evaluations/${evaluationId}?owner&orgId=${org}&rerun=1`);
  await expect(page.getByRole("dialog", { name: "¿Volver a ejecutar el conjunto de pruebas?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-comparison]").getByRole("heading", { name: /^Comparado con la ejecución del / })).toBeVisible();
  await expect(page.getByTestId("comparison-score")).toHaveText("Puntuación 33 %; antes 67 %.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a viewer never gets the re-run confirmation", async ({ page }) => {
  const calls = await route(page);
  await page.goto(`/workspace/evaluations/${evaluationId}?viewer&orgId=${org}&rerun=1`);
  await expect(page.locator("[data-comparison]").getByRole("heading", { name: /^Compared with/ })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("run-again")).toHaveCount(0);
  expect(calls.started).toBe(0);
});

/* ------------------------------------------------------------- notices --- */

test("notices: a scheduled run's score against last time with its newly broken questions, and a skipped run", async ({ page }) => {
  await route(page, { billing: true });
  await page.goto(`/workspace/evaluations?owner&billing&orgId=${org}`);
  await page.getByRole("button", { name: /Notifications/ }).first().click();
  const regression = page.locator(".p-notice").filter({ hasText: "Scheduled evaluation regressed" });
  await expect(regression).toContainText("Score 72%, was 80% · 2 newly broken · Claims assistant review");
  await expect(regression.getByRole("list", { name: "Newly broken questions" }).getByRole("link", { name: "Management fee" }))
    .toHaveAttribute("href", new RegExp(`/workspace/reports/${reportId}\\?result=a1`));
  const skipped = page.locator(".p-notice").filter({ hasText: "Scheduled run skipped" });
  await expect(skipped).toContainText("Needs about 340 credits; 120 available. · Claims assistant review");
  await expect(skipped.getByRole("link").first()).toHaveAttribute("href", /tab=billing&view=top-up/);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll at ${width}px`).toBe(true);
  }
});
