/**
 * UI contracts for report v2 and the share page (launch L-17, spec P-11,
 * P-18, P-20, P-21): the executive summary first with its evidence and next
 * steps, "Fix these first" with its exports, the results tab's sort and
 * exports, the share dialog's expiry presets and open counts, and the shared
 * page's header and demo invitation, at 390, 768 and 1440 px. Runs against
 * the isolated harness (ui.config.ts).
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { expectSpanishOnly } from "./spanish-leaks";

const WIDTHS = [390, 768, 1440] as const;
const ORG = "00000000-0000-4000-8000-000000000001";
const REPORT = "00000000-0000-4000-8000-000000000301";
const REVISION = "00000000-0000-4000-8000-000000000311";
const RUN = "00000000-0000-4000-8000-000000000321";
const EVALUATION = "00000000-0000-4000-8000-000000000351";
const TOKEN = "T".repeat(43);
const CREATED = "2026-10-08T10:00:00.000Z";
const workspaceRef = createHash("sha256").update(`caudals-workspace-ref-v1:${ORG}`).digest("hex").slice(0, 12);
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

const SUMMARY = [
  "3 of 7 answers matched your sources (43%). 1 more was partly right.",
  "The main problems are wrong information (2) and unanswered questions (1).",
  "Start with: Update the outdated content behind “Fees and charges 2026” (2 answers, 1 critical).",
];
const SUMMARY_ES = [
  "3 de 7 respuestas coincidieron con tus fuentes (43 %). Otra fue parcialmente correcta.",
  "Los principales problemas son la información incorrecta (2) y las preguntas sin respuesta (1).",
  "Empieza por: Actualiza el contenido desactualizado de «Fees and charges 2026» (2 respuestas, 1 crítica).",
];

/** A preliminary report with every result label, likely causes and source pages. Synthetic. */
function snapshot() {
  const faq = "Investment FAQ", fees = "Fees and charges 2026";
  const excerpt = (title: string | null, text: string) => [{ source_revision_id: "src-1", anchor: "a", title, excerpt: text }];
  const base = { topic: "fees", review_status: "unreviewed", source_refs: [{ source_revision_id: "src-1", anchor: "a" }], graded_by: "judge", language: "en", contradictions: [], unsupported_claims: [], key_facts: [] };
  const result = (n: number, fields: Record<string, unknown>) => ({ ...base, case_revision_id: `case-${n}`, assessment_id: `a${n}`, observation_id: `o${n}`, ...fields });
  return {
    schema_version: "1.0", report_revision_id: REVISION, run_id: RUN, created_at: CREATED, content_hash: "a".repeat(64),
    system: { name: "Investment assistant", target_revision_id: "t1", purpose: "Answer customers about investment portfolios", execution_mode: "deployed_system" },
    scope: { suite_version_id: "s1", evidence_policy: "source_grounded", started_at: CREATED, finished_at: CREATED, languages: ["en"], review_status: "preliminary" },
    metrics: { n_planned: 8, n_eligible: 8, n_executed: 8, n_scorable: 7, n_pass: 3, n_partial: 1, n_fail: 3, n_unscorable: 1, n_pending: 0, n_unresolved: 1, strict_pass_rate: 3 / 7, rubric_score: null, assessed_coverage: 0.875, execution_completion: 1, pass_bounds: { low: 0.375, high: 0.5 }, wilson_interval: { low: 0.158, high: 0.75 }, family_cluster_interval: null, critical_unassessed: 0, headline_status: "incomplete" },
    findings: [], improvements: [], takeaways: [],
    methodology: { cef_version: "1.0", scorer_version: "grading-v2", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "Frozen suite membership; no post-result selection.", exclusions: [], review_coverage: "none", cost: null, limitations: ["1 test was flagged as unclear or with a questionable expected answer and excluded from the score until reviewed."] },
    results: [
      result(1, { title: "Minimum", severity: "high", outcome: "pass", label: "correct", input: "What is the minimum to open a portfolio?", output: "€1,000.", rationale: "Correct.", expected: "€1,000.", source_excerpts: excerpt(faq, "The minimum is €1,000.") }),
      result(2, { title: "Withdrawals", severity: "medium", outcome: "pass", label: "correct", input: "Can I withdraw at any time?", output: "Yes.", rationale: "Correct.", expected: "Yes.", source_excerpts: excerpt(faq, "Withdraw at any time.") }),
      result(3, { title: "Contributions", severity: "medium", outcome: "partial", label: "partially_correct", input: "How often can I schedule contributions?", output: "Monthly.", rationale: "Leaves out quarterly and yearly.", expected: "Monthly, quarterly or yearly.", failure_category: "missing_information", likely_cause: "knowledge_gap", source_excerpts: excerpt(faq, "Monthly, quarterly or yearly.") }),
      result(4, { title: "Management fee", severity: "critical", outcome: "fail", label: "incorrect", input: "What management fee applies under €10,000?", output: "0.60% a year.", rationale: "States 0.60% instead of 0.40%.", expected: "0.40% a year.", failure_category: "wrong_information", likely_cause: "outdated_document", source_excerpts: excerpt(fees, "Management fee: 0.40% a year up to €10,000.") }),
      result(5, { title: "Custody fee", severity: "high", outcome: "fail", label: "incorrect", input: "Is there a custody fee?", output: "Yes, 0.15%.", rationale: "There is no custody fee.", expected: "No custody fee.", failure_category: "wrong_information", likely_cause: "outdated_document", source_excerpts: excerpt(fees, "No custody fee.") }),
      result(6, { title: "Instalments", severity: "medium", outcome: "fail", label: "not_answered", input: "In how many instalments can I pay?", output: "Could you rephrase that?", rationale: "Asks to rephrase without answering.", expected: "12 instalments.", failure_category: "no_answer", source_excerpts: excerpt(null, "Pay in 12 instalments.") }),
      result(7, { title: "Statistics", severity: "low", outcome: "unscorable", label: "test_issue", input: "Which historical data does the statistics page offer?", output: "Returns and composition.", rationale: "The expected answer is a table header.", expected: "Service" }),
      result(8, { title: "Transfers", severity: "low", outcome: "pass", label: "correct", input: "Can I transfer an existing fund?", output: "Yes.", rationale: "Correct.", expected: "Yes.", source_excerpts: excerpt(faq, "Transfers are accepted.") }),
    ],
  };
}

async function routeReport(page: Page, shares: Array<Record<string, unknown>> = []) {
  const posted: Array<Record<string, unknown>> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === `/api/evals/v1/reports/${REPORT}`) {
      return route.fulfill({ json: { data: { report: { current_revision_id: REVISION, publication_status: "published", title: "Investment assistant — October" }, revisions: [{ id: REVISION, run_id: RUN, review_status: "preliminary", created_at: CREATED, snapshot: snapshot() }] }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/shares`) {
      if (method === "GET") return route.fulfill({ json: { data: shares, meta: {} } });
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000331", token: TOKEN }, meta: {} } });
    }
    if (url.pathname === "/api/evals/v1/exports" && method === "POST") {
      posted.push({ export: route.request().postDataJSON().kind });
      return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000341", status: "queued" }, meta: {} } });
    }
    if (url.pathname.startsWith("/api/evals/v1/exports/")) return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000341", status: "running", download_path: null }, meta: {} } });
    // Launch L-18: the run's comparison (a first run: nothing to compare) names its evaluation for "Re-run these questions".
    if (url.pathname === `/api/evals/v1/runs/${RUN}/comparison`) return route.fulfill({ json: { data: { candidate: { runId: RUN, evaluationId: EVALUATION, status: "completed", createdAt: CREATED, reportId: REPORT, score: { pass: 3, scored: 7 } },
      baseline: null, comparable: false, reasons: ["no_baseline"], status: null, counts: null, changes: [], focus: [] }, meta: {} } });
    if (url.pathname.startsWith("/api/evals/v1/reports/") || url.pathname === "/api/evals/v1/runs") return route.fulfill({ json: { data: [], meta: {} } });
    return route.fallback();
  });
  return posted;
}

for (const width of WIDTHS) {
  test(`report v2 at ${width}px opens with the executive summary, its next steps and the fixes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await routeReport(page);
    await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
    const summary = page.locator("[data-summary]");
    await expect(summary.getByRole("heading", { name: "Executive summary" })).toBeVisible();
    await expect(summary.locator("[data-summary-text]")).toHaveText(SUMMARY);
    await expect(summary.locator("[data-sample]")).toHaveText("Sample: 7 scored answers out of 8 questions.");
    await expect(summary.getByText("Graded automatically; no expert has reviewed the grades yet.")).toBeVisible();
    await expect(summary.getByText("Some questions could not be scored, so the score describes only the scored ones.")).toBeVisible();
    // Summary first: above the incomplete warning and the scoreboard, whose headline is a whole percentage.
    const [summaryBox, scoreBox] = [await summary.boundingBox(), await page.locator(".p-scoreboard").boundingBox()];
    expect(summaryBox!.y).toBeLessThan(scoreBox!.y);
    await expect(page.locator(".p-score")).toHaveText("43%");
    const steps = summary.getByRole("group", { name: "Next steps" });
    await expect(steps.getByRole("link", { name: "Book a readout" })).toHaveAttribute("href", `https://cal.com/caudals/call?metadata%5Bsource%5D=report&metadata%5Bworkspace%5D=${workspaceRef}`);
    await expect(steps.getByRole("link", { name: "Request expert review" })).toHaveAttribute("href", "https://caudals.com/en/contact?offer=pilot-evaluation");
    await expect(steps.getByRole("button", { name: "Share" })).toBeVisible();
    await expect(steps.getByRole("button", { name: "Download PDF" })).toBeVisible();
    const fixes = page.locator("[data-fixes]");
    await expect(fixes.getByRole("heading", { name: "Fix these first" })).toBeVisible();
    await expect(fixes.locator(".p-fix-title")).toHaveText(["Update the outdated content behind “Fees and charges 2026”", "Give the assistant the content of “Investment FAQ”", "Answer instead of deflecting"]);
    await expect(fixes.getByText("Likely cause (hypothesis): outdated document")).toBeVisible();
    // Launch L-18: re-running a fix's questions runs the approved test set again (from the evaluation, after a confirmation).
    await expect(fixes.getByRole("button", { name: "Re-run these questions" }).first()).toBeEnabled();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-l17-report-${width}.png`, fullPage: true });
  });
}

test("summary evidence, next steps and fix exports work", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const posted = await routeReport(page);
  const events: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => localStorage.setItem("caudals_cookie_consent", "accepted"));
  await page.route("**/api/analytics/config", (route) => route.fulfill({ json: { enabled: true } }));
  await page.route("**/api/analytics/track", (route) => { events.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); });
  await page.context().route("https://cal.com/**", (route) => route.fulfill({ body: "booking", headers: { "content-type": "text/plain" } }));
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
  const summary = page.locator("[data-summary]");

  // Booking a readout is tracked as a report click.
  const popup = page.waitForEvent("popup");
  await summary.getByRole("link", { name: "Book a readout" }).click();
  await (await popup).close();
  await expect.poll(() => events.find((event) => event.eventName === "readout_link_clicked")).toMatchObject({ eventName: "readout_link_clicked", payload: { surface: "report" } });

  // Download PDF in the next steps starts the same export as the heading menu.
  await summary.getByRole("button", { name: "Download PDF" }).click();
  await expect.poll(() => posted).toContainEqual({ export: "pdf" });
  await expect(summary.getByRole("button", { name: "Preparing PDF…" })).toBeDisabled();

  // Share in the next steps opens the share dialog.
  await summary.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("dialog", { name: "Share report" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Fix exports for a vendor.
  const fixes = page.locator("[data-fixes]");
  const [csv] = await Promise.all([page.waitForEvent("download"), fixes.getByRole("button", { name: "Export CSV" }).click()]);
  expect(csv.suggestedFilename()).toBe("Caudals-Investment-assistant-fixes-2026-10-08.csv");
  const csvText = await readFile((await csv.path())!, "utf8");
  expect(csvText.split("\r\n")[0]).toBe("fix,fix_title,likely_cause_hypothesis,problem,source,severity,what_to_do,result,question,answer,expected_answer,why,assessment_id,case_revision_id");
  expect(csvText).toContain("What management fee applies under €10,000?");
  const [markdown] = await Promise.all([page.waitForEvent("download"), fixes.getByRole("button", { name: "Export Markdown" }).click()]);
  expect(markdown.suggestedFilename()).toBe("Caudals-Investment-assistant-fixes-2026-10-08.md");
  expect(await readFile((await markdown.path())!, "utf8")).toContain("## 1. Update the outdated content behind “Fees and charges 2026”");

  // A summary sentence's evidence opens the results it stands on.
  await summary.getByRole("button", { name: "Evidence (2)" }).last().click();
  await expect(page.getByText(/Showing the results behind/)).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("results sort by severity, export the failures and copy a question", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await routeReport(page);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&tab=results`);
  await page.getByRole("tab", { name: /Test results/ }).click();
  await expect(page.getByLabel("Sort by")).toHaveValue("severity");
  await expect(page.locator("tbody tr").first()).toContainText("What management fee applies under €10,000?");
  await page.getByLabel("Sort by").selectOption("result");
  await expect(page.locator("tbody tr").first()).toContainText("What management fee applies under €10,000?");
  await expect(page.locator("tbody tr").nth(1)).toContainText("Is there a custody fee?");
  const [failing] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export failing" }).click()]);
  expect(failing.suggestedFilename()).toBe("Caudals-Investment-assistant-failing-2026-10-08.csv");
  expect((await readFile((await failing.path())!, "utf8")).trim().split("\r\n")).toHaveLength(5);
  await page.getByRole("button", { name: /Is there a custody fee\?/ }).click();
  await page.getByRole("button", { name: "Copy question" }).click();
  await expect(page.getByText("Question copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Is there a custody fee?");
  await page.getByRole("button", { name: "All results" }).click();
  await page.getByRole("tab", { name: "Methodology" }).click();
  await expect(page.getByText("42.9% (3 of 7)")).toBeVisible();
});

test("the share dialog offers 7, 30 and 90 days and shows how often each link was opened", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const shares = [
    { id: "00000000-0000-4000-8000-000000000351", report_revision_id: REVISION, audience: "bearer", recipient: null, permitted_fields: ["metrics"], expires_at: "2026-11-07T10:00:00Z", revoked_at: null, access_count: 4, open_count: 3, last_opened_at: "2026-10-11T09:00:00Z" },
    { id: "00000000-0000-4000-8000-000000000352", report_revision_id: REVISION, audience: "bearer", recipient: null, permitted_fields: ["metrics"], expires_at: "2026-11-07T10:00:00Z", revoked_at: null, access_count: 0, open_count: 0, last_opened_at: null },
  ];
  const posted = await routeReport(page, shares);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
  await page.locator(".p-head-actions").getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share report" });
  const presets = dialog.getByRole("group", { name: "Link expires after" });
  await expect(presets.getByRole("button")).toHaveText(["7 days", "30 days", "90 days"]);
  await expect(presets.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText(/^Opened 3 times, last on/)).toBeVisible();
  await expect(dialog.getByText("Not opened yet")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await presets.getByRole("button", { name: "7 days" }).click();
  const before = Date.now();
  await dialog.getByRole("button", { name: "Create access" }).click();
  await expect(page.getByRole("dialog", { name: "Share created" }).getByLabel("Private link")).toHaveValue(new RegExp(`share#token=${TOKEN}`));
  const days = (Date.parse(String(posted[0].expiresAt)) - before) / 86_400_000;
  expect(days).toBeGreaterThan(6.99);
  expect(days).toBeLessThan(7.01);
});

async function routeShare(page: Page, fields = ["system", "scope", "metrics", "findings", "results"], locale = "en") {
  const report = snapshot();
  const data = Object.fromEntries(Object.entries(report).filter(([key]) => ["schema_version", "report_revision_id", "run_id", "created_at", "content_hash", ...fields].includes(key)));
  if (locale === "es") await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await page.route("**/api/evals/v1/share/exchange", (route) => route.fulfill({ json: { data, meta: { request_id: "r", referral: "sr-0123456789ab" } } }));
}

for (const width of WIDTHS) {
  test(`the shared report at ${width}px explains itself and invites the reader to test their own assistant`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await routeShare(page);
    await page.goto(`/share#token=${TOKEN}`);
    const intro = page.locator("[data-share-intro]");
    await expect(intro.getByRole("heading", { name: "What this report is" })).toBeVisible();
    await expect(intro).toContainText("checked against the sentence in those documents");
    // The public methodology (launch L-20).
    await expect(intro.getByRole("link", { name: "How Caudals grades answers" })).toHaveAttribute("href", "https://caudals.com/en/methodology");
    await expect(page.locator("[data-summary-text]")).toHaveText(SUMMARY);
    // Recipients get no workspace actions.
    await expect(page.getByRole("group", { name: "Next steps" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Re-run these questions" })).toHaveCount(0);
    const cta = page.locator("[data-share-cta]");
    await expect(cta.getByRole("heading", { name: "Test your own assistant free" })).toBeVisible();
    await expect(cta.getByRole("link", { name: "Test your assistant free" })).toHaveAttribute("href", "https://caudals.com/en/demo?utm_source=shared_report&utm_medium=referral&utm_campaign=report_share&ref=sr-0123456789ab");
    expect(await noHorizontalScroll(page)).toBe(true);
    // The token never stays in the address bar.
    expect(page.url()).not.toContain(TOKEN);
    await page.screenshot({ path: `/tmp/caudals-l17-share-${width}.png`, fullPage: true });
  });
}

test("a shared copy without results keeps the metric sentence and the Spanish reader gets Spanish", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await routeShare(page, ["system", "scope", "metrics", "findings"], "es");
  await page.goto(`/share#token=${TOKEN}`);
  await expect(page.locator("[data-summary-text]")).toHaveText([SUMMARY_ES[0]]);
  await expect(page.locator("[data-fixes]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Qué es este informe" })).toBeVisible();
  await expect(page.locator("[data-share-cta]").getByRole("link", { name: "Prueba gratis tu asistente" })).toHaveAttribute("href", /^https:\/\/caudals\.com\/es\/demo\?utm_source=shared_report&.*ref=sr-0123456789ab$/);
  await expectSpanishOnly(page, "shared report");
});

test("the Spanish report reads the same summary as the Spanish PDF", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeReport(page);
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
  await expect(page.locator("[data-summary-text]")).toHaveText(SUMMARY_ES);
  await expect(page.locator("[data-summary]").getByRole("link", { name: "Pide una revisión experta" })).toHaveAttribute("href", "https://caudals.com/es/contacto?offer=pilot-evaluation");
  await expect(page.locator(".p-fix-title").first()).toHaveText("Actualiza el contenido desactualizado de «Fees and charges 2026»");
  await expectSpanishOnly(page, "report");
});
