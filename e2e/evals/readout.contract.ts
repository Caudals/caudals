/**
 * UI contracts for readout mode (launch L-35, spec P-57): "Present" on a
 * report, the full-screen slide sequence and its keyboard (← / → and Space,
 * Home / End, number keys, Esc, P, F), the presenter window kept in sync, the
 * operators' notes and transcript picks, the 16:9 PDF export, reduced motion,
 * and projector-size text, at 390, 768, 1440 px and 1920 × 1080. Runs against
 * the isolated harness (ui.config.ts); the API is routed per test.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { slideProblems, smallestBodyText } from "../../scripts/evals/readout-checks";

const ORG = "00000000-0000-4000-8000-000000000001";
const REPORT = "00000000-0000-4000-8000-000000000301";
const REVISION = "00000000-0000-4000-8000-000000000311";
const RUN = "00000000-0000-4000-8000-000000000321";
const CREATED = "2026-10-08T10:00:00.000Z";
const NOTE = "Operator note: ask who owns the fee table.";
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/** A preliminary report with failures over several causes and source excerpts. Synthetic. */
function snapshot() {
  const excerpt = (title: string, text: string) => [{ source_revision_id: "src-1", anchor: "a", title, excerpt: text }];
  const base = { topic: "fees", review_status: "unreviewed", source_refs: [{ source_revision_id: "src-1", anchor: "a" }], graded_by: "judge", language: "en", contradictions: [], unsupported_claims: [], key_facts: [] };
  const result = (n: number, fields: Record<string, unknown>) => ({ ...base, case_revision_id: `case-${n}`, assessment_id: `a${n}`, observation_id: `o${n}`, title: `Question ${n}`, input: `Customer question ${n}?`, output: `Assistant answer ${n}.`, rationale: `Why ${n}.`, expected: `Expected ${n}.`, ...fields });
  return {
    schema_version: "1.0", report_revision_id: REVISION, run_id: RUN, created_at: CREATED, content_hash: "a".repeat(64),
    system: { name: "Investment assistant", target_revision_id: "t1", purpose: "Answer customers about investment portfolios", execution_mode: "deployed_system" },
    scope: { suite_version_id: "s1", evidence_policy: "source_grounded", started_at: CREATED, finished_at: CREATED, languages: ["en"], review_status: "preliminary" },
    metrics: { n_planned: 9, n_eligible: 9, n_executed: 9, n_scorable: 9, n_pass: 3, n_partial: 1, n_fail: 5, n_unscorable: 0, n_pending: 0, n_unresolved: 0, strict_pass_rate: 3 / 9, rubric_score: null, assessed_coverage: 1, execution_completion: 1, pass_bounds: { low: 0.33, high: 0.33 }, wilson_interval: { low: 0.12, high: 0.65 }, family_cluster_interval: null, critical_unassessed: 0, headline_status: "complete" },
    findings: [], improvements: [], takeaways: [],
    methodology: { cef_version: "1.0", scorer_version: "grading-v2", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "Frozen suite membership; no post-result selection.", exclusions: [], review_coverage: "none", cost: null, limitations: [] },
    results: [
      result(1, { severity: "critical", outcome: "fail", label: "incorrect", failure_category: "wrong_information", likely_cause: "outdated_document", source_excerpts: excerpt("Fees and charges 2026", "The management fee is 0.40% a year.") }),
      result(2, { severity: "high", outcome: "fail", label: "incorrect", failure_category: "wrong_information", likely_cause: "outdated_document", source_excerpts: excerpt("Fees and charges 2026", "There is no custody fee.") }),
      result(3, { severity: "high", outcome: "fail", label: "not_answered", failure_category: "no_answer", likely_cause: "knowledge_gap", source_excerpts: excerpt("Investment FAQ", "You can pay in 12 instalments.") }),
      result(4, { severity: "medium", outcome: "partial", label: "partially_correct", failure_category: "missing_information", source_excerpts: excerpt("Investment FAQ", "Monthly, quarterly or yearly.") }),
      result(5, { severity: "medium", outcome: "fail", label: "incorrect", failure_category: "contradicts_source", likely_cause: "wrong_source", source_excerpts: excerpt("Terms", "Transfers are free.") }),
      result(6, { severity: "low", outcome: "fail", label: "incorrect", failure_category: "off_topic", likely_cause: "invented_answer", source_excerpts: excerpt("Terms", "Withdraw at any time.") }),
      result(7, { severity: "high", outcome: "pass", label: "correct", source_excerpts: excerpt("Investment FAQ", "The minimum is €1,000.") }),
      result(8, { severity: "medium", outcome: "pass", label: "correct" }),
      result(9, { severity: "low", outcome: "pass", label: "correct" }),
    ],
  };
}

type Posted = { method: string; path: string; body: Record<string, unknown> };
/** Routes the readout API on the whole browser context, so the presenter popup gets it too. */
async function routeReadout(context: BrowserContext, options: { operator?: boolean } = {}) {
  const posted: Posted[] = [];
  const operator = options.operator ?? true;
  const deck = { transcriptIds: null as string[] | null, nextStep: null as string | null, updatedAt: null };
  let notes: Record<string, string> = { cover: NOTE };
  let polls = 0;
  await context.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const body = method === "GET" ? {} : (route.request().postDataJSON() as Record<string, unknown>);
    if (method !== "GET") posted.push({ method, path: url.pathname, body });
    const state = () => ({ access: { present: true, notes: operator, edit: operator }, revision: { id: REVISION, report_id: REPORT, created_at: CREATED, review_status: "preliminary", snapshot: snapshot() }, defaultNextStep: "pilot", deck, ...(operator ? { notes } : {}) });
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/readout` && method === "GET") return route.fulfill({ json: { data: state(), meta: {} } });
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/readout` && method === "PUT") {
      if ("transcriptIds" in body) deck.transcriptIds = body.transcriptIds as string[] | null;
      if ("nextStep" in body) deck.nextStep = body.nextStep as string | null;
      const next = { ...notes };
      for (const [key, value] of Object.entries((body.notes ?? {}) as Record<string, string | null>)) {
        if (value == null) delete next[key];
        else next[key] = value;
      }
      notes = next;
      return route.fulfill({ json: { data: state(), meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/readout/presented`) return route.fulfill({ json: { data: { recorded: true }, meta: {} } });
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/readout/export`) return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000351", status: "queued", artifact_id: null }, meta: {} } });
    if (url.pathname === "/api/evals/v1/exports/00000000-0000-4000-8000-000000000351") {
      polls += 1;
      return route.fulfill({ json: { data: polls < 2 ? { id: "00000000-0000-4000-8000-000000000351", status: "running", artifact_id: null } : { id: "00000000-0000-4000-8000-000000000351", status: "completed", artifact_id: "00000000-0000-4000-8000-000000000361", download_path: "/x" }, meta: {} } });
    }
    if (url.pathname.startsWith("/api/evals/v1/report-artifacts/")) return route.fulfill({ status: 200, headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="Caudals-Investment-assistant-readout-2026-10-08.pdf"' }, body: "%PDF-1.4\n" });
    if (url.pathname === `/api/evals/v1/reports/${REPORT}`) {
      return route.fulfill({ json: { data: { report: { current_revision_id: REVISION, publication_status: "published", title: "Investment assistant" }, revisions: [{ id: REVISION, run_id: RUN, review_status: "preliminary", created_at: CREATED, snapshot: snapshot() }] }, meta: {} } });
    }
    if (url.pathname.startsWith("/api/evals/v1/reports/") || url.pathname === "/api/evals/v1/runs") return route.fulfill({ json: { data: [], meta: {} } });
    return route.fallback();
  });
  return posted;
}
const presentUrl = (query = "") => `/workspace/reports/${REPORT}/present?orgId=${ORG}&revision=${REVISION}&mode=operators${query}`;
const currentSlide = (page: Page) => page.locator(".p-readout-stage .rd-slide").getAttribute("data-slide");
const counter = (page: Page) => page.locator("[data-counter] [aria-hidden]").innerText();
// Ten slides: cover, verdict, causes, five transcripts (one per cause), fixes, next step.
const SLIDES = 10;

test("Present appears on the report for operators, then owners and editors, never viewers", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeReadout(context);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner`);
  await expect(page.getByRole("heading", { name: "Investment assistant", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Present" })).toHaveCount(0);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&mode=operators`);
  const present = page.getByRole("link", { name: "Present" });
  await expect(present).toBeVisible();
  expect(await present.getAttribute("href")).toBe(`/workspace/reports/${REPORT}/present?revision=${REVISION}&orgId=${ORG}`);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&viewer&mode=operators`);
  await expect(page.getByRole("heading", { name: "Investment assistant", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Present" })).toHaveCount(0);
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&viewer&mode=all`);
  await expect(page.getByRole("link", { name: "Present" })).toBeVisible();
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&viewer&mode=all`);
  await expect(page.getByRole("heading", { name: "Investment assistant", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Present" })).toHaveCount(0);
});

for (const [width, height] of [[390, 844], [768, 1024], [1440, 900], [1920, 1080]] as const) {
  test(`readout at ${width}×${height}: keyboard, layout and readable text`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    const posted = await routeReadout(context);
    await page.goto(presentUrl());
    await expect(page.locator(".p-readout[data-view=audience]")).toBeVisible();
    expect(await currentSlide(page)).toBe("cover");
    expect(await counter(page)).toBe(`1 / ${SLIDES}`);
    await expect.poll(() => posted.filter((item) => item.path.endsWith("/readout/presented")).length).toBe(1);
    expect(posted.find((item) => item.path.endsWith("/readout/presented"))!.body).toEqual({ orgId: ORG, revisionId: REVISION, slideCount: SLIDES });

    await page.keyboard.press("ArrowRight");
    expect(await currentSlide(page)).toBe("verdict");
    await page.keyboard.press(" ");
    expect(await currentSlide(page)).toBe("causes");
    await page.keyboard.press("ArrowLeft");
    expect(await currentSlide(page)).toBe("verdict");
    await page.keyboard.press("End");
    expect(await currentSlide(page)).toBe("next");
    expect(await counter(page)).toBe(`${SLIDES} / ${SLIDES}`);
    await page.keyboard.press("ArrowRight");
    expect(await currentSlide(page)).toBe("next");
    await page.keyboard.press("Home");
    expect(await currentSlide(page)).toBe("cover");
    await page.keyboard.press("4");
    expect(await currentSlide(page)).toBe("transcript:a1");
    await page.keyboard.press("1");
    await page.keyboard.press("0");
    expect(await currentSlide(page)).toBe("next");
    await page.keyboard.press("9");
    expect(await currentSlide(page)).toBe("fixes");
    // The buttons do the same.
    await page.getByRole("button", { name: "Previous slide" }).click();
    expect(await currentSlide(page)).toBe("transcript:a6");

    // Every slide fits: nothing clipped or wider than the slide; no horizontal scroll.
    for (let index = 0; index < SLIDES; index++) {
      await page.keyboard.press(index === 0 ? "Home" : "ArrowRight");
      expect(await slideProblems(page), `slide ${index + 1}`).toEqual([]);
      expect(await noHorizontalScroll(page)).toBe(true);
      // On a projector, body text is at least 24 px.
      if (width === 1920) expect(await smallestBodyText(page), `slide ${index + 1}`).toBeGreaterThanOrEqual(24);
    }

    // Esc leaves for the report.
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/workspace\/reports\/[^/]+\?/);
    expect(new URL(page.url()).pathname).toBe(`/workspace/reports/${REPORT}`);
  });
}

test("the presenter window shows the current and next slide, notes and a timer, in sync both ways", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeReadout(context);
  await page.goto(presentUrl());
  await expect(page.locator(".p-readout[data-view=audience]")).toBeVisible();
  const [presenter] = await Promise.all([context.waitForEvent("page"), page.keyboard.press("p")]);
  await presenter.waitForLoadState();
  await expect(presenter.locator(".p-readout[data-view=presenter]")).toBeVisible();
  expect(new URL(presenter.url()).searchParams.get("view")).toBe("presenter");
  await expect(presenter.locator("[data-current] .rd-slide")).toHaveAttribute("data-slide", "cover");
  await expect(presenter.locator("[data-upcoming] .rd-slide")).toHaveAttribute("data-slide", "verdict");
  await expect(presenter.locator("[data-notes]")).toHaveText(NOTE);
  await expect(presenter.locator("[data-elapsed]")).toHaveText(/^\d+:\d\d$/);

  // Audience → presenter.
  await page.keyboard.press("ArrowRight");
  await expect(presenter.locator("[data-current] .rd-slide")).toHaveAttribute("data-slide", "verdict");
  // The verdict has no saved note: the §7.5 script is the default.
  await expect(presenter.locator("[data-notes]")).toContainText("Read the three sentences");
  // Presenter → audience.
  await presenter.keyboard.press("ArrowRight");
  await expect.poll(() => currentSlide(page)).toBe("causes");
  await presenter.keyboard.press("End");
  await expect.poll(() => currentSlide(page)).toBe("next");
  await expect(presenter.locator(".p-readout-end")).toHaveText("End of the readout");
  // The timer pauses and resumes for both.
  await presenter.getByRole("button", { name: "Pause" }).click();
  await expect(presenter.getByRole("button", { name: "Resume" })).toBeVisible();
  // Leaving the readout closes the presenter window.
  const closed = presenter.waitForEvent("close");
  await page.keyboard.press("Escape");
  await closed;
});

test("owners and editors present without notes", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const posted = await routeReadout(context, { operator: false });
  await page.goto(`/workspace/reports/${REPORT}/present?orgId=${ORG}&revision=${REVISION}&mode=all&owner&viewer&view=presenter`);
  await expect(page.locator(".p-readout[data-view=presenter]")).toBeVisible();
  await expect(page.locator("[data-current] .rd-slide")).toHaveAttribute("data-slide", "cover");
  await expect(page.locator("[data-notes]")).toHaveCount(0);
  await expect(page.getByText(NOTE)).toHaveCount(0);
  await page.goto(`/workspace/reports/${REPORT}/present?orgId=${ORG}&revision=${REVISION}&mode=all&owner&viewer`);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.locator("[data-readout-panel] textarea")).toHaveCount(0);
  await page.locator("#readout-next-step").selectOption("subscription");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.keyboard.press("End");
  await expect(page.locator(".p-readout-stage [data-next]")).toHaveAttribute("data-next", "subscription");
  // Nothing is saved for a customer role.
  expect(posted.filter((item) => item.method === "PUT")).toEqual([]);
  // With the flag at "operators", the owner cannot present.
  await page.goto(`/workspace/reports/${REPORT}/present?orgId=${ORG}&revision=${REVISION}&mode=operators&owner&viewer`);
  await expect(page.getByText("Readout mode is not available for your role in this workspace.")).toBeVisible();
});

test("operators swap transcripts, write notes and choose the next step, saved per revision", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const posted = await routeReadout(context);
  await page.goto(presentUrl());
  await page.getByRole("button", { name: "Notes and transcripts" }).click();
  const panel = page.locator("[data-readout-panel]");
  await expect(panel.getByText("Notes are visible only to Caudals operators.", { exact: false })).toBeVisible();
  await panel.locator("#readout-pick-0").selectOption("a7");
  await panel.locator("#readout-note-verdict").fill("Pause after the score.");
  await panel.locator("#readout-next-step").selectOption("subscription");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel).toHaveCount(0);
  const saved = posted.find((item) => item.method === "PUT")!;
  expect(saved.body).toMatchObject({ orgId: ORG, revisionId: REVISION, nextStep: "subscription", notes: { verdict: "Pause after the score." } });
  expect((saved.body.transcriptIds as string[])[0]).toBe("a7");
  await page.keyboard.press("4");
  expect(await currentSlide(page)).toBe("transcript:a7");
  await expect(page.locator(".p-readout-stage [data-result-number]")).toContainText("Result T");
  await expect(page.locator(".p-readout-stage [data-excerpt]")).toContainText("The minimum is €1,000.");
});

test("Export PDF queues the 16:9 readout with the deck on screen and downloads it", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const posted = await routeReadout(context);
  await page.goto(presentUrl());
  const download = page.waitForRequest((request) => request.url().includes("/api/evals/v1/report-artifacts/"));
  await page.getByRole("button", { name: "Export PDF" }).click();
  const request = await download;
  const exported = posted.find((item) => item.path.endsWith("/readout/export"))!;
  expect(exported.body).toEqual({ orgId: ORG, revisionId: REVISION, locale: "en", transcriptIds: ["a1", "a3", "a5", "a4", "a6"], nextStep: "pilot" });
  const url = new URL(request.url());
  expect(url.searchParams.get("orgId")).toBe(ORG);
  expect(url.searchParams.get("name")).toBe("Investment assistant readout");
});

test("Full screen, reduced motion and Spanish", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeReadout(context);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await page.goto(presentUrl());
  await expect(page.locator(".p-readout[data-view=audience]")).toBeVisible();
  expect(await page.locator(".p-readout-slide").evaluate((element) => getComputedStyle(element).animationName)).toBe("p-readout-fade");
  await expect(page.getByRole("button", { name: "Vista del presentador" })).toBeVisible();
  await page.keyboard.press("2");
  await expect(page.locator(".p-readout-stage .rd-slide")).toContainText("33 %");
  await expect(page.locator(".p-readout-stage .rd-slide")).toContainText("Veredicto");
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test("the example evaluation presents read-only, with notes on this device and no export", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const posted = await routeReadout(context);
  await page.goto("/workspace/example?mode=operators");
  await page.getByRole("link", { name: "Present" }).click();
  await page.waitForURL(/\/workspace\/example\/present/);
  // The harness router drops `mode`; re-open with it, as the server would pass the flag.
  await page.goto("/workspace/example/present?mode=operators");
  await expect(page.locator(".p-readout[data-view=audience]")).toBeVisible();
  await expect(page.locator(".p-readout-stage .rd-slide")).toContainText("Example");
  await expect(page.getByRole("button", { name: "Export PDF" })).toHaveCount(0);
  await page.getByRole("button", { name: "Notes and transcripts" }).click();
  await expect(page.getByText("Example: your notes and transcript choices stay on this device.")).toBeVisible();
  await page.locator("#readout-note-cover").fill("Demo deck note.");
  await page.getByRole("button", { name: "Save" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("caudals.readout.example") ?? "{}").notes)).toEqual({ cover: "Demo deck note." });
  expect(posted).toEqual([]);
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/workspace\/example(\?|$)/);
});
