/**
 * The browser half of L-02's scripted funnel (launch G1, spec v2 §4.20,
 * §8.3 L-02): one visitor walks the real pages with the root tracker mounted
 * and must send every client event of the taxonomy — page_view, demo_viewed,
 * example_viewed (workspace, public, PDF), pilot_requested,
 * readout_link_clicked and expert_review_requested — only after consent, each
 * with allowlisted properties, a route template as path and no personal data.
 * The database half (tests/evals/funnel-events-db.test.ts) posts the same
 * bodies through the real ingestion route and checks what is stored.
 */
import { expect, test, type Page } from "@playwright/test";
import { ATTRIBUTION_KEYS, CLIENT_EVENT_NAMES, analyticsPath, sanitizePayload, type ClientEventName } from "../../lib/analytics/events";

const ORG = "00000000-0000-4000-8000-000000000001";
const REPORT = "00000000-0000-4000-8000-000000000301";
const REVISION = "00000000-0000-4000-8000-000000000311";
const RUN = "00000000-0000-4000-8000-000000000321";
const CREATED = "2026-10-08T10:00:00.000Z";
type Sent = { eventName: ClientEventName; payload: Record<string, unknown>; attribution: Record<string, string>; path: string | null; sessionId: string | null; consent: boolean };

function snapshot() {
  const result = (n: number, outcome: "pass" | "fail") => ({
    case_revision_id: `case-${n}`, title: `Question ${n}`, topic: "fees", severity: "high", outcome, assessment_id: `a${n}`, observation_id: `o${n}`,
    input: `What fee applies in case ${n}?`, output: "0.60% a year.", rationale: outcome === "pass" ? "Correct." : "States 0.60% instead of 0.40%.",
    source_refs: [{ source_revision_id: "src-1", anchor: "fees" }], review_status: "unreviewed", label: outcome === "pass" ? "correct" : "incorrect",
    expected: "0.40% a year.", failure_category: outcome === "pass" ? null : "wrong_information", likely_cause: outcome === "pass" ? null : "outdated_document",
  });
  return {
    schema_version: "1.0", report_revision_id: REVISION, run_id: RUN, created_at: CREATED, content_hash: "a".repeat(64),
    system: { name: "Investment assistant", target_revision_id: "t1", purpose: "Answers customers' questions about fees.", execution_mode: "deployed_system" },
    scope: { suite_version_id: "s1", evidence_policy: "source_grounded", started_at: CREATED, finished_at: CREATED, languages: ["en"], review_status: "preliminary" },
    metrics: { n_planned: 2, n_eligible: 2, n_executed: 2, n_scorable: 2, n_pass: 1, n_partial: 0, n_fail: 1, n_unscorable: 0, n_pending: 0, n_unresolved: 0, strict_pass_rate: 0.5, rubric_score: null, assessed_coverage: 1, execution_completion: 1, pass_bounds: null, wilson_interval: null, family_cluster_interval: null, critical_unassessed: 0, headline_status: "complete" },
    findings: [], results: [result(1, "fail"), result(2, "pass")], improvements: [], takeaways: [],
    methodology: { cef_version: "1.0", scorer_version: "v", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "All", exclusions: [], review_coverage: "Automated", cost: null, limitations: [] },
  };
}

/** Every API the walk touches, and the tracker's two endpoints. Links that would leave the page are kept on it, so each click is counted once. */
async function routeFunnel(page: Page) {
  const state = { events: [] as Sent[], configCalls: 0 };
  await page.addInitScript(() => {
    addEventListener("click", (event) => {
      const href = (event.target as Element | null)?.closest?.("a")?.getAttribute("href") ?? "";
      if (/\/(call|contact)(\?|$)|\.pdf$|cal\.com/.test(href)) event.preventDefault();
    }, true);
  });
  await page.route("**/api/analytics/config", (route) => { state.configCalls++; return route.fulfill({ json: { enabled: true } }); });
  await page.route("**/api/analytics/track", (route) => { state.events.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); });
  await page.route("**/api/evals/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/evals/v1/reports/${REPORT}`) {
      return route.fulfill({ json: { data: { report: { current_revision_id: REVISION, publication_status: "published", title: "Investment assistant — October" }, revisions: [{ id: REVISION, run_id: RUN, review_status: "preliminary", created_at: CREATED, snapshot: snapshot() }] }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/reports/${REPORT}/expert-review`) {
      if (route.request().method() === "GET") return route.fulfill({ json: { data: { request: null }, meta: {} } });
      return route.fulfill({ json: { data: { created: true, request: { id: "00000000-0000-4000-8000-000000000801", status: "requested", scopeKind: "whole_report", createdAt: new Date().toISOString(), replyDueAt: new Date(Date.now() + 86_400_000).toISOString(), dueAt: null, deliveredAt: null } }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/runs/${RUN}`) {
      return route.fulfill({ json: { data: { run: { id: RUN, status: "completed", phase: "done", execution_mode: "deployed_system", suite_version_id: "s1", created_at: CREATED, reason_code: null }, units: [], targetUsage: { calls: 2, unknown: 0 } }, meta: {} } });
    }
    if (url.pathname === "/api/evals/v1/workspace/summary") {
      return route.fulfill({ json: { data: {
        evaluations: [], systems: [], reports: [{ id: REPORT, title: "Investment assistant — October", current_revision_id: REVISION, evaluation_id: "e", run_id: RUN, updated_at: CREATED }],
        entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: true },
        usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
      }, meta: {} } });
    }
    if (url.pathname.startsWith("/api/evals/v1/reports/") || url.pathname === "/api/evals/v1/runs") return route.fulfill({ json: { data: [], meta: {} } });
    return route.fallback();
  });
  return state;
}
const consent = (page: Page, value: "accepted" | "rejected") => page.evaluate((choice) => {
  localStorage.setItem("caudals_cookie_consent", choice);
  dispatchEvent(new Event("caudals:cookie-consent"));
}, value);
const named = (events: Sent[], name: ClientEventName) => events.filter((event) => event.eventName === name);

test("scripted funnel: every client event fires once consented, allowlisted and without personal data", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await routeFunnel(page);

  // 1. Landing from a newsletter link: nothing is sent, or even configured, before consent.
  await page.goto("/en?track&utm_source=newsletter&utm_campaign=g1-funnel");
  await expect(page.locator('a[href^="/en/call"]').first()).toBeVisible();
  await page.locator('a[href^="/en/call"]').first().click();
  await page.waitForTimeout(200);
  expect(state.events).toEqual([]);
  expect(state.configCalls).toBe(0);
  await consent(page, "accepted");
  await expect.poll(() => named(state.events, "page_view").length).toBe(1);
  // A booking link is a readout request; the contact form a pilot request.
  await page.locator('a[href^="/en/call"]').first().click();
  await page.locator('a[href^="/en/contact"]').first().click();
  await expect.poll(() => named(state.events, "readout_link_clicked").length).toBe(1);
  await expect.poll(() => named(state.events, "pilot_requested").length).toBe(1);

  // 2. The public demo.
  await page.goto("/en/demo?track");
  await expect.poll(() => named(state.events, "demo_viewed").length).toBe(1);

  // 3. The public sample report, its PDF and its pilot request.
  await page.goto("/en/sample-report?track");
  await expect.poll(() => named(state.events, "example_viewed").length).toBe(1);
  await page.getByRole("link", { name: "Download the PDF" }).first().click();
  await page.locator('a[href^="/en/contact"]').first().click();
  await expect.poll(() => named(state.events, "example_viewed").length).toBe(2);
  await expect.poll(() => named(state.events, "pilot_requested").length).toBe(2);

  // 4. Signed in: the example evaluation, then a report — "Book a readout" and "Have an expert review this".
  await page.goto(`/workspace/example?owner&track&orgId=${ORG}`);
  await expect.poll(() => named(state.events, "example_viewed").length).toBe(3);
  await page.context().route("https://cal.com/**", (route) => route.fulfill({ body: "booking", headers: { "content-type": "text/plain" } }));
  await page.goto(`/workspace/reports/actions?orgId=${ORG}&owner&expert-review&track`);
  const steps = page.locator(".p-summary-cta");
  await steps.getByRole("link", { name: "Book a readout" }).click();
  await expect.poll(() => named(state.events, "readout_link_clicked").length).toBe(2);
  await steps.getByRole("button", { name: "Have an expert review this" }).click();
  const dialog = page.getByRole("dialog", { name: "Have an expert review this" });
  await dialog.getByLabel("The whole report").check();
  await dialog.getByLabel("Sector").selectOption("insurance");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect.poll(() => named(state.events, "expert_review_requested").length).toBe(1);

  // Every client event of §4.20 was sent, from the surfaces that own it.
  expect([...new Set(state.events.map((event) => event.eventName))].sort()).toEqual([...CLIENT_EVENT_NAMES].sort());
  expect(named(state.events, "example_viewed").map((event) => event.payload.surface)).toEqual(["public", "pdf", "workspace"]);
  expect(named(state.events, "pilot_requested").map((event) => event.payload.surface)).toEqual(["public", "public"]);
  expect(named(state.events, "readout_link_clicked").map((event) => event.payload.surface)).toEqual(["public", "report"]);
  expect(named(state.events, "expert_review_requested")[0].payload).toEqual({ surface: "report" });
  expect(named(state.events, "demo_viewed")[0].payload).toEqual({ locale: "en" });
  expect(named(state.events, "page_view").every((event) => event.payload.locale === "en")).toBe(true);

  // Allowlisted properties only, route templates as paths, one pseudonymous session, the first touch kept, nothing personal.
  const session = state.events[0].sessionId;
  expect(session).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  for (const event of state.events) {
    expect(event.consent).toBe(true);
    expect(event.payload, event.eventName).toEqual(sanitizePayload(event.eventName, event.payload as Record<string, string>));
    expect(Object.keys(event.attribution).every((key) => (ATTRIBUTION_KEYS as readonly string[]).includes(key))).toBe(true);
    expect(event.attribution).toMatchObject({ utm_source: "newsletter", utm_campaign: "g1-funnel" });
    expect(event.path, event.eventName).toBe(analyticsPath(event.path));
    expect(event.path ?? "").not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}|\?|#/);
    expect(event.sessionId).toBe(session);
  }
  expect(JSON.stringify(state.events)).not.toMatch(/@|operator@example|Test operator|Investment assistant|What fee applies/);

  // 5. Withdrawal stops everything.
  await consent(page, "rejected");
  const sent = state.events.length;
  await page.goto("/en/demo?track");
  await page.waitForTimeout(300);
  expect(state.events).toHaveLength(sent);
});
