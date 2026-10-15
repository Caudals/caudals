/**
 * Ops billing console contracts (launch L-16): every view at 390, 768 and
 * 1440 px in English and Spanish without horizontal scroll; the account view
 * and its actions (a grant above 10,000 credits goes for a second approval);
 * approvals (no approving your own request, the reviewed payload hash is
 * sent); the price book's increase notice; the operator's read-only state;
 * credits per attempt in the run inspector; the Clients PAYG filter; the €0
 * warning's link to the price book; credits by workspace in Usage. Launch G2:
 * the provider-price check panel and its acknowledgement, and the tax-review
 * queue with the treatments each review allows.
 */
import { join } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const REV1 = "6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88";
const REV2 = "9d3e5b70-1c4a-4e2b-8f6d-7a2c9e1b4d05";
const RUN = "00000000-0000-4000-8000-000000000901";
const CHECK = "00000000-0000-4000-8000-000000000e01";
const now = new Date().toISOString();
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });
const axePath = join(process.cwd(), "node_modules/axe-core/axe.min.js");
/** axe-core on one region: no serious or critical violation. */
async function axe(page: Page, selector: string) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async (target) => {
    type Axe = { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }> }> };
    const result = await (window as unknown as { axe: Axe }).axe.run({ include: [target] }, { resultTypes: ["violations"] });
    return result.violations.filter(item => item.impact === "serious" || item.impact === "critical").map(item => `${item.id}: ${item.nodes.map(node => node.target.join(" ")).join(", ")}`);
  }, selector);
  expect(violations, `axe on ${selector}`).toEqual([]);
}

const approval = (id: string, requestedBy: string, credits = "15000") => ({
  id, orgId: ORG, workspace: "Example client", action: "grant", credits, netCents: null, payload: { action: "grant", credits: Number(credits), source: "promo", expiresAt: ahead(90), campaign: "founding-pilot", reason: "Founding pilot re-runs" },
  payloadSha256: "a".repeat(64), reason: "Founding pilot re-runs", requestedBy, requestedAt: now, expiresAt: ahead(1), status: "pending",
  approvedBy: null, approvedAt: null, decidedBy: null, decidedAt: null, decisionReason: null, executedAt: null, result: null,
});
const account = {
  account: { orgId: ORG, workspace: "Example client", plan: "payg", billingMode: "credits", available: "12345.5", held: "12.25", frozenReason: null, version: "9", issues: [] },
  lots: [
    { id: "00000000-0000-4000-8000-000000000a01", source: "purchase", granted: "5150", remaining: "5000", held: "12.25", expired: "0", unitPriceEur: "0.0097", expiresAt: ahead(700), orderId: "00000000-0000-4000-8000-000000000b01", campaign: null, createdAt: ago(10), extendable: true },
    { id: "00000000-0000-4000-8000-000000000a02", source: "allowance", granted: "1000", remaining: "0", held: "0", expired: "0", unitPriceEur: "0", expiresAt: ago(2), orderId: null, campaign: null, createdAt: ago(40), extendable: false },
  ],
  holds: [{ id: "h1", key: "attempt:1", amount: "12.25", captured: "0", released: "0", state: "held", runId: RUN, attemptId: null, expiresAt: ahead(1), createdAt: now, settledAt: null }],
  ledger: [
    { id: "e3", type: "action", credits: "-5", availableAfter: "12345.5", heldAfter: "12.25", version: "3", key: "action:unit:1", reason: null, actorId: "service:evals-browser", actorKind: "worker", meter: "website_question", runId: RUN, attemptId: null, refKind: null, refId: null, reversesEntryId: null, reversed: false, createdAt: now },
    { id: "e2", type: "grant", credits: "200", availableAfter: "12350.5", heldAfter: "0", version: "2", key: "grant:ops", reason: "Courtesy credit", actorId: "admin", actorKind: "user", meter: null, runId: null, attemptId: null, refKind: null, refId: null, reversesEntryId: null, reversed: false, createdAt: ago(1) },
    { id: "e1", type: "purchase", credits: "12150.5", availableAfter: "12150.5", heldAfter: "0", version: "1", key: "purchase:x", reason: null, actorId: "system:stripe-webhook", actorKind: "system", meter: null, runId: null, attemptId: null, refKind: "top_up_order", refId: "o1", reversesEntryId: null, reversed: false, createdAt: ago(10) },
  ],
  nextBefore: null,
  orders: [{ id: "00000000-0000-4000-8000-000000000b01", kind: "checkout", status: "paid", pack: "€50", netCents: 5000, vatCents: 1050, grossCents: 6050, taxTreatment: "es_vat", taxMention: null, credits: 5000, bonusCredits: 150, bonusKind: "pack", failureCode: null, createdAt: ago(10), paidAt: ago(10), refundedAt: null, livemode: false, riskFlags: ["card_country_mismatch"], cardCountry: "US", paymentIntentId: "pi_1", refundable: true, needsSecondApprover: false }],
  documents: [{ id: "d1", kind: "invoice", status: "pending_issue", number: null, issueDate: null, grossCents: 6050, orderId: "o1", livemode: false, provider: "manual", pdfAttached: false, createdAt: ago(10) }],
  alerts: [{ kind: "receipt", period: "00000000-0000-4000-8000-000000000b01", attempts: 1, sentAt: ago(10), createdAt: ago(10) }],
  approvals: [approval("00000000-0000-4000-8000-000000000c01", "another-admin")],
  override: { enforcement: "shadow", livePayments: true, plansV2: true, reason: "Design partner", version: 2, updatedBy: "admin", updatedAt: ago(3) },
  thresholdCredits: "10000",
};
const revision = (id: string, n: number, status: string, effectiveAt: string | null, raisesPrices: boolean | null) => ({ id, revision: n, status, title: n === 1 ? "Launch price book (§6.4)" : "Gemini 3.8 Flash increase", notes: null, effectiveAt, multiplier: "1.5000", fxUsdPerEur: "1.160500", fxDate: "2026-08-19", fxSource: "ECB", basedOnId: null, raisesPrices, noticeSentAt: null, createdBy: "system:migration-088", createdAt: ago(3), scheduledAt: ago(3), activatedAt: n === 1 ? ago(3) : null, retiredAt: null });
const model = (label: string, input: string, output: string, run: number) => ({ id: label, label, provider: "google", modelId: label.toLowerCase(), minInputTokens: 0, credits: { input, output, cached: null }, margin: { input: 0.336, output: 0.341 }, planningRunCredits50: run, costBasis: "list_price" });
const revisionView = (id: string, n: number, gemini: [string, string, number]) => ({
  ...revision(id, n, n === 1 ? "active" : "scheduled", n === 1 ? ago(3) : ahead(80), n !== 1),
  models: [model("Caudals Local", "50", "200", 8), model("Gemini 3.8 Flash (Google)", ...gemini)],
  actions: [{ meter: "website_question", unit: "question", label: "Website chat question", credits: "5", ucrPerUnit: "5000000" }],
  routeIssues: [],
});
const fixtures: Record<string, (url: URL, route: Route) => unknown> = {
  "/billing/admin/accounts": () => ({ accounts: [{ orgId: ORG, workspace: "Example client", plan: "payg", billingMode: "credits", available: "12345.5", held: "12.25", frozenReason: null, ownerDomain: "acme.es", lastEntryAt: now, createdAt: ago(30) },
    { orgId: OTHER, workspace: "Second client", plan: "free", billingMode: "free", available: "0", held: "0", frozenReason: "ops: Card testing", ownerDomain: "beta.es", lastEntryAt: null, createdAt: ago(3) }] }),
  [`/billing/admin/accounts/${ORG}`]: () => account,
  "/billing/admin/approvals": () => ({ approvals: [approval("00000000-0000-4000-8000-000000000c01", "another-admin"), approval("00000000-0000-4000-8000-000000000c02", "test-user", "12000")], thresholdCredits: "10000", thresholdNetCents: 10000 }),
  "/billing/admin/price-book/revisions": () => ({ effectiveRevisionId: REV1, revisions: [revision(REV2, 2, "scheduled", ahead(80), true), revision(REV1, 1, "active", ago(3), false)], routes: [],
    latestFx: { usdPerEur: "1.1206", date: "2026-10-09", source: "ECB" }, latestCheck: { id: CHECK, checkedAt: ago(2), changed: 1, unavailable: 0, alerting: 2, open: true, acknowledgement: null, changes: [
      { label: "DeepSeek V4 Pro", provider: "deepseek", modelId: "deepseek-v4-pro", minInputTokens: 0, status: "changed", recompute: true, input: { book: "1.32", listed: "0.955" }, output: { book: "3.96", listed: "1.911" } },
      { label: "Gemini 3.1 Pro preview, > 200K", provider: "google", modelId: "gemini-3.1-pro-preview", minInputTokens: 200001, status: "unavailable", recompute: true }] } }),
  "/billing/admin/tax-reviews": () => ({ reviews: [
    { orgId: ORG, workspace: "Example client", legalName: "Acme Canarias SL", country: "ES", taxId: "B35000000", taxIdKind: "es_nif", viesStatus: "not_required", viesCheckedAt: null,
      reviewReason: "es_special_territory", postalCode: "35001", city: "Las Palmas de Gran Canaria", region: "Las Palmas", billingEmail: "billing@acme.es", version: 3, since: ago(2),
      allowed: ["non_eu_not_subject", "es_vat"], blocked: [{ source: "checkout", netCents: 5000, at: ago(1) }], openOrders: [] },
    { orgId: OTHER, workspace: "Second client", legalName: "Beta Italia Srl", country: "IT", taxId: "IT12345678901", taxIdKind: "eu_vat", viesStatus: "unavailable", viesCheckedAt: ago(1),
      reviewReason: "vies_unavailable", postalCode: "00100", city: "Roma", region: null, billingEmail: "billing@beta.it", version: 1, since: ago(1),
      allowed: ["eu_reverse_charge", "es_vat"], blocked: [{ source: "auto_recharge", netCents: 2000, at: ago(1) }], openOrders: [] },
  ] }),
  [`/billing/admin/price-book/revisions/${REV1}`]: () => revisionView(REV1, 1, ["100", "485", 17]),
  [`/billing/admin/price-book/revisions/${REV2}`]: () => revisionView(REV2, 2, ["195", "970", 34]),
  [`/billing/admin/price-book/revisions/${REV2}/notice`]: () => ({ revisionId: REV2, revision: 2, status: "scheduled", raisesPrices: true, effectiveAt: ahead(80), noticeSentAt: null, deadline: ahead(50), noticeOk: false, canSend: true, mode: "internal", state: "due",
    increases: [{ kind: "model", label: "Gemini 3.8 Flash (Google)", now: "100 · 485", next: "195 · 970" }], recipients: [{ orgId: ORG, workspace: "Example client", billingMode: "credits", owners: 2, models: ["Gemini 3.8 Flash (Google)"] }], totals: { workspaces: 1, owners: 2 } }),
  "/billing/admin/reconciliation": () => ({ mode: "test", configuredMode: "test", streak: { days: 1, since: ago(1).slice(0, 10) },
    reports: [{ id: "r1", day: ago(1).slice(0, 10), livemode: false, generatedAt: now, actorId: "service:evals-scheduler", discrepancies: 0, explained: 2, stripeChecked: true, report: null }],
    report: { id: "r1", day: ago(1).slice(0, 10), livemode: false, generatedAt: now, actorId: "service:evals-scheduler", discrepancies: 0, explained: 2, stripeChecked: true, report: {
      checks: { paid_order_purchase_mismatch: { count: 0, ids: [] }, paid_order_invoice_mismatch: { count: 0, ids: [] }, holds_open_over_25h: { count: 0, ids: [] }, inconsistent_accounts: { count: 0, ids: [] }, shadow_drift: { count: 0, ids: [] } },
      notes: { voided_test_documents: 0, orders_flagged_for_review: 0 }, totals: {},
      stripe: { checked: true, matched: 3, issues: [], unpaidOrders: [], timing: [], unrelated: [{ stripeId: "txn_1", type: "charge", amount: 100 }, { stripeId: "txn_2", type: "refund", amount: -100 }] } } } }),
  // camelCase, as lib/billing/invoicing/store.ts `adminDocuments` returns them (launch R4: the console read snake_case and showed "undefined").
  "/billing/admin/invoices": () => ({ documents: [{ id: "d1", orgId: ORG, kind: "invoice", status: "pending_issue", number: null, seriesCode: "CAU", grossCents: 6050, operationDate: "2026-10-05", livemode: false, workspace: "Example client", legalName: "Acme Software SL", country: "ES", pdfAttached: false, createdAt: ago(10) }] }),
  "/billing/admin/export": () => ({ month: "2026-09", livemode: false, complete: true, from: "", to: "", checks: { documents_to_issue: 1, unmatched: 0 }, orders: 1, documentsToIssue: 1, chargebacks: 0,
    sales: [{ tax_treatment: "es_vat", tax_mention: null, orders: 1, net_cents: 5000, vat_cents: 1050, gross_cents: 6050, credits: 5000, bonus_credits: 150 }],
    refunds: [], purchasedCredits: { opening: { credits: 0, eur: 0 }, purchased: { credits: 5000, eur: 48.5 }, consumed: { credits: 12, eur: 0.12 }, closing: { credits: 4988, eur: 48.38 } }, freeCredits: {},
    files: ["summary.md", "sales.csv", "credits.csv", "orders.csv", "documents.csv"], reconciliation: null, stripeNote: null }),
  "/billing/admin/fraud": () => ({ days: 30, since: ago(30),
    signups: [{ org_id: OTHER, workspace: "Second client", created_at: ago(3), domain: "beta.es", hosts: 4, runs_last_day: 3, flags: ["many_hosts", "many_runs"] }],
    // An older burst (launch U1): four top-ups within one day, none in the last 24 hours.
    velocity: [{ org_id: OTHER, workspace: "Second client", orders_24h: 0, orders: 5, peak_24h: 4, failed: 0, paid_net_cents: 2000 }],
    flagged_orders: [{ order_id: "00000000-0000-4000-8000-000000000b01", org_id: ORG, workspace: "Example client", status: "paid", livemode: false, net_cents: 5000, card_country: "US", flags: ["card_country_mismatch"], created_at: ago(10) }],
    disputes: [{ order_id: "00000000-0000-4000-8000-000000000b02", org_id: OTHER, workspace: "Second client", status: "disputed", livemode: false, net_cents: 2000, dispute: "dp_1", updated_at: ago(1) }],
    frozen_accounts: [{ org_id: OTHER, workspace: "Second client", frozen_reason: "dispute:dp_1", available: "0", updated_at: ago(1) }] }),
  "/billing/admin/overrides": () => [{ orgId: ORG, workspace: "Example client", plan: "payg", billingMode: "credits", enforcement: "enforce", livePayments: true, plansV2: true, reason: "Internal enforcement test", version: 3, updatedBy: "admin", updatedAt: ago(1) }],
  "/billing/admin/usage": () => ({ month: now.slice(0, 7), totals: { sold: "5150", soldNetCents: 5000, granted: "1200", consumed: "17", held: "12.25", expired: "0", available: "12345.5", shadowCharged: "6.5" },
    workspaces: [{ orgId: ORG, workspace: "Example client", plan: "payg", billingMode: "credits", frozen: false, available: "12345.5", held: "12.25", sold: "5150", soldNetCents: 5000, granted: "1200", consumed: "17", returned: "0", refunded: "0", expired: "0", shadowCharged: "6.5" }] }),
  [`/billing/admin/runs/${RUN}`]: () => ({ runId: RUN, priceBookRevisionId: REV1,
    attempts: [{ attemptId: "00000000-0000-4000-8000-000000000d01", role: "judge", status: "completed", ordinal: 1, createdAt: now, reservedEur: "0.000400000", settledEur: "0.000150000", reservation: "settled", held: "0.59565", charged: "0.0817", holdState: null, shadow: true }],
    meters: [{ meter: "api_question", count: 1, credits: "2", shadow: true }], totals: { engineCredits: "0.0817", meterCredits: "2", refundedCredits: "0", chargedEur: "0.0208", settledEur: "0.0002" } }),
  [`/runs/${RUN}`]: () => ({ run: { status: "completed", phase: "done", created_at: now, execution_mode: "deployed_system", reason_code: null }, plan: { content_hash: "b".repeat(64), document: { questions: 1 } },
    units: [{ id: "u1", status: "succeeded", case_revision_id: "c".repeat(36) }], events: [], costs: { reserved: "0", settled: "0.00015", unresolved: "0" }, targetUsage: { calls: 1, unknown: 0 } }),
  [`/runs/${RUN}/judgments`]: () => ({ jobs: [], calibration: [] }),
  "/usage": () => ({ budgets: [], entitlement: null, evaluations: [], amendments: [], targetCalls: { calls: 0, unknown: 0 } }),
  "/workspaces": () => [{ id: ORG, name: "Example client" }],
};

async function routes(page: Page, posts: Array<{ path: string; body: unknown; key: string | null }> = []) {
  await page.route("**/api/evals/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/evals/v1", "");
    if (route.request().method() !== "GET") {
      posts.push({ path, body: route.request().postDataJSON(), key: route.request().headers()["idempotency-key"] ?? null });
      const body = route.request().postDataJSON() as { credits?: number };
      const data = path === "/billing/admin/grants" && (body.credits ?? 0) > 10_000 ? { outcome: "pending_approval", approval: approval("00000000-0000-4000-8000-000000000c09", "test-user") } : { outcome: "done", entries: [] };
      return route.fulfill({ json: { data, meta: {} } });
    }
    const fixture = fixtures[path];
    if (fixture) return route.fulfill({ json: { data: fixture(url, route), meta: {} } });
    return route.fulfill({ json: { data: path.endsWith("/workspace/summary") ? { evaluations: [], systems: [], reports: [], entitlement: null, usage: { settled: "0", outstanding: "0" }, preferences: {} } : [], meta: {} } });
  });
}

const VIEWS: Array<{ view: string; en: string; es: string }> = [
  { view: "accounts", en: "Accounts", es: "Cuentas" }, { view: "approvals", en: "Approvals", es: "Aprobaciones" }, { view: "price-book", en: "Price book", es: "Tarifas" },
  { view: "reconciliation", en: "Reconciliation", es: "Conciliación" }, { view: "invoices", en: "Invoices", es: "Facturas" }, { view: "export", en: "Monthly export", es: "Exportación mensual" },
  { view: "fraud", en: "Fraud queue", es: "Cola de fraude" }, { view: "tax-review", en: "Tax reviews", es: "Revisiones fiscales" }, { view: "overrides", en: "Overrides", es: "Excepciones" },
];

for (const locale of ["en", "es"] as const)
  for (const width of [390, 768, 1440])
    test(`billing console views at ${width}px in ${locale.toUpperCase()} have no horizontal scroll (L-16)`, async ({ page }) => {
      if (locale === "es") await spanish(page);
      await routes(page);
      await page.setViewportSize({ width, height: 900 });
      for (const item of VIEWS) {
        await page.goto(`/ops/platform/billing?admin&view=${item.view}`);
        await expect(page.getByRole("heading", { name: item[locale], exact: true }).first()).toBeVisible();
        expect(await noOverflow(page), `${item.view} at ${width}px`).toBe(true);
      }
      await page.goto(`/ops/platform/billing?admin&view=accounts&org=${ORG}`);
      await expect(page.getByRole("heading", { name: "Example client" })).toBeVisible();
      await expect(page.getByRole("table", { name: locale === "es" ? "Libro de créditos" : "Ledger" })).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      if (width !== 768) await page.screenshot({ path: `${process.env.OPS_BILLING_SHOTS ?? "/tmp/evals-ui-test-results"}/ops-billing-account-${locale}-${width}.png`, fullPage: true });
    });

test("account view: search, open, grant above the threshold goes for a second approval (L-16)", async ({ page }) => {
  const posts: Array<{ path: string; body: unknown; key: string | null }> = [];
  await routes(page, posts);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/ops/platform/billing?admin");
  await expect(page.getByRole("table", { name: "Accounts" }).getByRole("row", { name: /Second client/ })).toContainText("Frozen");
  await page.getByRole("button", { name: "Example client", exact: true }).click();
  await expect(page.getByText("Waiting for a second administrator")).toBeVisible();
  await expect(page.getByRole("table", { name: "Credit lots" }).getByRole("button", { name: "Extend expiry" })).toHaveCount(1);
  await expect(page.getByRole("table", { name: "Orders" })).toContainText("Card country mismatch");
  await page.getByRole("button", { name: "Grant credits" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Credits", { exact: true }).fill("15000");
  await dialog.getByLabel("Campaign tag").fill("founding-pilot");
  await dialog.getByLabel("Reason").fill("Founding pilot re-runs");
  // The confirm button restates the amount (launch R4).
  await dialog.getByRole("button", { name: "Grant 15,000 credits (€150)" }).click();
  await expect(page.getByText("Sent for a second administrator's approval.")).toBeVisible();
  expect(posts).toEqual([{ path: "/billing/admin/grants", body: { orgId: ORG, credits: 15000, source: "grant", reason: "Founding pilot re-runs", campaign: "founding-pilot" }, key: expect.any(String) }]);
});

test("invoices: rows read the API's fields, attaching is the visible step and voiding sits in the menu as danger (launch R4)", async ({ page }) => {
  await routes(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/ops/platform/billing?admin&view=invoices");
  const row = page.getByRole("table", { name: "Invoices" }).getByRole("row", { name: /Acme Software SL/ });
  await expect(row).toContainText("CAU-…");
  await expect(row).toContainText("€60.50");
  await expect(row).toContainText("5 Oct 2026");
  await expect(page.getByRole("table", { name: "Invoices" })).not.toContainText("undefined");
  await expect(row.getByRole("button", { name: "Attach issued invoice" })).toBeVisible();
  await row.getByRole("button", { name: /^Actions/ }).click();
  await expect(page.getByRole("menuitem", { name: "Void test document" })).toBeVisible();
});

test("fraud queue: a velocity row shows the count its criterion is about, and flags read as pills (launch U1)", async ({ page }) => {
  await routes(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/ops/platform/billing?admin&view=fraud");
  const velocity = page.getByRole("table", { name: "Top-up velocity" });
  await expect(velocity.getByRole("columnheader", { name: "Most in 24 h" })).toBeVisible();
  const cells = velocity.getByRole("row", { name: /Second client/ }).getByRole("cell");
  await expect(cells).toHaveText(["4", "5", "0", "0", /^€20(\.00)?$/]);
  await expect(page.getByRole("table", { name: "Orders with risk flags" }).locator(".p-badge")).toHaveText(["Card country mismatch"]);
});

test("approvals: your own request waits for another admin; approving sends the reviewed payload hash (L-16)", async ({ page }) => {
  const posts: Array<{ path: string; body: unknown; key: string | null }> = [];
  await routes(page, posts);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/ops/platform/billing?admin&view=approvals");
  const table = page.getByRole("table", { name: "Approvals" });
  const mine = table.getByRole("row", { name: /12,000 credits/ });
  await expect(mine).toContainText("Another administrator must approve.");
  await expect(mine.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await table.getByRole("row", { name: /15,000 credits/ }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("dialog")).toContainText("Founding pilot re-runs");
  await page.getByRole("dialog").getByRole("button", { name: "Approve and run" }).click();
  await expect(page.getByText("Approved and run.")).toBeVisible();
  expect(posts.at(-1)).toMatchObject({ path: "/billing/admin/approvals/00000000-0000-4000-8000-000000000c01/approve", body: { orgId: ORG, payloadSha256: "a".repeat(64) } });
  expect(posts.at(-1)?.key).toBeTruthy();
});

test("price book: the scheduled increase shows its notice deadline; owner sends are off while internal (L-16)", async ({ page }) => {
  await routes(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/ops/platform/billing?admin&view=price-book");
  await expect(page.getByText("A price increase is waiting for its notice.", { exact: false })).toBeVisible();
  await page.getByRole("table", { name: "Price book" }).getByRole("row", { name: /Revision 2/ }).getByRole("button", { name: "View" }).click();
  await expect(page.getByRole("heading", { name: "Increase notice" })).toBeVisible();
  await expect(page.getByText("Owner notices are off here", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send the notice" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send a test" })).toBeEnabled();
  await expect(page.getByRole("table", { name: "Model rates" }).getByRole("row", { name: /Gemini 3.8 Flash/ })).toContainText("195 · 970");
});

test("an operator sees that the billing console is for platform administrators (L-16)", async ({ page }) => {
  await routes(page);
  await page.goto("/ops/platform/billing?readonly");
  await expect(page.getByText("The billing console is for platform administrators.")).toBeVisible();
});

test("run inspector shows credits next to our cost per attempt; Usage lists credits by workspace (L-16)", async ({ page }) => {
  await routes(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/ops/runs/${RUN}?orgId=${ORG}&admin`);
  await expect(page.getByRole("heading", { name: "Credits and cost per attempt" })).toBeVisible();
  await expect(page.getByText("Shadow mode: what enforcement would have charged", { exact: false })).toBeVisible();
  await expect(page.getByRole("table", { name: "Credits and cost per attempt" })).toContainText("0.08");
  expect(await noOverflow(page)).toBe(true);
  await page.goto("/ops/platform/usage?admin");
  await expect(page.getByRole("table", { name: "Credits by workspace" }).getByRole("row", { name: /Example client/ })).toContainText("5,150");
  expect(await noOverflow(page)).toBe(true);
});

test("Clients counts pay-as-you-go workspaces under their own filter (L-16 fix of L-14's note)", async ({ page }) => {
  await page.route("**/api/evals/v1/client-details", route => route.fulfill({ json: { data: [
    { orgId: ORG, kind: "client", plan: "payg", billingMode: "credits", credits: 120.5, creditsBought: 50, lastActivity: now, emailDomain: "acme.es", latestScore: null },
    { orgId: OTHER, kind: "client", plan: "managed", billingMode: "contract", credits: 0, creditsBought: null, lastActivity: null, emailDomain: null, latestScore: null },
  ], meta: {} } }));
  await page.goto("/ops/clients?two-workspaces");
  const filters = page.getByRole("group", { name: "Filter clients" });
  await expect(filters.getByRole("button", { name: /Pay as you go/ })).toContainText("1");
  await expect(filters.getByRole("button", { name: /Managed/ })).toContainText("1");
  await filters.getByRole("button", { name: /Pay as you go/ }).click();
  const table = page.getByRole("table", { name: "Clients" });
  await expect(table.getByRole("row", { name: /Example client/ })).toHaveCount(1);
  await expect(table.getByRole("row", { name: /Second client/ })).toHaveCount(0);
});

test("the €0 warning links to the price book (L-16)", async ({ page }) => {
  await page.route("**/api/evals/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/providers") ? { accounts: [], secrets: [], revisions: [{ id: "r1", account_id: "a1", adapter: "openai_compatible", model_id: "z-ai/glm-5.3-flash", roles: ["judge"], capabilities: {}, context_limit: 8192, output_limit: 1024, data_classes: [], regions: [], endpoint_host: "openrouter.ai", health: null, last_probe_at: null, retired_at: null, price: { id: "p", currency: "EUR", input: "0", output: "0" }, free_model: false, price_issue: "MODEL_PRICE_ZERO", credit_rate: null }] } : [];
    return route.fulfill({ json: { data, meta: {} } });
  });
  await page.goto("/ops/platform?admin");
  await expect(page.getByRole("link", { name: "Open the price book" })).toHaveAttribute("href", "/ops/platform/billing?view=price-book");
});

test("price book: the provider-price check needs a decision; acknowledging it sends the note (G2)", async ({ page }) => {
  const posts: Array<{ path: string; body: unknown; key: string | null }> = [];
  await routes(page, posts);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ops/platform/billing?admin&view=price-book");
    const panel = page.getByRole("region", { name: "Provider-price check" });
    await expect(panel.getByText("Needs a decision")).toBeVisible();
    const table = panel.getByRole("table", { name: "Provider-price check" });
    await expect(table.getByRole("row", { name: /DeepSeek V4 Pro/ })).toContainText("1.32 → 0.955");
    await expect(table.getByRole("row", { name: /Gemini 3.1 Pro preview/ })).toContainText("Not listed; cost moved with FX");
    expect(await noOverflow(page), `price check at ${width}px`).toBe(true);
  }
  await axe(page, "[aria-labelledby=ob-price-check]");
  await page.getByRole("button", { name: "Acknowledge" }).click();
  const dialog = page.getByRole("dialog", { name: "Acknowledge the price check" });
  await dialog.getByLabel("What you decided").fill("Draft revision 3 with DeepSeek's lower list price");
  await dialog.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("Price check acknowledged.")).toBeVisible();
  expect(posts.at(-1)).toMatchObject({ path: `/billing/admin/price-book/checks/${CHECK}/acknowledge`, body: { note: "Draft revision 3 with DeepSeek's lower list price" } });
  expect(posts.at(-1)?.key).toBeTruthy();
});

test("tax reviews: the queue, the treatments each review allows, and the reviewed version sent (G2, §6.14)", async ({ page }) => {
  const posts: Array<{ path: string; body: unknown; key: string | null }> = [];
  await routes(page, posts);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/ops/platform/billing?admin&view=tax-review");
  const table = page.getByRole("table", { name: "Tax reviews" });
  await expect(table.getByRole("row", { name: /Example client/ })).toContainText("Canary Islands, Ceuta or Melilla");
  await expect(table.getByRole("row", { name: /Example client/ })).toContainText("35001");
  await expect(table.getByRole("row", { name: /Second client/ })).toContainText("VIES unavailable");
  await axe(page, "#p-main");
  // Canary Islands: not subject or 21 % IVA; never a reverse charge.
  await table.getByRole("row", { name: /Example client/ }).getByRole("button", { name: "Review" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio")).toHaveCount(2);
  await expect(dialog.getByRole("radio", { name: /reverse charge/i })).toHaveCount(0);
  await dialog.getByRole("radio", { name: /Not subject to Spanish IVA/ }).check();
  await dialog.getByLabel("Reason").fill("Established in Las Palmas; IGIC applies");
  await dialog.getByRole("button", { name: "Set treatment" }).click();
  await expect(page.getByText("Tax treatment set: Not subject to Spanish IVA.", { exact: false })).toBeVisible();
  expect(posts.at(-1)).toEqual({ path: `/billing/admin/tax-reviews/${ORG}`, body: { version: 3, treatment: "non_eu_not_subject", viesConsultation: null, reason: "Established in Las Palmas; IGIC applies" }, key: expect.any(String) });
  // VIES unavailable: the reverse charge asks for the VIES consultation number.
  await table.getByRole("row", { name: /Second client/ }).getByRole("button", { name: "Review" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /reverse charge/i }).check();
  await dialog.getByLabel("VIES consultation number").fill("WAPIAAAAZ1aBcD9");
  await dialog.getByLabel("Reason").fill("Valid in VIES today");
  await axe(page, "[role=dialog]");
  await dialog.getByRole("button", { name: "Set treatment" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts.at(-1)?.body).toEqual({ version: 1, treatment: "eu_reverse_charge", viesConsultation: "WAPIAAAAZ1aBcD9", reason: "Valid in VIES today" });
});

test("tax reviews in Spanish at 390 px (G2)", async ({ page }) => {
  await spanish(page);
  await routes(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/ops/platform/billing?admin&view=tax-review");
  await expect(page.getByRole("table", { name: "Revisiones fiscales" }).getByRole("row", { name: /Example client/ })).toContainText("Canarias, Ceuta o Melilla");
  await page.getByRole("table", { name: "Revisiones fiscales" }).getByRole("row", { name: /Example client/ }).getByRole("button", { name: "Revisar" }).click();
  await expect(page.getByRole("dialog").getByRole("radio", { name: /No sujeta al IVA español/ })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await axe(page, "[role=dialog]");
});
