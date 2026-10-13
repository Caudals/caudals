/**
 * Invoicing without a database (launch L-13, spec §6.14): the provider flag,
 * the adapter contract (the manual adapter and a fake vendor), numbers and
 * series, invoice wording in ES/EN, the accountant export and its Stripe
 * reconciliation, PDFs, and the server-side role checks of the owner routes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeInvoicingProvider, fakePdf } from "./fake-invoicing-provider";

const audited = vi.hoisted(() => [] as Array<{ orgId: string; action: string }>);
vi.mock("@/lib/evals/domain/identity", () => ({
  requireWorkspace: vi.fn(async (_identity: unknown, orgId: string, action: string) => { audited.push({ orgId, action }); }),
}));

const {
  createInvoicingAdapter, documentFromRow, documentView, invoicingEnabled, invoicingProvider, numberFitsDocument,
} = await import("../../lib/billing/invoicing/index");
const { manualInvoicingAdapter } = await import("../../lib/billing/invoicing/manual");
const { INVOICE_COPY, documentHeading, lineText } = await import("../../lib/billing/invoicing/copy");
const { csvCell, reconcileStripe, renderExport } = await import("../../lib/billing/invoicing/export");
const { InvoicePdfError, checkInvoicePdf } = await import("../../lib/billing/invoicing/pdf");
const { adminInvoiceInput, pdfFileName, requireInvoiceOwner } = await import("../../lib/billing/invoicing/api");
const { taxMention } = await import("../../lib/billing/tax");

type Treatment = "es_vat" | "eu_reverse_charge" | "non_eu_not_subject";
const ORG = "11111111-2222-4333-8444-555555555555";

function documentRow(overrides: Record<string, unknown> = {}) {
  const treatment = (overrides.tax_treatment ?? "es_vat") as Treatment;
  const vat = treatment === "es_vat" ? 420 : 0;
  return {
    kind: "invoice", id: "aaaaaaaa-0000-4000-8000-000000000001", org_id: ORG, order_id: "bbbbbbbb-0000-4000-8000-000000000001", livemode: true,
    series_code: "CAU", status: "queued", number: null, issue_date: null, operation_date: "2026-10-13", locale: "es", currency: "eur",
    net_cents: 2000, vat_rate_bp: vat ? 2100 : 0, vat_cents: vat, gross_cents: 2000 + vat, tax_treatment: treatment, tax_mention: taxMention(treatment),
    customer: { legal_name: "Acme Software SL", country: "ES", tax_id: "B12345674", tax_id_kind: "es_nif", vies_status: "not_required",
      address_line1: "Calle Mayor 2", postal_code: "47001", city: "Valladolid", billing_email: "billing@acme.example" },
    lines: [{ item: "credits", credits: 2000, unit_price_cents: 1, net_cents: 2000 }, { item: "bonus_credits", credits: 400, unit_price_cents: 0, net_cents: 0 }],
    attempts: 0, created_at: "2026-10-13T10:00:00Z", invoice_id: null, reason: null, original: null,
    ...overrides,
  };
}
const invoice = (overrides: Record<string, unknown> = {}) => documentFromRow(documentRow(overrides));
const creditNote = (overrides: Record<string, unknown> = {}) => documentFromRow(documentRow({
  kind: "credit_note", id: "aaaaaaaa-0000-4000-8000-000000000002", series_code: "CAU-R", net_cents: -2000, vat_cents: -420, gross_cents: -2420,
  invoice_id: "aaaaaaaa-0000-4000-8000-000000000001", reason: "refund",
  lines: [{ item: "credits", credits: -2000, unit_price_cents: 1, net_cents: -2000 }],
  original: { id: "aaaaaaaa-0000-4000-8000-000000000001", status: "issued", series_code: "CAU", number: "CAU-2026-0001", issue_date: "2026-10-13", provider: "fakeprovider", provider_reference: "fake_inv_1" },
  ...overrides,
}));
const context = { issuer: null, customerReference: null };

describe("BILLING_INVOICING_PROVIDER", () => {
  it("is off unless it names an adapter", () => {
    for (const value of [undefined, "", "off", "false", "Manual Mode!", "x"]) expect(invoicingProvider({ BILLING_INVOICING_PROVIDER: value })).toBe("off");
    expect(invoicingProvider({ BILLING_INVOICING_PROVIDER: " manual " })).toBe("manual");
    expect(invoicingEnabled({ BILLING_INVOICING_PROVIDER: "manual" })).toBe(true);
    expect(invoicingEnabled({})).toBe(false);
  });
  it("builds the manual adapter, and no vendor until one is chosen (D-04)", () => {
    expect(createInvoicingAdapter("manual")?.name).toBe("manual");
    expect(createInvoicingAdapter("holded")).toBeNull();
  });
});

const contract = [
  ["manual", () => manualInvoicingAdapter()],
  ["fake vendor", () => fakeInvoicingProvider().adapter],
] as const;

describe.each(contract)("invoicing adapter contract: %s", (_name, make) => {
  it("names itself as a provider code the database accepts", () => {
    expect(make().name).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
  });
  it("syncs a customer to a stable reference or none", async () => {
    const adapter = make();
    const party = invoice().customer;
    const first = await adapter.syncCustomer(party, { orgId: ORG, livemode: true });
    expect(first.reference === null || (typeof first.reference === "string" && first.reference.length > 0)).toBe(true);
    expect(await adapter.syncCustomer(party, { orgId: ORG, livemode: true })).toEqual(first);
  });
  for (const treatment of ["es_vat", "eu_reverse_charge", "non_eu_not_subject"] as const) {
    it(`issues or accepts an invoice for ${treatment}, idempotently per document`, async () => {
      const adapter = make();
      const document = invoice({ tax_treatment: treatment });
      const first = await adapter.issueInvoice(document, context);
      expect(["pending_issue", "issued"]).toContain(first.status);
      if (first.status === "issued") {
        expect(numberFitsDocument(first.number, document)).toBe(true);
        expect(first.issueDate >= document.operationDate).toBe(true);
        expect(Buffer.from(first.pdf!.subarray(0, 5)).toString()).toBe("%PDF-");
      }
      expect(await adapter.issueInvoice(document, context)).toEqual(first);
    });
  }
  it("rectifies an issued invoice in the rectifying series", async () => {
    const adapter = make();
    const outcome = await adapter.issueRectifying(creditNote(), context);
    if (outcome.status === "issued") expect(numberFitsDocument(outcome.number, creditNote())).toBe(true);
    else expect(outcome.status).toBe("pending_issue");
  });
  it("uses TEST- numbers for Stripe test-mode documents", async () => {
    const outcome = await make().issueInvoice(invoice({ livemode: false }), context);
    if (outcome.status === "issued") expect(outcome.number).toMatch(/^TEST-/);
  });
  it("returns a PDF or nothing", async () => {
    const adapter = make();
    const document = invoice();
    await adapter.issueInvoice(document, context);
    const pdf = await adapter.fetchPdf(document);
    if (pdf) expect(() => checkInvoicePdf(pdf)).not.toThrow();
  });
});

describe("the manual adapter", () => {
  it("never makes up a number or a PDF: every request waits for the accountant", async () => {
    const adapter = manualInvoicingAdapter();
    expect(await adapter.syncCustomer(invoice().customer, { orgId: ORG, livemode: true })).toEqual({ reference: null });
    expect(await adapter.issueInvoice(invoice(), context)).toEqual({ status: "pending_issue" });
    expect(await adapter.issueRectifying(creditNote({ original: null }), context)).toEqual({ status: "pending_issue" });
    expect(await adapter.fetchPdf(invoice({ status: "issued", number: "CAU-2026-0001", issue_date: "2026-10-13" }))).toBeNull();
  });
  it("refuses a document of the wrong kind or a rectifying invoice without its original", async () => {
    const adapter = manualInvoicingAdapter();
    await expect(adapter.issueInvoice(creditNote(), context)).rejects.toMatchObject({ code: "wrong_document_kind", retryable: false });
    await expect(adapter.issueRectifying(creditNote({ invoice_id: null }), context)).rejects.toMatchObject({ code: "original_missing" });
  });
});

describe("the fake vendor (interface proof)", () => {
  it("fails as asked, then issues once per document", async () => {
    const { adapter, issued } = fakeInvoicingProvider({ failTimes: 1 });
    await expect(adapter.issueInvoice(invoice(), context)).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
    const outcome = await adapter.issueInvoice(invoice(), context);
    expect(outcome).toMatchObject({ status: "issued", number: expect.stringMatching(/^CAU-\d{4}-0001$/), verifactuStatus: "accepted" });
    expect(issued.size).toBe(1);
    await expect(adapter.issueRectifying(creditNote({ original: { id: "x", status: "pending_issue", series_code: "CAU" } }), context))
      .rejects.toMatchObject({ code: "original_not_issued" });
  });
});

describe("numbers and series (§3.2)", () => {
  it("live numbers belong to the document's series; test numbers start with TEST-", () => {
    expect(numberFitsDocument("CAU-2026-0001", invoice())).toBe(true);
    expect(numberFitsDocument("CAU-R-2026-0001", invoice())).toBe(false);
    expect(numberFitsDocument("CAU-S-2026-0001", invoice())).toBe(false);
    expect(numberFitsDocument("TEST-1", invoice())).toBe(false);
    expect(numberFitsDocument("CAU-R-2026-0001", creditNote())).toBe(true);
    expect(numberFitsDocument("CAU-2026-0001", creditNote())).toBe(false);
    expect(numberFitsDocument("TEST-CAU-1", invoice({ livemode: false }))).toBe(true);
    expect(numberFitsDocument("CAU-2026-0001", invoice({ livemode: false }))).toBe(false);
  });
});

describe("invoice wording (ES and EN)", () => {
  it("describes the purchased and bonus credits in the document's language", () => {
    const [credits, bonus] = invoice().lines;
    expect(lineText(credits, "es")).toBe("2000 × Créditos de uso de la plataforma Caudals (prepago) × 0.01 = 20.00");
    expect(lineText(credits, "en")).toBe("2,000 × Caudals platform usage credits (prepaid) × 0.01 = 20.00");
    expect(lineText(bonus, "es")).toBe("400 × Créditos de bonificación, sin cargo × 0.00 = 0.00");
    expect(documentHeading(creditNote())).toBe("Factura rectificativa · Rectifica la factura CAU-2026-0001 · Reembolso de una compra de créditos sin usar");
    expect(documentHeading(creditNote({ locale: "en" }))).toContain("Corrects invoice CAU-2026-0001");
    expect(Object.keys(INVOICE_COPY.es).sort()).toEqual(Object.keys(INVOICE_COPY.en).sort());
  });
  it("shows owners a pending request until it is issued", () => {
    expect(documentView(invoice({ status: "pending_issue", provider: "manual" }))).toMatchObject({ status: "pending", number: null, pdfAvailable: false });
    expect(documentView(invoice({ status: "issued", number: "CAU-2026-0001", issue_date: "2026-10-13", provider: "manual" })).pdfAvailable).toBe(false);
    expect(documentView(invoice({ status: "issued", number: "CAU-2026-0001", issue_date: "2026-10-13", provider: "manual", pdf_object_key: `evals/${ORG}/x/sealed/y`,
      pdf_sha256: "0".repeat(64), pdf_byte_size: 100, pdf_attached_at: "2026-10-13T11:00:00Z" }))).toMatchObject({ status: "issued", pdfAvailable: true });
    expect(pdfFileName({ number: "CAU-2026/0001", id: "x" })).toBe("CAU-2026_0001.pdf");
  });
});

describe("invoice PDFs", () => {
  it("accepts PDFs up to 5 MB only", () => {
    expect(() => checkInvoicePdf(fakePdf("ok"))).not.toThrow();
    expect(() => checkInvoicePdf(new Uint8Array(Buffer.from("<html>not a pdf</html>".padEnd(100, " "))))).toThrow(InvoicePdfError);
    expect(() => checkInvoicePdf(new Uint8Array(5 * 1024 * 1024 + 1))).toThrow(/PDF_TOO_LARGE/);
  });
  it("validates the admin issue request: a series number, a date, a PDF and a reason", () => {
    const base = { action: "issue", orgId: ORG, kind: "invoice", number: "CAU-2026-0001", issueDate: "2026-10-13",
      pdfBase64: Buffer.from(fakePdf("x")).toString("base64"), reason: "Issued by the accountant" };
    expect(adminInvoiceInput.parse(base)).toMatchObject({ action: "issue" });
    expect(() => adminInvoiceInput.parse({ ...base, issueDate: "13/10/2026" })).toThrow();
    expect(() => adminInvoiceInput.parse({ ...base, reason: "" })).toThrow();
    expect(() => adminInvoiceInput.parse({ ...base, extra: 1 })).toThrow();
    expect(adminInvoiceInput.parse({ action: "void", orgId: ORG, kind: "credit_note", reason: "Test clean-up" })).toMatchObject({ action: "void" });
  });
});

describe("invoice routes: server-side role checks", () => {
  const env = { ...process.env };
  const identity = (role: "owner" | "editor" | "viewer" | "operator", platformRole: "platform_admin" | null = null) => ({
    user: { id: "au_fixture", email: "ana@acme.example", name: "Ana" }, platformRole, workspaces: [{ id: ORG, name: "Acme", role }],
  });
  beforeEach(() => { audited.length = 0; process.env.BILLING_INVOICING_PROVIDER = "manual"; });
  afterEach(() => { process.env = { ...env }; });

  it("lets owners (and platform admins, audited) read; everyone else gets 404", async () => {
    await expect(requireInvoiceOwner(identity("owner"), ORG)).resolves.toBeUndefined();
    await expect(requireInvoiceOwner(identity("operator", "platform_admin"), ORG)).resolves.toBeUndefined();
    for (const role of ["editor", "viewer", "operator"] as const) {
      await expect(requireInvoiceOwner(identity(role), ORG)).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 404 });
    }
    expect(audited).toEqual([{ orgId: ORG, action: "read" }, { orgId: ORG, action: "read" }]);
  });
  it("answers 404 to everyone while invoicing is off", async () => {
    delete process.env.BILLING_INVOICING_PROVIDER;
    await expect(requireInvoiceOwner(identity("owner"), ORG)).rejects.toMatchObject({ status: 404 });
    expect(audited).toEqual([]);
  });
});

/* -------------------------------------------- export and reconciliation --- */

const FROM = "2026-09-30T22:00:00.000Z", TO = "2026-10-31T23:00:00.000Z";
function order(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, org_id: ORG, kind: "checkout", status: "paid", paid_at: "2026-10-10T09:00:00Z", refunded_at: null, net_cents: 2000, vat_cents: 420,
    gross_cents: 2420, tax_treatment: "es_vat", credits: 2000, bonus_credits: 400, legal_name: "Acme Software SL", tax_id: "B12345674",
    country: "ES", payment_intent: `pi_${id}`, charge: `ch_${id}`, refund: null, risk_flags: [], invoice: { id: `inv_${id}`, status: "pending_issue", number: null },
    credit_note: null, ...overrides,
  };
}
const tx = (id: string, type: string, amount: number, sourceId: string | null, paymentIntentId: string | null = null, fee = 0) =>
  ({ id, type, amount, fee, net: amount - fee, currency: "eur", created: 1_760_000_000, sourceId, paymentIntentId });

describe("Stripe reconciliation of the monthly export (fixtures)", () => {
  it("matches payments and refunds by charge, refund or PaymentIntent and totals fees and payouts", () => {
    const orders = [
      order("a"),
      order("b", { status: "refunded", refunded_at: "2026-10-12T09:00:00Z", refund: "re_b" }),
      order("c", { charge: null, net_cents: 5000, vat_cents: 0, gross_cents: 5000, tax_treatment: "eu_reverse_charge" }),
    ];
    const result = reconcileStripe({ orders, from: FROM, to: TO }, [
      tx("txn_a", "charge", 2420, "ch_a", null, 61),
      tx("txn_b", "charge", 2420, "ch_b", null, 61),
      tx("txn_b_refund", "refund", -2420, "re_b"),
      tx("txn_c", "payment", 5000, "py_c", "pi_c", 100),
      tx("txn_other", "charge", 999, "ch_marketplace_legacy"),
      tx("txn_payout", "payout", -4000, "po_1"),
    ]);
    expect(result.rows.map(row => [row.orderId, row.movement, row.status])).toEqual([
      ["a", "payment", "matched"], ["b", "payment", "matched"], ["b", "refund", "matched"], ["c", "payment", "matched"],
    ]);
    expect(result.totals).toEqual({
      ordersGrossCents: 9840, refundsGrossCents: -2420, stripeChargesCents: 9840, stripeRefundsCents: -2420, feesCents: 222,
      netCents: 9840 - 2420 - 222, payoutsCents: -4000, otherCents: 999,
    });
    expect(result.unmatched).toEqual([{ id: "txn_other", type: "charge", amount: 999, sourceId: "ch_marketplace_legacy" }]);
    expect(result.reconciled).toBe(true);
  });
  it("flags a missing payment and an amount that differs from the order", () => {
    const result = reconcileStripe({ orders: [order("a"), order("d")], from: FROM, to: TO }, [tx("txn_a", "charge", 2000, "ch_a")]);
    expect(result.rows.map(row => row.status)).toEqual(["amount_mismatch", "missing_in_stripe"]);
    expect(result.issues).toBe(2);
    expect(result.reconciled).toBe(false);
  });
  it("leaves orders paid in another month out of the month's movements", () => {
    const result = reconcileStripe({ orders: [order("e", { paid_at: "2026-09-30T21:59:59Z" })], from: FROM, to: TO }, []);
    expect(result.rows).toEqual([]);
    expect(result.reconciled).toBe(true);
  });
});

describe("the accountant export files", () => {
  const data = {
    month: "2026-10", livemode: false, time_zone: "Europe/Madrid", from: FROM, to: TO, generated_at: "2026-11-01T08:00:00Z", complete: true,
    sales: [{ tax_treatment: "es_vat", tax_mention: null, orders: 1, net_cents: 2000, vat_cents: 420, gross_cents: 2420, credits: 2000, bonus_credits: 400 },
      { tax_treatment: "non_eu_not_subject", tax_mention: "Operación no sujeta", orders: 1, net_cents: 5000, vat_cents: 0, gross_cents: 5000, credits: 5000, bonus_credits: 150 }],
    refunds: [{ tax_treatment: "es_vat", orders: 1, net_cents: -2000, vat_cents: -420, gross_cents: -2420 }],
    chargebacks: [],
    purchased_credits: { opening: { credits: 0, eur: 0 }, purchased: { credits: 7000, eur: 70 }, consumed: { credits: -1250, eur: -12.5 },
      refunded: { credits: -2000, eur: -20 }, closing: { credits: 3750, eur: 37.5 } },
    free_credits: { bonus: { granted: 550, consumed: -10 } },
    orders: [order("a", { legal_name: "=HYPERLINK(\"x\")" })],
    documents: [{ ...documentRow({ livemode: false, status: "pending_issue", provider: "manual" }), number_pattern: "^CAU-[0-9]…$", pdf_attached: false },
      { ...documentRow({ kind: "credit_note", id: "aaaaaaaa-0000-4000-8000-000000000002", series_code: "CAU-R", livemode: false, net_cents: -2000, vat_cents: -420,
        gross_cents: -2420, reason: "refund", status: "pending_issue", lines: [{ item: "credits", credits: -2000, unit_price_cents: 1, net_cents: -2000 }] }),
        rectifies: { id: "aaaaaaaa-0000-4000-8000-000000000001", series_code: "CAU", number: null, status: "pending_issue" }, number_pattern: "^CAU-R-…$", pdf_attached: false }],
    checks: { paid_orders_without_invoice: 0, refunded_orders_without_credit_note: 0, documents_to_issue: 2, documents_queued_with_errors: 0, deferred_balance_mismatch: 0 },
  };
  it("renders sales by treatment, the credit roll-forward, the documents to issue and the reconciliation", () => {
    const reconciliation = reconcileStripe(data, [tx("txn_a", "charge", 2420, "ch_a", null, 61)]);
    const files = renderExport(data, { issuer: null, reconciliation });
    expect(Object.keys(files).sort()).toEqual(["credits.csv", "documents.csv", "orders.csv", "reconciliation.csv", "sales.csv", "summary.md"]);
    expect(files["summary.md"]).toContain("STRIPE TEST MODE (not for the books)");
    expect(files["summary.md"]).toContain("| Spain, IVA 21 % | IVA 21 % | 1 | 20.00 | 4.20 | 24.20 |");
    expect(files["summary.md"]).toContain("| Outside the EU, not subject | Operación no sujeta | 1 | 50.00 | 0.00 | 50.00 |");
    expect(files["summary.md"]).toContain("| Closing deferred balance | 3750 | 37.50 |");
    expect(files["summary.md"]).toContain("2 to issue");
    expect(files["summary.md"]).toContain("Reconciled: 1 movements checked");
    expect(files["sales.csv"]).toContain("es_vat (refunds),,1,,,-20.00,-4.20,-24.20");
    const documents = files["documents.csv"].trim().split("\n");
    expect(documents).toHaveLength(3);
    expect(documents[1]).toContain("Factura,Acme Software SL,B12345674,es_nif,ES");
    expect(documents[1]).toContain("2000 × Créditos de uso de la plataforma Caudals (prepago) × 0.01 = 20.00 | 400 × Créditos de bonificación");
    expect(documents[2]).toContain("credit_note,pending_issue,CAU-R");
    expect(documents[2]).toContain("-20.00,21.00,-4.20,-24.20");
    // A customer-supplied name cannot become a spreadsheet formula.
    expect(files["orders.csv"]).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it("defuses formulas but keeps negative amounts as numbers", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-20.00")).toBe("-20.00");
    expect(csvCell("-x")).toBe("'-x");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(null)).toBe("");
  });
});
