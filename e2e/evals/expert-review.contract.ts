/**
 * UI contracts for expert review (launch L-26, spec P-10, P-32, P-33, §5.4):
 * the "Have an expert review this" form on the report and the results page
 * (EN and ES at 390, 768 and 1440 px), the ops request list, the order form
 * with its redacted preview and hand-written quote, publishing the reviewed
 * revision, the expert bench checklist, and the localized expert screens
 * with due dates, SLA, keyboard shortcuts and a visible save state. Runs
 * against the isolated harness (ui.config.ts); every API call is routed here.
 */
import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [390, 768, 1440] as const;
const ORG = "00000000-0000-4000-8000-000000000001";
const REPORT = "00000000-0000-4000-8000-000000000301";
const REVISION = "00000000-0000-4000-8000-000000000311";
const RUN = "00000000-0000-4000-8000-000000000321";
const REQUEST = "00000000-0000-4000-8000-000000000801";
const ORDER = "00000000-0000-4000-8000-000000000802";
const EXPERT_READY = "00000000-0000-4000-8000-000000000811";
const EXPERT_NOT_READY = "00000000-0000-4000-8000-000000000812";
const ASSIGNMENT = "00000000-0000-4000-8000-000000000821";
const EVALUATION = "00000000-0000-4000-8000-000000000501";
const CREATED = "2026-10-08T10:00:00.000Z";
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function result(n: number, outcome: "pass" | "partial" | "fail", severity: "low" | "medium" | "high" | "critical") {
  return {
    case_revision_id: `case-${n}`, title: `Question ${n}`, topic: "fees", severity, outcome, assessment_id: `a${n}`, observation_id: `o${n}`,
    input: `What fee applies in case ${n}?`, output: "0.60% a year.", rationale: outcome === "pass" ? "Correct." : "States 0.60% instead of 0.40%.",
    source_refs: [{ source_revision_id: "src-1", anchor: "fees" }], review_status: "unreviewed", label: outcome === "pass" ? "correct" : outcome === "partial" ? "partially_correct" : "incorrect",
    expected: "0.40% a year.", failure_category: outcome === "pass" ? null : "wrong_information", likely_cause: outcome === "pass" ? null : "outdated_document",
  };
}
function snapshot(expertReview?: Record<string, unknown>) {
  const results = [result(1, "fail", "critical"), result(2, "partial", "medium"), result(3, "pass", "low")];
  return {
    schema_version: "1.0", report_revision_id: REVISION, run_id: RUN, created_at: CREATED, content_hash: "a".repeat(64),
    system: { name: "Investment assistant", target_revision_id: "t1", purpose: "Answers customers' questions about fees.", execution_mode: "deployed_system" },
    scope: { suite_version_id: "s1", evidence_policy: "source_grounded", started_at: CREATED, finished_at: CREATED, languages: ["en"], review_status: "preliminary" },
    metrics: { n_planned: 3, n_eligible: 3, n_executed: 3, n_scorable: 3, n_pass: 1, n_partial: 1, n_fail: 1, n_unscorable: 0, n_pending: 0, n_unresolved: 0, strict_pass_rate: 1 / 3, rubric_score: null, assessed_coverage: 1, execution_completion: 1, pass_bounds: null, wilson_interval: null, family_cluster_interval: null, critical_unassessed: 0, headline_status: "complete" },
    findings: [], results, improvements: [], takeaways: [],
    methodology: { cef_version: "1.0", scorer_version: "v", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "All", exclusions: [], review_coverage: "Automated", cost: null, limitations: [] },
    ...(expertReview ? { expert_review: expertReview } : {}),
  };
}

type Calls = { posts: Array<Record<string, unknown>>; events: Array<Record<string, unknown>> };
async function routeReport(page: Page, initial: Record<string, unknown> | null = null): Promise<Calls> {
  const calls: Calls = { posts: [], events: [] };
  await page.addInitScript(() => localStorage.setItem("caudals_cookie_consent", "accepted"));
  await page.route("**/api/analytics/config", (route) => route.fulfill({ json: { enabled: true } }));
  await page.route("**/api/analytics/track", (route) => { calls.events.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); });
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === `/api/evals/v1/reports/${REPORT}`) {
      return route.fulfill({ json: { data: { report: { current_revision_id: REVISION, publication_status: "published", title: "Investment assistant — October" }, revisions: [{ id: REVISION, run_id: RUN, review_status: "preliminary", created_at: CREATED, snapshot: snapshot() }] }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/expert-review`) {
      if (method === "GET") return route.fulfill({ json: { data: { request: initial }, meta: {} } });
      calls.posts.push(route.request().postDataJSON());
      return route.fulfill({ json: { data: { created: true, request: { id: REQUEST, status: "requested", scopeKind: "failed_answers", createdAt: new Date().toISOString(), replyDueAt: inDays(1), dueAt: null, deliveredAt: null } }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/runs/${RUN}`) {
      return route.fulfill({ json: { data: { run: { id: RUN, status: "completed", phase: "done", execution_mode: "deployed_system", suite_version_id: "s1", created_at: CREATED, reason_code: null }, units: [], targetUsage: { calls: 3, unknown: 0 } }, meta: {} } });
    }
    if (url.pathname === "/api/evals/v1/workspace/summary") {
      return route.fulfill({ json: { data: {
        evaluations: [{ id: EVALUATION, title: "Investment assistant review", project_id: "p1", project_title: "Fees", project_description: "", latest_source_id: null, latest_source_revision_id: null, preparation_status: "ready", reason_code: null, selected_suite_version_id: "s1", commercial_cap: "500", currency: "EUR", latest_run_id: RUN, latest_run_status: "completed", latest_run_phase: "done", created_at: CREATED, updated_at: CREATED }],
        systems: [], reports: [{ id: REPORT, title: "Investment assistant — October", current_revision_id: REVISION, evaluation_id: EVALUATION, run_id: RUN, updated_at: CREATED }],
        entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["openai_compatible"], can_export: true, can_schedule: true },
        usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
      }, meta: {} } });
    }
    if (url.pathname.startsWith("/api/evals/v1/reports/") || url.pathname === "/api/evals/v1/runs") return route.fulfill({ json: { data: [], meta: {} } });
    return route.fallback();
  });
  return calls;
}

const COPY = {
  en: { action: "Have an expert review this", title: "Have an expert review this", scope: "The whole report", sector: "Sector", submit: "Send request", requested: "Requested — we'll reply within one working day" },
  es: { action: "Que lo revise un experto", title: "Que lo revise un experto", scope: "El informe completo", sector: "Sector", submit: "Enviar solicitud", requested: "Solicitado: te responderemos en un día laborable" },
} as const;

/* ------------------------------------------------------- customer side --- */

for (const locale of ["en", "es"] as const) {
  for (const width of WIDTHS) {
    test(`report (${locale}, ${width}px): "Have an expert review this" sends scope, deadline and sector, then says when we reply`, async ({ page }) => {
      if (locale === "es") await spanish(page);
      await page.setViewportSize({ width, height: 900 });
      const calls = await routeReport(page);
      await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&expert-review`);
      const copy = COPY[locale];
      const steps = page.locator(".p-summary-cta");
      // The in-app request replaces L-17's contact link.
      await expect(steps.locator('a[href*="offer=pilot-evaluation"]')).toHaveCount(0);
      await steps.getByRole("button", { name: copy.action }).click();
      const dialog = page.getByRole("dialog", { name: copy.title });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(copy.scope).check();
      await dialog.getByLabel(copy.sector).selectOption("insurance");
      await dialog.locator("#expert-review-deadline").fill("2027-01-15");
      await dialog.locator("#expert-review-note").fill("Fees and rounding");
      expect(await noHorizontalScroll(page)).toBe(true);
      if (width === 1440 && locale === "en") await page.screenshot({ path: "/tmp/caudals-l26-request-dialog.png" });
      await dialog.getByRole("button", { name: copy.submit }).click();
      await expect(steps.getByRole("status")).toHaveText(copy.requested);
      await expect(steps.getByRole("button", { name: copy.action })).toHaveCount(0);
      expect(calls.posts).toEqual([{ orgId: ORG, surface: "report", scopeKind: "whole_report", scopeNote: "Fees and rounding", deadline: "2027-01-15", sector: "insurance", locale }]);
      await expect.poll(() => calls.events.filter((event) => event.eventName === "expert_review_requested").length).toBe(1);
      expect(calls.events.find((event) => event.eventName === "expert_review_requested")).toMatchObject({ payload: { surface: "report" } });
      expect(await noHorizontalScroll(page)).toBe(true);
    });
  }
}

test("report: an open request shows its due date instead of the action; viewers and the flag off keep the old link", async ({ page }) => {
  await routeReport(page, { id: REQUEST, status: "ordered", scopeKind: "failed_answers", createdAt: CREATED, replyDueAt: CREATED, dueAt: "2026-11-20T17:00:00.000Z", deliveredAt: null });
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&expert-review`);
  const steps = page.locator(".p-summary-cta");
  await expect(steps.getByRole("status")).toHaveText(/^Expert review in progress · due /);
  await expect(steps.getByRole("button", { name: "Have an expert review this" })).toHaveCount(0);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
  await expect(page.locator(".p-summary-cta").locator('a[href*="offer=pilot-evaluation"]')).toHaveCount(1);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&viewer&expert-review`);
  await expect(page.getByRole("button", { name: "Have an expert review this" })).toHaveCount(0);
});

for (const width of WIDTHS) {
  test(`results page (${width}px): owners ask for an expert review from the evaluation's results`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await routeReport(page);
    await page.goto(`/workspace/evaluations/${EVALUATION}?owner&orgId=${ORG}&expert-review`);
    const slot = page.locator("[data-results-expert-review]");
    await slot.getByRole("button", { name: "Have an expert review this" }).click();
    const dialog = page.getByRole("dialog", { name: "Have an expert review this" });
    await dialog.getByLabel("Sector").selectOption("banking");
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(slot.getByRole("status")).toHaveText("Requested — we'll reply within one working day");
    expect(calls.posts).toEqual([{ orgId: ORG, surface: "results", scopeKind: "failed_answers", scopeNote: null, deadline: null, sector: "banking", locale: "en" }]);
    expect(await noHorizontalScroll(page)).toBe(true);
  });
}

/* ------------------------------------------------------------ ops side --- */

const requestRow = {
  id: REQUEST, org_id: ORG, workspace: "Example client", report_title: "Investment assistant — October", report_id: REPORT, surface: "report", scope_kind: "failed_answers",
  sector: "insurance", deadline: null, locale: "en", status: "requested", created_at: "2026-10-12T09:00:00.000Z", reply_due_at: "2026-10-13T09:00:00.000Z", replied_at: null,
  due_at: null, delivered_at: null, order_id: null, order_status: null, reviewer_count: null,
};
const bench = [
  { id: EXPERT_READY, user_id: "au_EXPERTREADY000000000000", domains: ["insurance"], languages: ["es-ES"], credentials_status: "verified", terms_status: "accepted", eligibility_status: "eligible",
    onboarding: { sectors: ["insurance"], availability: "available", agreement_threshold: 0.8, trial_agreement: 0.9 }, ready: true, missing: [] },
  { id: EXPERT_NOT_READY, user_id: "au_EXPERTNOTREADY0000000000", domains: ["banking"], languages: ["en-GB"], credentials_status: "verified", terms_status: "accepted", eligibility_status: "eligible",
    onboarding: { sectors: [], availability: "unavailable", agreement_threshold: 0.8, ip_assignment: false }, ready: false, missing: ["ip_assignment", "dpa", "availability"] },
];
function detail(order: Record<string, unknown> | null = null, progress = { reviewer_count: 0, assignment_count: 0 }) {
  return {
    request: { ...requestRow, scope_note: "Fees and rounding", close_reason: null, ...(order ? { status: "ordered", due_at: order.due_at } : {}) },
    draft: { id: "d1", summary: { kind: "expert_review_request", destination: "warmbly", sent: false, company: "Example client", title: "Investment assistant — October" }, created_at: CREATED },
    report: { title: "Investment assistant — October", currentRevisionId: REVISION, reviewStatus: "preliminary", expertReview: null },
    results: snapshot().results.map((item) => ({ id: item.assessment_id, title: item.title, topic: item.topic, outcome: item.outcome, severity: item.severity, label: item.label })),
    order, assignments: order ? [{ id: ASSIGNMENT, status: "submitted", due_at: order.due_at, expert_user_id: "au_EXPERTREADY000000000000", revisions: 2, submitted_at: CREATED }] : [], progress,
  };
}

async function routeOps(page: Page, state: { detail: ReturnType<typeof detail> }) {
  const calls: Array<{ method: string; path: string; body: unknown; key?: string }> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace("/api/evals/v1", "");
    const json = (data: unknown) => route.fulfill({ json: { data, meta: {} } });
    if (method !== "GET") calls.push({ method, path, body: route.request().postDataJSON(), key: route.request().headers()["idempotency-key"] });
    if (path === "/expert-reviews") return json([requestRow, { ...requestRow, id: "00000000-0000-4000-8000-000000000803", workspace: "Second client", status: "ordered", reply_due_at: CREATED, replied_at: CREATED, due_at: inDays(-1), order_id: ORDER, order_status: "open" }]);
    if (path === `/expert-reviews/${REQUEST}`) return json(state.detail);
    if (path === `/expert-reviews/${REQUEST}/excerpts`) return json({ excerpts: [{ anchor: "Q1 · fees", text: "Question: What fee applies in case 1?\n\nAnswer given: 0.60% a year.\n\nAutomatic grade: incorrect (severity: critical)" }, { anchor: "Q2 · fees", text: "Question: What fee applies in case 2?" }], severity: "critical" });
    if (path === `/expert-reviews/${REQUEST}/order`) return json(method === "POST" ? { orderId: ORDER, assignmentIds: [ASSIGNMENT], excerptCount: 2 } : { revisionId: "r2", reviewerCount: 1, label: "Reviewed by 1 expert", hoursToReview: 30 });
    if (path === "/expert-bench") return json(bench);
    if (path.startsWith("/expert-bench/")) return json({ ready: true });
    if (path === "/experts") return json([]);
    if (path.startsWith("/expert-assignments")) return json([]);
    if (path === "/workspaces") return json([{ id: ORG, name: "Example client" }]);
    return json([]);
  });
  return calls;
}

for (const width of WIDTHS) {
  test(`ops (${width}px): review requests with reply SLA, then an order with a hand-written quote and a redacted preview`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = { detail: detail() };
    const calls = await routeOps(page, state);
    await page.goto(`/ops/experts?orgId=${ORG}&reviews`);
    const table = page.getByRole("table", { name: "Expert review requests" });
    await expect(table.getByRole("row").filter({ hasText: "Second client" }).getByText("Overdue")).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: "Example client" })).toContainText(/Reply (overdue|by)/);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.goto(`/ops/experts/reviews/${REQUEST}?orgId=${ORG}`);
    await expect(page.getByText('"sent": false')).toBeVisible();
    await expect(page.getByText("Not sent anywhere. Copy it into Warmbly; campaigns stay drafts there.")).toBeVisible();
    // Failed and partly correct answers are in scope by default; the passing one is not.
    await expect(page.getByLabel("Question 1")).toBeChecked();
    await expect(page.getByLabel("Question 2")).toBeChecked();
    await expect(page.getByLabel("Question 3")).not.toBeChecked();
    await expect(page.getByLabel(/au_EXPERTNOT/)).toBeDisabled();
    await expect(page.getByText(/Missing: IP assignment, DPA, availability/)).toBeVisible();
    await page.getByLabel(/au_EXPERTREA/).check();
    await page.getByLabel("Due date").fill("2027-01-20");
    await page.getByLabel("Quoted price (EUR, before tax)").fill("1500.00");
    await page.getByLabel("Quote (hand-written)").fill("Two experts, 12 answers, invoiced by hand on delivery.");
    await page.getByLabel(/Each expert declared no conflict of interest/).check();
    const create = page.getByRole("button", { name: "Create order and assignments" });
    await expect(create).toBeDisabled();
    await page.getByRole("button", { name: "Check the redacted excerpts" }).click();
    await expect(page.getByRole("heading", { name: "What each expert will see: 2 excerpts" })).toBeVisible();
    await expect(create).toBeEnabled();
    expect(await noHorizontalScroll(page)).toBe(true);
    if (width === 1440) await page.screenshot({ path: "/tmp/caudals-l26-order-form.png", fullPage: true });
    await create.click();
    const order = calls.find((call) => call.method === "POST" && call.path.endsWith("/order"))!;
    expect(order.key).toMatch(/^[a-f0-9-]{36}$/);
    expect(order.body).toMatchObject({ orgId: ORG, sector: "insurance", quoteAmount: "1500.00", quoteCurrency: "EUR", quoteNote: "Two experts, 12 answers, invoiced by hand on delivery.",
      expertProfileIds: [EXPERT_READY], resultIds: ["a1", "a2"], conflictsCleared: true, scope: "The failed and partly correct answers: Fees and rounding" });
    expect(Date.parse((order.body as { dueAt: string }).dueAt)).toBeGreaterThan(Date.now());
    expect(calls.find((call) => call.path.endsWith("/excerpts"))!.body).toEqual({ resultIds: ["a1", "a2"] });
  });
}

test("ops: publishing the reviewed revision shows its label first and needs a submitted review", async ({ page }) => {
  const order = { id: ORDER, scope: "the failed answers on fees", sector: "insurance", due_at: inDays(3), quote_amount: "1500.00", quote_currency: "EUR", quote_note: "Two experts.", status: "open", reviewer_count: null, delivered_at: null, created_at: CREATED, result_revision_id: null, cancel_reason: null };
  const state = { detail: detail(order, { reviewer_count: 0, assignment_count: 1 }) };
  const calls = await routeOps(page, state);
  await page.goto(`/ops/experts/reviews/${REQUEST}?orgId=${ORG}`);
  await expect(page.getByText("No expert has submitted work yet, so the report cannot be labelled as reviewed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish the reviewed revision" })).toBeDisabled();
  state.detail = detail(order, { reviewer_count: 2, assignment_count: 2 });
  await page.reload();
  await expect(page.getByText(/^The report will read: Reviewed by 2 experts on .+, scope: the failed answers on fees\.$/)).toBeVisible();
  await expect(page.getByText("2 of 2")).toBeVisible();
  await page.getByLabel("Note for the customer (optional)").fill("Both experts agree with most grades.");
  await page.getByRole("button", { name: "Publish the reviewed revision" }).click();
  await expect.poll(() => calls.filter((call) => call.method === "PATCH").length).toBe(1);
  expect(calls.find((call) => call.method === "PATCH")!.body).toEqual({ action: "publish", orderId: ORDER, note: "Both experts agree with most grades." });
});

test("ops: the bench checklist shows what each expert still needs and saves it", async ({ page }) => {
  const calls = await routeOps(page, { detail: detail() });
  await page.goto(`/ops/experts?orgId=${ORG}&reviews`);
  await page.getByRole("tab", { name: "Bench" }).click();
  await expect(page.getByText("Missing: IP assignment, DPA, availability")).toBeVisible();
  await page.getByRole("button", { name: "Edit checklist" }).nth(1).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Credentials verified on").fill("2026-10-01");
  await panel.getByLabel("Contract signed on").fill("2026-10-02");
  await panel.getByLabel("The contract assigns IP to Caudals").check();
  await panel.getByLabel("The contract includes confidentiality").check();
  await panel.getByLabel("Data-processing agreement signed on").fill("2026-10-02");
  await panel.getByLabel("Trial gold items").fill("20");
  await panel.getByLabel("Trial agreement (%)").fill("85");
  await panel.getByLabel("Paid trial completed on").fill("2026-10-05");
  await panel.getByLabel("Availability").selectOption("limited");
  await expect(panel.getByText("Checklist complete: this expert can take order work.")).toBeVisible();
  await panel.getByRole("button", { name: "Save checklist" }).click();
  const saved = calls.find((call) => call.method === "PUT")!;
  expect(saved.path).toBe(`/expert-bench/${EXPERT_NOT_READY}`);
  expect(saved.body).toMatchObject({ ip_assignment: true, confidentiality: true, trial_gold_items: 20, trial_agreement: 0.85, agreement_threshold: 0.8, availability: "limited" });
});

test("ops screens are in Spanish for a Spanish operator", async ({ page }) => {
  await spanish(page);
  await routeOps(page, { detail: detail() });
  await page.goto(`/ops/experts?orgId=${ORG}&reviews`);
  await expect(page.getByRole("tab", { name: "Solicitudes de revisión" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Equipo de expertos" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Solicitudes de revisión experta" })).toContainText("Vencida");
});

/* --------------------------------------------------------- expert side --- */

const work = {
  id: ASSIGNMENT, kind: "authoring", status: "assigned",
  evidence: { excerpts: [{ anchor: "Q1 · fees", text: "Question: What fee applies?\n\nAnswer given: 0.60% a year." }], transcript: [] },
  guideline: { title: "Expert review: the failed answers", instructions: "Review the redacted questions and answers in this assignment." },
  dueAt: inDays(-2), ownRevision: null,
};

for (const width of WIDTHS) {
  test(`expert queue in Spanish (${width}px): due dates and SLA, localized tabs and actions`, async ({ page }) => {
    await spanish(page);
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/evals/v1/review/assignments", (route) => route.fulfill({ json: { data: [
      { id: ASSIGNMENT, kind: "authoring", status: "assigned", severity: "critical", due_at: inDays(-2), updated_at: CREATED },
      { id: "00000000-0000-4000-8000-000000000822", kind: "independent_review", status: "in_progress", severity: "high", due_at: inDays(0.5), updated_at: CREATED },
      { id: "00000000-0000-4000-8000-000000000823", kind: "calibration", status: "approved", severity: "low", due_at: null, updated_at: CREATED },
    ], meta: {} } }));
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "Trabajo experto asignado" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Abiertas" })).toBeVisible();
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows.filter({ hasText: "Redacción" })).toContainText("Vencida desde el");
    await expect(rows.filter({ hasText: "Revisión independiente" })).toContainText("Entrega");
    await expect(page.getByRole("link", { name: "Abrir tarea" })).toHaveCount(2);
    await page.getByRole("tab", { name: "Todas" }).click();
    await expect(page.getByRole("link", { name: "Abrir tarea" })).toHaveCount(3);
    await expect(page.getByText(/Open|All|Assigned expert work/)).toHaveCount(0);
    expect(await noHorizontalScroll(page)).toBe(true);
  });
}

test("expert workbench: shortcuts save and submit, the save state is visible, and the guideline is one key away", async ({ page }) => {
  const saves: Array<Record<string, unknown>> = [];
  await page.route(`**/api/evals/v1/review/assignments/${ASSIGNMENT}`, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: work, meta: {} } });
    const body = route.request().postDataJSON();
    saves.push(body);
    return route.fulfill({ json: { data: { conflict: false, revisionId: "00000000-0000-4000-8000-000000000831", version: saves.length, lockVersion: saves.length }, meta: {} } });
  });
  await page.goto(`/review/assignments/${ASSIGNMENT}`);
  await expect(page.locator("[data-save-state]")).toHaveText("Autosave on: drafts save 30 seconds after you stop typing.");
  await expect(page.getByText(/^Overdue since /)).toBeVisible();
  await expect(page.locator("[data-shortcuts]")).toContainText("save draft");
  await page.getByLabel("Answer").fill("Q1: disagree. The fee is 0.40%.");
  await page.getByLabel("Rationale").fill("The excerpt states 0.40% a year.");
  await expect(page.locator("[data-save-state]")).toHaveText("Unsaved changes");
  await page.keyboard.press("Control+s");
  await expect(page.locator("[data-save-state]")).toHaveText(/^Saved at \d{2}:\d{2}$/);
  expect(saves[0]).toMatchObject({ expectedVersion: 0, submit: false, document: { answer: "Q1: disagree. The fee is 0.40%." } });
  await page.keyboard.press("Alt+g");
  await expect(page.locator("#assignment-guideline")).toBeFocused();
  await page.getByLabel("Rationale").focus();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("status")).toContainText("Work submitted for independent review.");
  expect(saves[1]).toMatchObject({ expectedVersion: 1, submit: true });
  await expect(page.getByRole("button", { name: "Submit work" })).toBeDisabled();
});

test("expert workbench in Spanish", async ({ page }) => {
  await spanish(page);
  await page.route(`**/api/evals/v1/review/assignments/${ASSIGNMENT}`, (route) => route.fulfill({ json: { data: { ...work, dueAt: inDays(4) }, meta: {} } }));
  await page.goto(`/review/assignments/${ASSIGNMENT}`);
  await expect(page.getByRole("heading", { name: "Tarea experta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Leer la guía" })).toBeVisible();
  await expect(page.getByLabel("Respuesta")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar borrador" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entregar trabajo" })).toBeVisible();
  await expect(page.getByText(/^Entrega /)).toBeVisible();
  await expect(page.locator("[data-shortcuts]")).toContainText("guardar borrador");
});
