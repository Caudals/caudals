import type { Page } from "@playwright/test";

/**
 * Billing fixtures for the UI harness (launch L-15), shared by the billing
 * contracts and the accessibility contract (launch L-24): the workspace,
 * evaluation and run ids, the billing summary, packs, usage and ledger, and
 * `routeBilling`, which answers every /api/evals/v1 call those screens make.
 */
export const id = "00000000-0000-4000-8000-000000000001";
export const evaluationId = "00000000-0000-4000-8000-000000000901";
export const runId = "00000000-0000-4000-8000-000000000902";
export const reportId = "00000000-0000-4000-8000-000000000903";
export const systemRevision = "00000000-0000-4000-8000-000000000904";
export const order = "00000000-0000-4000-8000-000000000905";
export const M = 1_000_000;
export const ucr = (credits: number) => String(Math.round(credits * M));
export const widths = [390, 768, 1440] as const;

export type Role = "owner" | "editor";
export type Options = {
  role?: Role; available?: number; held?: number; used?: number; plan?: string; billingMode?: "free" | "credits" | "contract"; gate?: "enforced" | "none";
  low?: boolean; invoices?: boolean; capCredits?: number | null; lowBalanceCredits?: number | null; runStatus?: string | null; runReason?: string | null; estimate?: Partial<Estimate>;
};
export type Estimate = typeof baseEstimate;
export const baseEstimate = {
  evaluationId, suiteVersionId: "s", targetRevisionId: systemRevision, connection: "website", priceBook: { id: "p", revision: 1 },
  questions: { count: 50, executions: 50, judged: 50, generated: 0 },
  credits: { p50: "270", p90: "340" }, euros: { p50: "2.70", p90: "3.40" }, ucr: { p50: ucr(270), p90: ucr(340) },
  largestHold: { ucr: ucr(2), credits: "2" }, eta: { p50Seconds: 2600, p90Seconds: 3800, basis: "measured" },
  balance: { billingMode: "free", requiresCredits: true, availableCredits: "1820", coversP90: true, addCredits: "0" as string | null },
  models: {
    judge: { modelId: "deepseek-v4-flash", free: false, priced: true, rate: "Caudals Local (DeepSeek V4 Flash on the DGX)", credits: { input: "50", output: "200" }, webResearch: false, statsSource: "role", samples: 40 },
    report_writer: { modelId: "deepseek-v4-flash", free: false, priced: true, rate: "Caudals Local (DeepSeek V4 Flash on the DGX)", credits: { input: "50", output: "200" }, webResearch: false, statsSource: "seeded", samples: 0 },
  },
  lines: [], unpriced: [], estimatedAt: new Date().toISOString(),
  gate: { enforced: true, autoRechargeCovers: false, autoRechargePackCredits: null as number | null, canStart: true },
};

export function summary(o: Options) {
  const owner = (o.role ?? "owner") === "owner";
  const available = o.available ?? 1820;
  const cap = o.capCredits === undefined ? 5000 : o.capCredits;
  const used = o.used ?? 412.5;
  const held = o.held ?? 3;
  return {
    orgId: id, level: owner ? "owner" : "editor", role: o.role ?? "owner", plan: o.plan ?? "payg", billingMode: o.billingMode ?? "credits",
    balance: { availableUcr: ucr(available), heldUcr: ucr(held) }, frozen: false, gate: o.gate ?? "enforced",
    month: { period: "2026-10", from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", usedUcr: ucr(used), committedUcr: ucr(used + held) },
    caps: { monthlyUcr: cap === null ? null : ucr(cap), perRunUcr: null, perRunMultiplier: 2 },
    lowBalance: { thresholdUcr: ucr(500), below: o.low ?? available < 500 },
    allowance: { monthlyCredits: 1000, period: "2026-10", granted: true, expiresAt: "2026-11-01T00:00:00.000Z" },
    nextExpiry: { ucr: ucr(1000), at: "2026-11-01T00:00:00.000Z", source: "allowance" },
    alerts: (o.low ?? available < 500) ? [{ kind: "low_balance", thresholdUcr: ucr(500) }] : [],
    autoRecharge: owner ? { enabled: true, thresholdUcr: ucr(500), pack: "eur_50", packCredits: 5150, monthlyMaxCount: 3, monthlyMaxCents: 30000, failures: 0, disabledReason: null, lastFailureCode: null } : null,
    card: owner ? { brand: "visa", last4: "4242" } : null,
    payments: owner ? { access: "test_workspace", mode: "test", pendingOrders: 0 } : null,
    asOf: new Date().toISOString(),
  };
}
export const profile = { legalName: "Acme Software SL", country: "ES", taxId: "B12345674", taxIdKind: "es_nif", viesStatus: "not_required", taxTreatment: "es_vat",
  taxReviewReason: null, addressLine1: "Calle Mayor 1", addressLine2: null, postalCode: "47001", city: "Valladolid", region: null, billingEmail: "billing@acme.example" };
export const packs = {
  access: "test_workspace", mode: "test", firstTopUp: false, limits: { isNew: false, windowNetCents: 0, recentCount: 0, lifted: true }, profile,
  balance: { availableCredits: 1820, heldCredits: 3, frozen: false }, card: { brand: "visa", last4: "4242" },
  autoRecharge: { enabled: true, thresholdCredits: 500, pack: "eur_50", monthlyMaxCount: 3, monthlyMaxCents: 30000, failures: 0, lastFailureCode: null, disabledReason: null, retryAfter: null },
  legal: { termsUrl: "https://caudals.com/en/legal/terms", privacyUrl: "https://caudals.com/en/legal/privacy" },
  packs: [
    { id: "eur_20", netCents: 2000, vatCents: 420, grossCents: 2420, credits: 2000, bonusCredits: 0, bonusKind: null, blocked: null },
    { id: "eur_50", netCents: 5000, vatCents: 1050, grossCents: 6050, credits: 5000, bonusCredits: 150, bonusKind: "pack", blocked: null },
    { id: "eur_100", netCents: 10000, vatCents: 2100, grossCents: 12100, credits: 10000, bonusCredits: 500, bonusKind: "pack", blocked: null },
    { id: "eur_250", netCents: 25000, vatCents: 5250, grossCents: 30250, credits: 25000, bonusCredits: 2000, bonusKind: "pack", blocked: null },
    { id: "eur_500", netCents: 50000, vatCents: 10500, grossCents: 60500, credits: 50000, bonusCredits: 5000, bonusKind: "pack", blocked: null },
  ],
};
export const usage = {
  from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z",
  totals: { grossUcr: ucr(419.75), returnedUcr: ucr(7.25), netUcr: ucr(412.5) },
  days: [{ day: "2026-10-02", netUcr: ucr(120) }, { day: "2026-10-09", netUcr: ucr(280.25) }, { day: "2026-10-13", netUcr: ucr(12.25) }],
  runs: [
    { key: runId, runId, evaluationId, evaluationTitle: "Claims assistant review", runStartedAt: "2026-10-09T10:00:00.000Z", runStatus: "completed", reportId, netUcr: ucr(400.25), grossUcr: ucr(400.25), returnedUcr: "0", entries: 52 },
    { key: "prep:x", runId: null, evaluationId, evaluationTitle: "Claims assistant review", runStartedAt: null, runStatus: null, reportId: null, netUcr: ucr(12.25), grossUcr: ucr(19.5), returnedUcr: ucr(7.25), entries: 3 },
  ],
  items: [
    { kind: "meter", key: "website_question", netUcr: ucr(250), grossUcr: ucr(250), returnedUcr: "0", quantity: 50, tokens: 0, entries: 50 },
    { kind: "tokens", key: "Caudals Local (DeepSeek V4 Flash on the DGX)", netUcr: ucr(150.25), grossUcr: ucr(150.25), returnedUcr: "0", quantity: 0, tokens: 412000, entries: 51 },
    { kind: "meter", key: "web_page_read", netUcr: ucr(12.25), grossUcr: ucr(19.5), returnedUcr: ucr(7.25), quantity: 12, tokens: 0, entries: 1 },
  ],
};
export const ledger = { entries: [
  { id: "e3", createdAt: "2026-10-13T09:00:00.000Z", type: "action", amountUcr: ucr(-5), availableAfterUcr: ucr(1820), heldAfterUcr: ucr(3), runId, meter: "website_question", refKind: null, reverses: null },
  { id: "e2", createdAt: "2026-10-12T09:00:00.000Z", type: "purchase", amountUcr: ucr(2000), availableAfterUcr: ucr(1825), heldAfterUcr: "0", runId: null, meter: null, refKind: "top_up_order", reverses: null },
  { id: "e1", createdAt: "2026-10-01T00:00:00.000Z", type: "allowance", amountUcr: ucr(1000), availableAfterUcr: ucr(1000), heldAfterUcr: "0", runId: null, meter: null, refKind: "allowance", reverses: null },
], nextCursor: null };
export const workspaceSummary = (o: Options) => ({
  evaluations: [{ id: evaluationId, title: "Claims assistant review", project_id: "00000000-0000-4000-8000-000000000906", project_title: "Claims", project_description: "",
    latest_source_id: null, latest_source_revision_id: null, preparation_status: "ready", reason_code: null, selected_suite_version_id: "00000000-0000-4000-8000-000000000907",
    selected_target_id: "00000000-0000-4000-8000-000000000908", commercial_cap: "500", currency: "EUR", latest_run_id: o.runStatus ? runId : null,
    latest_run_status: o.runStatus ?? null, latest_run_phase: o.runStatus ? "target_execution" : null, created_at: new Date().toISOString() }],
  systems: [{ id: "00000000-0000-4000-8000-000000000908", project_id: "00000000-0000-4000-8000-000000000906", title: "Claims chat", target_revision_id: systemRevision,
    document: { kind: "website" }, connection_status: "connected", runner_status: null, runner_id: null, error_code: null }],
  reports: [],
  entitlement: { plan: o.plan ?? "payg", max_systems: 10, max_tests_per_set: 500, max_runs_per_month: null, max_members: 10, max_active_runs: 2, monthly_spend_limit: "500",
    currency: "EUR", allowed_connection_types: ["website", "openai_compatible", "https_json", "imported_responses"], can_export: true, can_schedule: true },
  usage: { settled: "128.40", outstanding: "0" },
  preferences: { completion: true, required_input: true, failure: true, email: false },
});

export type Calls = { started: number; topUps: Array<Record<string, unknown>>; caps: Array<{ body: Record<string, unknown>; key: string | null }>; recharge: Array<Record<string, unknown>>; summaries: number; resumes: number };

export async function routeBilling(page: Page, o: Options = {}) {
  const calls: Calls = { started: 0, topUps: [], caps: [], recharge: [], summaries: 0, resumes: 0 };
  const state = { available: o.available ?? 1820 };
  await page.route("**/api/evals/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/evals/v1", "");
    const method = route.request().method();
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: status === 200 ? { data, meta: {} } : data });
    if (path === "/workspace/summary") return json(workspaceSummary(o));
    if (path === "/billing/summary") { calls.summaries++; return json(summary({ ...o, available: state.available })); }
    if (path === "/billing/usage") {
      if (url.searchParams.get("format") === "csv") return route.fulfill({ contentType: "text/csv", body: "date_utc\n" });
      return json(usage);
    }
    if (path === "/billing/ledger") return json(ledger);
    if (path === "/billing/caps") {
      if (method === "PUT") {
        const body = route.request().postDataJSON(); calls.caps.push({ body, key: route.request().headers()["idempotency-key"] ?? null });
        const custom = typeof body.lowBalanceThresholdCredits === "number" ? ucr(body.lowBalanceThresholdCredits) : null;
        return json({ monthlyUcr: body.monthlyCapCredits ? ucr(body.monthlyCapCredits) : null, perRunUcr: null, perRunMultiplier: body.perRun.multiplier ?? 2, updatedAt: new Date().toISOString(),
          lowBalanceThresholdUcr: custom ?? ucr(500), lowBalanceCustomUcr: custom, lowBalanceDefaultUcr: ucr(500) });
      }
      return json({ monthlyUcr: o.capCredits === null ? null : ucr(o.capCredits ?? 5000), perRunUcr: null, perRunMultiplier: 2, lowBalanceThresholdUcr: ucr(o.lowBalanceCredits ?? 500),
        lowBalanceCustomUcr: o.lowBalanceCredits ? ucr(o.lowBalanceCredits) : null, lowBalanceDefaultUcr: ucr(500), recipients: (o.role ?? "owner") === "owner" ? ["owner@acme.example"] : null, updatedAt: null });
    }
    if (path === "/billing/packs") return json(packs);
    if (path === "/billing/auto-recharge") { calls.recharge.push(route.request().postDataJSON()); return json(packs.autoRecharge); }
    if (path === "/billing/invoices") return o.invoices ? json({ invoices: [
      { id: "00000000-0000-4000-8000-000000000909", kind: "invoice", status: "issued", number: "CAU-2026-0001", issueDate: "2026-10-12", operationDate: "2026-10-12", grossCents: 2420, netCents: 2000, vatCents: 420, taxMention: null, pdfAvailable: true, rectifiesNumber: null, livemode: false },
    ] }) : json({ error: { code: "SCOPE_DENIED" } }, 404);
    if (path === "/billing/rates") return json({ priceBook: { id: "p", revision: 1, effectiveAt: null }, roles: [{ role: "judge", modelId: "deepseek", label: "Caudals Local (DeepSeek V4 Flash on the DGX)", free: false, input: "50", output: "200" }],
      catalog: [{ label: "Caudals Local (DeepSeek V4 Flash on the DGX)", provider: "dgx", minInputTokens: 0, input: "50", output: "200" }, { label: "Claude Sonnet 5.5 (Anthropic)", provider: "openrouter", minInputTokens: 0, input: "275", output: "1365" }],
      meters: [{ meter: "website_question", unit: "question", credits: "5" }] });
    if (path === "/billing/estimates") return json({ ...baseEstimate, ...o.estimate });
    if (path === "/billing/top-ups" && method === "POST") { calls.topUps.push(route.request().postDataJSON()); return json({ order: { id: order, status: "pending" }, checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_l15" }); }
    if (path === `/evaluations/${evaluationId}/start`) { calls.started++; return json({ runId }); }
    if (path === `/runs/${runId}`) return json({ run: { id: runId, status: o.runStatus ?? "running", phase: "target_execution", execution_mode: "deployed_system", suite_version_id: "s", created_at: new Date().toISOString(), reason_code: o.runReason ?? null },
      units: Array.from({ length: 10 }, (_, index) => ({ id: `u${index}`, status: index < 4 ? "succeeded" : "pending" })), targetUsage: { calls: 4, unknown: 0 } });
    if (path === `/evaluations/${evaluationId}/control`) {
      if (method === "POST") calls.resumes++;
      return json(o.runStatus ? { subject: { kind: "run", id: runId, status: o.runStatus, phase: "target_execution", updatedAt: new Date().toISOString() }, restart: null, actions: o.runStatus === "paused" ? ["resume", "stop"] : ["pause", "stop"] }
        : { subject: null, restart: null, actions: [] });
    }
    return json([]);
  });
  return { calls, state };
}
