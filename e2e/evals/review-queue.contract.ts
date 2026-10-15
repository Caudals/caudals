/**
 * UI contracts for "Assign to me" in the ops review queue (launch G1, spec v2
 * §5.3, the L-21 leftover): claim, release and explicit take-over on test sets
 * awaiting approval and results needing review, the assignee filter, the
 * conflict when someone else got there first, Spanish, and 390/768/1440 px.
 * Runs against the isolated harness (ui.config.ts).
 */
import { expect, test, type Page } from "@playwright/test";

const ORG = "00000000-0000-4000-8000-000000000001";
const EVALUATION = "00000000-0000-4000-8000-000000000501";
const FIRST = "00000000-0000-4000-8000-0000000000c1";
const SECOND = "00000000-0000-4000-8000-0000000000c2";
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const item = (assessment_id: string, question: string, hours: number) => ({
  assessment_id, created_at: hoursAgo(hours), outcome: "fail", review_status: "needs_review", rationale: "r", criteria: [],
  case_title: question, severity: "high", question, answer: "a", expected: "e", source_refs: [], evaluation_title: "Support", judge_reason: null, judge_calibration: null,
});
const summary = {
  evaluations: [{ id: EVALUATION, title: "Claims assistant review", project_id: "p", project_title: "Claims", preparation_status: "needs_review", updated_at: hoursAgo(30) }],
  systems: [], reports: [],
  entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: true },
  usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
};
type Held = { subjectKind: "evaluation" | "assessment"; subjectId: string; assigneeId: string; assigneeName: string | null; assignedAt: string; mine: boolean };

/** The queue's API with an in-memory assignment store; `conflict` makes the next claim lose a race. */
async function routeQueue(page: Page) {
  const state = { posts: [] as Array<Record<string, unknown>>, gets: 0, conflict: false,
    held: [{ subjectKind: "assessment", subjectId: SECOND, assigneeId: "ben", assigneeName: "Ben Operator", assignedAt: hoursAgo(3), mine: false }] as Held[] };
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/evals/v1/workspace/summary") return route.fulfill({ json: { data: summary, meta: {} } });
    if (url.pathname === "/api/evals/v1/reviews") return route.fulfill({ json: { data: [item(FIRST, "Can I get a refund?", 30), item(SECOND, "How long is the warranty?", 2)], meta: {} } });
    if (url.pathname === "/api/evals/v1/review-assignments" && route.request().method() === "GET") {
      state.gets++;
      expect(url.searchParams.get("orgId")).toBe(ORG);
      return route.fulfill({ json: { data: state.held, meta: {} } });
    }
    if (url.pathname === "/api/evals/v1/review-assignments") {
      const body = route.request().postDataJSON();
      state.posts.push(body);
      if (state.conflict) {
        state.conflict = false;
        state.held.push({ subjectKind: body.subjectKind, subjectId: body.subjectId, assigneeId: "ben", assigneeName: "Ben Operator", assignedAt: hoursAgo(0), mine: false });
        return route.fulfill({ status: 409, json: { error: { code: "REVIEW_ASSIGNED", message: "Someone else is already reviewing this item. Refresh the queue, or take it over.", field_errors: [], request_id: "r", retryable: false } } });
      }
      state.held = state.held.filter((row) => !(row.subjectKind === body.subjectKind && row.subjectId === body.subjectId));
      if (body.action === "release") return route.fulfill({ json: { data: { assignment: null }, meta: {} } });
      const claim = { subjectKind: body.subjectKind, subjectId: body.subjectId, assigneeId: "test-user", assigneeName: "Test operator", assignedAt: new Date().toISOString(), mine: true };
      state.held.push(claim);
      return route.fulfill({ json: { data: { assignment: claim }, meta: {} } });
    }
    return route.fulfill({ json: { data: [], meta: {} } });
  });
  return state;
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const width of [390, 768, 1440] as const) {
  test(`review queue: assign to me, unassign and take over at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await routeQueue(page);
    await page.goto("/ops/review");
    const results = page.getByRole("table", { name: "Results needing review" });
    const first = results.getByRole("row", { name: /Can I get a refund/ });
    const second = results.getByRole("row", { name: /How long is the warranty/ });
    // SLA timers stay; the holder and how long they have held it show beside them.
    await expect(first).toContainText("30 h");
    await expect(second).toContainText("Ben Operator");
    await expect(second).toContainText("3 h");

    await first.getByRole("button", { name: "Assign to me: Can I get a refund?" }).click();
    await expect(first.getByText("You", { exact: true })).toBeVisible();
    await expect(page.getByText("Assigned to you.")).toBeVisible();
    await first.getByRole("button", { name: "Unassign: Can I get a refund?" }).click();
    await expect(first.getByRole("button", { name: "Assign to me: Can I get a refund?" })).toBeVisible();

    // Someone else's item is taken over only explicitly.
    await expect(second.getByRole("button", { name: /Assign to me/ })).toHaveCount(0);
    await second.getByRole("button", { name: "Take over: How long is the warranty?" }).click();
    await expect(second.getByText("You", { exact: true })).toBeVisible();
    await expect(page.getByText("You took this over.")).toBeVisible();

    // Test sets awaiting approval are claimed the same way.
    const approvals = page.getByRole("table", { name: "Test sets awaiting approval" });
    const set = approvals.getByRole("row", { name: /Claims assistant review/ });
    await expect(set).toContainText("30 h");
    await set.getByRole("button", { name: "Assign to me: Claims assistant review" }).click();
    await expect(set.getByText("You", { exact: true })).toBeVisible();

    expect(state.posts).toEqual([
      { orgId: ORG, subjectKind: "assessment", subjectId: FIRST, action: "assign" },
      { orgId: ORG, subjectKind: "assessment", subjectId: FIRST, action: "release" },
      { orgId: ORG, subjectKind: "assessment", subjectId: SECOND, action: "assign", takeOver: true },
      { orgId: ORG, subjectKind: "evaluation", subjectId: EVALUATION, action: "assign" },
    ]);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/caudals-g1-review-queue-${width}.png`, fullPage: true });
  });
}

test("review queue: the assignee filter shows mine and unassigned items", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeQueue(page);
  await page.goto("/ops/review");
  const filter = page.getByRole("group", { name: "Filter by assignee" });
  const results = page.getByRole("table", { name: "Results needing review" });
  await expect(filter.getByRole("button", { name: /All\s*3/ })).toBeVisible();
  await expect(filter.getByRole("button", { name: /Unassigned\s*2/ })).toBeVisible();
  await results.getByRole("button", { name: "Assign to me: Can I get a refund?" }).click();
  await expect(filter.getByRole("button", { name: /Assigned to me\s*1/ })).toBeVisible();

  await filter.getByRole("button", { name: /Assigned to me/ }).click();
  await expect(results.getByRole("row", { name: /Can I get a refund/ })).toBeVisible();
  await expect(results.getByRole("row", { name: /How long is the warranty/ })).toHaveCount(0);
  await expect(page.getByText("Nothing here matches this filter.")).toBeVisible(); // the test set is nobody's yet

  await filter.getByRole("button", { name: /Unassigned/ }).click();
  await expect(page.getByRole("table", { name: "Test sets awaiting approval" }).getByRole("row", { name: /Claims assistant review/ })).toBeVisible();
  await expect(page.getByText("Nothing here matches this filter.")).toBeVisible(); // both results are held

  await filter.getByRole("button", { name: /All/ }).click();
  await expect(results.getByRole("row")).toHaveCount(3);
});

test("review queue: losing a race says so and shows who has the item", async ({ page }) => {
  const state = await routeQueue(page);
  await page.goto("/ops/review");
  await expect.poll(() => state.gets).toBe(1);
  state.conflict = true;
  const first = page.getByRole("table", { name: "Results needing review" }).getByRole("row", { name: /Can I get a refund/ });
  await first.getByRole("button", { name: "Assign to me: Can I get a refund?" }).click();
  await expect(page.getByText("Someone else is already reviewing this item. Refresh the queue, or take it over.")).toBeVisible();
  // The queue reloads its assignments: the winner shows, with Take over.
  await expect(first).toContainText("Ben Operator");
  await expect(first.getByRole("button", { name: "Take over: Can I get a refund?" })).toBeVisible();
  expect(state.gets).toBe(2);
});

test("review queue: assignment controls are in Spanish for Spanish readers", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
  await routeQueue(page);
  await page.goto("/ops/review");
  await expect(page.getByRole("group", { name: "Filtrar por persona asignada" })).toBeVisible();
  const row = page.getByRole("row", { name: /Can I get a refund/ });
  await row.getByRole("button", { name: "Asignármelo: Can I get a refund?" }).click();
  await expect(row.getByText("Tú", { exact: true })).toBeVisible();
  await expect(page.getByText("Asignado a ti.")).toBeVisible();
  await expect(page.getByRole("row", { name: /How long is the warranty/ }).getByRole("button", { name: "Hacerme cargo: How long is the warranty?" })).toBeVisible();
});
