import { expect, test, type Page } from "@playwright/test";
import { seriousAxeViolations } from "./axe";
import { id as billingOrg, routeBilling } from "./billing-fixtures";
import { expectSpanishOnly } from "./spanish-leaks";

/**
 * UI review leftovers (launch U1, after R1–R4): Settings → Members lists the
 * people in the workspace above its invitations; page headings stack cleanly
 * at 390 px on every page (the title takes the whole row, the actions sit
 * under it, nothing runs past the canvas); Limits and alerts names each
 * control once; the AI model tables stack on a phone; the API reference sets
 * headers, fields and codes as code.
 */
const ORG = "00000000-0000-4000-8000-000000000001";
const LONG = "Synthetic policy A chatbot evaluation for the customer portal (production)";
const now = new Date().toISOString();
const evaluation = {
  id: "00000000-0000-4000-8000-000000000501", title: LONG, project_id: "00000000-0000-4000-8000-000000000601",
  project_title: "Claims", project_description: "", latest_source_id: null, latest_source_revision_id: null,
  preparation_status: "ready", reason_code: null, selected_suite_version_id: "00000000-0000-4000-8000-000000000701",
  commercial_cap: "500", currency: "EUR", latest_run_id: null, latest_run_status: null, latest_run_phase: null, created_at: now, updated_at: now,
};
const summary = {
  evaluations: [evaluation], systems: [], reports: [],
  entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["openai_compatible"], can_export: true, can_schedule: true },
  usage: { settled: "0", outstanding: "0" },
  preferences: { completion: true, required_input: true, failure: true, email: false },
};
const members = [
  { user_id: "u-owner", name: "Ana Torres", email: "ana@acme.example", role: "owner", joined_at: "2026-09-01T10:00:00.000Z", partner_managed: false, is_self: true },
  { user_id: "u-editor", name: "Luis Romero", email: "luis@acme.example", role: "editor", joined_at: "2026-09-12T10:00:00.000Z", partner_managed: false, is_self: false },
  { user_id: "u-viewer", name: null, email: "vera@acme.example", role: "viewer", joined_at: "2026-10-02T10:00:00.000Z", partner_managed: false, is_self: false },
  { user_id: "u-partner", name: "Paula Gil", email: "paula@agencia.example", role: "viewer", joined_at: "2026-10-05T10:00:00.000Z", partner_managed: true, is_self: false },
];
const invitations = [{ id: "i1", email: "nuevo@acme.example", role: "editor", expires_at: new Date(Date.now() + 86_400_000).toISOString(), accepted_at: null, revoked_at: null }];

/** Every API answer the pages below need; anything else is an empty list. */
async function serve(page: Page, extra: Record<string, unknown> = {}) {
  await page.route("**/api/evals/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/evals/v1", "");
    const data = path in extra ? extra[path] : path === "/workspace/summary" ? summary : path.endsWith("/members") ? members : path.endsWith("/invitations") ? invitations : [];
    await route.fulfill({ json: { data, meta: {} } });
  });
}
/** How far anything runs past the right edge: the document, the shell's canvas, or a table's own scroll box. */
const sideways = (page: Page, selector = ".p-canvas, .p-table-wrap") => page.evaluate((target) => Math.max(document.documentElement.scrollWidth - innerWidth,
  ...[...document.querySelectorAll<HTMLElement>(target)].map((node) => node.scrollWidth - node.clientWidth)), selector);
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });

/* ------------------------------------------------------------- members --- */

test("Members lists everyone with their role above the invitations; an owner cannot change roles", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  // `viewer` in the address drops the harness's platform role: a customer owner.
  await page.goto(`/workspace/settings?owner&viewer&orgId=${ORG}&tab=members`);
  const people = page.getByRole("table", { name: "People in this workspace" });
  await expect(people.getByRole("rowheader")).toHaveCount(4);
  const self = people.getByRole("row", { name: /Ana Torres/ });
  await expect(self).toContainText("You");
  await expect(self).toContainText("ana@acme.example");
  await expect(self).toContainText("Owner");
  await expect(self).toContainText(/1 Sept? 2026/);
  await expect(people.getByRole("row", { name: /Luis Romero/ })).toContainText("Editor");
  // Without a name, the address is the title.
  await expect(people.getByRole("rowheader", { name: "vera@acme.example" })).toBeVisible();
  await expect(people.getByRole("row", { name: /Paula Gil/ })).toContainText("Partner access");
  await expect(page.getByRole("button", { name: "Edit role" })).toHaveCount(0);
  // The invitations follow under their own heading, with the pending one revocable.
  await expect(page.getByRole("heading", { name: "Invitations", level: 2 })).toBeVisible();
  const pending = page.getByRole("table", { name: "Invitations" }).getByRole("row", { name: /nuevo@acme\.example/ });
  await expect(pending).toContainText("Pending");
  await expect(pending.getByRole("button", { name: "Revoke invitation" })).toBeVisible();
  // The people come first.
  const [list, invited] = [await people.boundingBox(), await page.getByRole("table", { name: "Invitations" }).boundingBox()];
  expect(list!.y).toBeLessThan(invited!.y);
  expect(await seriousAxeViolations(page, { include: "#p-main" })).toEqual([]);
  await page.screenshot({ path: "/tmp/evals-u1-members-1440.png", fullPage: true });

  // A phone: each person is one block, nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(people.locator("td[data-label='Joined']").first()).toBeVisible();
  expect(await sideways(page)).toBe(0);
  const title = await people.getByRole("rowheader").first().boundingBox();
  expect(title!.width).toBeGreaterThan(250);
  await page.screenshot({ path: "/tmp/evals-u1-members-390.png", fullPage: true });
});

test("Members: platform admins change a role from the same list; no invitations reads as one line", async ({ page }) => {
  await serve(page, { [`/workspaces/${ORG}/invitations`]: [] });
  await page.goto(`/workspace/settings?owner&admin&orgId=${ORG}&tab=members`);
  await expect(page.getByRole("table", { name: "People in this workspace" }).getByRole("button", { name: "Edit role" })).toHaveCount(4);
  await expect(page.getByText("No invitations yet")).toBeVisible();
  await expect(page.getByRole("table", { name: "Invitations" })).toHaveCount(0);
});

test("Members in Spanish", async ({ page }) => {
  await spanish(page);
  await serve(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/settings?owner&viewer&orgId=${ORG}&tab=members`);
  const people = page.getByRole("table", { name: "Personas en este espacio" });
  await expect(people.getByRole("row", { name: /Ana Torres/ })).toContainText("Tú");
  await expect(people.getByRole("row", { name: /Ana Torres/ })).toContainText("Propietario");
  await expect(people.getByRole("row", { name: /Paula Gil/ })).toContainText("Acceso de partner");
  await expect(page.getByRole("heading", { name: "Invitaciones", level: 2 })).toBeVisible();
  expect(await sideways(page)).toBe(0);
  await expectSpanishOnly(page, "members");
});

/* --------------------------------------------------- headings on phones --- */

const PAGES: Array<{ path: string; title: string | RegExp; actions: boolean }> = [
  { path: `/workspace/evaluations/${evaluation.id}?orgId=${ORG}&editor`, title: LONG, actions: true },
  { path: `/workspace/evaluations?orgId=${ORG}&editor`, title: "Evaluations", actions: true },
  { path: `/workspace/systems?orgId=${ORG}&editor`, title: "Systems", actions: false },
  { path: `/workspace/test-sets?orgId=${ORG}&editor`, title: "Test sets", actions: false },
  { path: `/workspace/reports?orgId=${ORG}&editor`, title: "Reports", actions: false },
  { path: `/workspace/settings?orgId=${ORG}&owner`, title: "Settings", actions: false },
  { path: "/ops/clients", title: "Clients", actions: true },
  { path: "/ops/prospects", title: "Prospect snapshots", actions: true },
  { path: "/ops/experts?reviews", title: "Expert work", actions: false },
  { path: "/review/sector-packs?sector-packs", title: "Sector packs", actions: false },
];

for (const locale of ["en", "es"] as const)
  test(`page headings stack cleanly at 390 px in ${locale.toUpperCase()}: the title takes the row, actions sit under it`, async ({ page }) => {
    if (locale === "es") await spanish(page);
    await serve(page, { "/sector-packs": { role: { staff: true, expert: true, reviewer: true }, packs: [] },
      "/prospects": { today: { created: 1, cap: 25 }, snapshots: [], limits: { dailyCap: 25, maxQuestions: 10, requestsPerMinute: 4, concurrentSessions: 1, runsPerMonth: 3, helpPages: 10 } } });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const item of PAGES) {
      await page.goto(item.path);
      const heading = page.locator(".p-head").first();
      await expect(heading.locator("h1")).toBeVisible();
      if (locale === "en") await expect(heading.locator("h1")).toHaveText(item.title);
      if (item.actions) await expect(heading.locator(".p-head-actions")).toBeVisible();
      const box = await heading.evaluate((head) => {
        const rect = (selector: string) => head.querySelector(selector)?.getBoundingClientRect() ?? null;
        const [all, text, actions] = [head.getBoundingClientRect(), rect(".p-head-text"), rect(".p-head-actions")];
        return { head: all.width, text: text?.width ?? 0, textBottom: text?.bottom ?? 0, actionsTop: actions?.top ?? null, actionsRight: actions?.right ?? null, right: all.right };
      });
      // The title and its description use the whole width of the heading…
      expect(box.text, `${item.path}: title width`).toBeGreaterThanOrEqual(box.head - 1);
      // …and the actions start below them, inside the canvas.
      if (box.actionsTop !== null) {
        expect(box.actionsTop, `${item.path}: actions under the title`).toBeGreaterThanOrEqual(box.textBottom - 1);
        expect(box.actionsRight!, `${item.path}: actions inside the heading`).toBeLessThanOrEqual(box.right + 1);
      }
      expect(await sideways(page, ".p-canvas"), `${item.path}: sideways scroll`).toBe(0);
    }
    await page.goto(PAGES[0].path);
    await page.screenshot({ path: `/tmp/evals-u1-heading-${locale}-390.png` });
  });

test("a long evaluation title wraps between words over the full width at 390 px", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAGES[0].path);
  const h1 = page.locator(".p-head h1");
  await expect(h1).toHaveText(LONG);
  // About 340 px a line: three or four lines, never the six of a 10rem column.
  const lines = await h1.evaluate((node) => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)));
  expect(lines).toBeLessThanOrEqual(4);
  // At 1440 px the actions return beside the title.
  await page.setViewportSize({ width: 1440, height: 900 });
  const [text, actions] = [await page.locator(".p-head-text").first().boundingBox(), await page.locator(".p-head-actions").first().boundingBox()];
  expect(actions!.x).toBeGreaterThan(text!.x + text!.width - 1);
});

/* ------------------------------------------------------ limits and alerts --- */

test("Limits and alerts names each control once, and the controls share one column", async ({ page }) => {
  // Billing and usage as an owner sees it (billing.contract.ts covers the rest of the page).
  await routeBilling(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/workspace/settings?owner&billing&orgId=${billingOrg}&tab=billing&view=limits`);
  const form = page.getByRole("form", { name: "Limits and alerts" });
  for (const [name, select] of [["Monthly credit limit", "cap-monthly-mode"], ["Per-run limit", "cap-run-mode"], ["Low-balance alert", "low-balance-mode"]]) {
    // The row's title is the one visible label; the select keeps it as its accessible name.
    await expect(form.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(form.locator(`label[for="${select}"]`)).toHaveClass(/\bsr-only\b/);
    await expect(form.getByRole("combobox", { name, exact: true })).toBeVisible();
  }
  const lefts = await form.locator(".p-setting-control select, .p-setting-control input").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
  expect(new Set(lefts).size).toBe(1);
  const widths = await form.locator(".p-setting-control select").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  await page.screenshot({ path: "/tmp/evals-u1-limits-1440.png", fullPage: true });
});

/* ----------------------------------------------- admin tables on a phone --- */

test("AI model tables stack at 390 px: no sideways scroll, the model id wraps", async ({ page }) => {
  const routeFor = (role: string) => ({ role, provider_revision_id: `rev-${role}`, model_id: "bluehawana/deepseek-v4-flash:iq2_m", adapter: "openai_compatible", account_id: "nim", account_name: "Nvidia NIM",
    context_limit: 131072, input_price: "0.0000005", output_price: "0.000002", currency: "EUR", updated_at: now, usable: true, web_research: true, web_capable: true });
  await page.route("**/api/evals/v1/engine?**", (route) => route.fulfill({ json: { data: {
    roles: ["context_analyzer", "generator", "judge", "report_writer"], dgxAvailable: true,
    connections: [{ id: "dgx", name: "DGX Spark", adapter: "dgx", host: "DGX Spark (private network)", key_hint: null, enabled: true, has_key: false },
      { id: "nim", name: "Nvidia NIM", adapter: "openai_compatible", host: "integrate.api.nvidia.com", key_hint: "…62Lt", enabled: true, has_key: true }],
    platform: ["context_analyzer", "generator", "judge", "report_writer"].map(routeFor), workspace: [],
    searchEngines: [{ engine: "tavily", key_hint: "…DuYN", priority: 1, enabled: true, updated_at: now }, { engine: "exa", key_hint: "…4819", priority: 2, enabled: true, updated_at: now }],
  }, meta: {} } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace/settings/models");
  await expect(page.getByRole("row", { name: /Grade answers/ })).toContainText("bluehawana/deepseek-v4-flash:iq2_m");
  await page.screenshot({ path: "/tmp/evals-u1-models-tasks-390.png" });
  const test = page.getByRole("row", { name: /Tavily/ }).getByRole("button", { name: /Test search/ });
  await test.scrollIntoViewIfNeeded();
  // Whole, not cut at the canvas edge.
  await expect(test).toBeInViewport({ ratio: 1 });
  expect(await sideways(page)).toBe(0);
  await page.screenshot({ path: "/tmp/evals-u1-models-390.png", fullPage: true });
});

/* -------------------------------------------------------- API reference --- */

test("the API reference sets headers, fields and error codes as code", async ({ page }) => {
  await serve(page);
  await page.goto(`/workspace/settings?owner&orgId=${ORG}&tab=developers&integrations`);
  const reference = page.locator(".p-api-ref");
  for (const code of ["Authorization", "Bearer <token>", "orgId", "error.code", "INPUT_INVALID", "RATE_LIMITED", "Retry-After", "v1=", "base64url", "runs:read", "Idempotency-Key"])
    await expect(reference.locator("code", { hasText: code }).first(), code).toBeVisible();
  // No backtick reaches the prose (code samples keep theirs).
  const prose = await reference.locator("p, li, td").evaluateAll((nodes) => nodes.filter((node) => !node.closest("pre, .p-code-block")).map((node) => node.textContent ?? ""));
  expect(prose.filter((text) => text.includes("`"))).toEqual([]);
});
