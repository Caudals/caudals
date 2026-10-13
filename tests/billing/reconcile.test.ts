/**
 * Daily reconciliation logic (launch L-16, spec §6.13, P-49): the Stripe side
 * (matched, missing, different amount, payments whose order got no credits,
 * explained timing and unrelated movements), the report's counts and the
 * clean-day streak for Gate B.
 */
import { describe, expect, it } from "vitest";
import { buildReport, cleanStreak, reconciliationDue, stripeSide, type DbChecks, type OrderLookup } from "../../lib/billing/reconcile";
import type { BalanceTransaction } from "../../lib/billing/invoicing/export";

const DAY = "2026-10-13";
const at = (time: string) => `${DAY}T${time}Z`;
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
function checks(overrides: Partial<DbChecks> = {}): DbChecks {
  return {
    day: DAY, livemode: false, from: at("00:00:00"), to: "2026-10-14T00:00:00Z",
    checks: { paid_order_purchase_mismatch: { count: 0, ids: [] }, holds_open_over_25h: { count: 0, ids: [] }, shadow_drift: { count: 0, ids: [] } },
    notes: { voided_test_documents: 0, orders_flagged_for_review: 0 },
    orders: [
      { id: "o1", org_id: "w1", status: "paid", paid_at: at("10:00:00"), refunded_at: null, gross_cents: 2420, net_cents: 2000, charge: null, refund: null, payment_intent: "pi_1" },
      { id: "o2", org_id: "w1", status: "refunded", paid_at: at("11:00:00"), refunded_at: at("12:00:00"), gross_cents: 6050, net_cents: 5000, charge: "ch_2", refund: "re_2", payment_intent: "pi_2" },
    ],
    totals: {},
    ...overrides,
  };
}
const tx = (id: string, type: string, amount: number, created: string, extra: Partial<BalanceTransaction> = {}): BalanceTransaction =>
  ({ id, type, amount, fee: type === "charge" ? 50 : 0, net: amount - (type === "charge" ? 50 : 0), currency: "eur", created: sec(created), sourceId: null, paymentIntentId: null, ...extra });
const clean = [
  tx("txn_1", "charge", 2420, at("10:00:05"), { paymentIntentId: "pi_1" }),
  tx("txn_2", "charge", 6050, at("11:00:05"), { sourceId: "ch_2", paymentIntentId: "pi_2" }),
  tx("txn_3", "refund", -6050, at("12:00:05"), { sourceId: "re_2", paymentIntentId: "pi_2" }),
];
const noLookup = async () => [] as OrderLookup[];

describe("daily reconciliation", () => {
  it("shows zero differences when every payment and refund of the day is in Stripe with its amount", async () => {
    const side = await stripeSide(checks(), clean, noLookup);
    expect(side).toMatchObject({ checked: true, matched: 3, issues: [], unpaidOrders: [], timing: [], unrelated: [] });
    expect(buildReport(checks(), side)).toMatchObject({ discrepancies: 0, explained: 0, stripeChecked: true });
  });

  it("flags an order movement missing in Stripe or with another amount", async () => {
    const side = await stripeSide(checks(), [clean[0], { ...clean[1], amount: 6000 }], noLookup);
    expect(side.issues.map(item => [item.orderId, item.movement, item.status])).toEqual([["o2", "payment", "amount_mismatch"], ["o2", "refund", "missing_in_stripe"]]);
    expect(buildReport(checks(), side).discrepancies).toBe(2);
  });

  it("flags a Stripe payment whose order never got its credits, and explains timing and other integrations", async () => {
    const extra = [
      tx("txn_4", "charge", 2420, at("13:00:00"), { paymentIntentId: "pi_pending" }),
      tx("txn_5", "charge", 2420, at("14:00:00"), { paymentIntentId: "pi_yesterday" }),
      tx("txn_6", "charge", 999, at("15:00:00"), { paymentIntentId: "pi_other" }),
      tx("txn_7", "charge", 2420, "2026-10-14T00:30:00Z", { paymentIntentId: "pi_tomorrow" }),
    ];
    const lookup = async (_orders: string[], intents: string[]): Promise<OrderLookup[]> => {
      expect(intents.sort()).toEqual(["pi_other", "pi_pending", "pi_yesterday"]);
      return [
        { id: "o3", orgId: "w1", status: "pending", livemode: false, paidAt: null, refundedAt: null, paymentIntent: null },
        { id: "o4", orgId: "w1", status: "paid", livemode: false, paidAt: "2026-10-12T23:59:59Z", refundedAt: null, paymentIntent: "pi_yesterday" },
      ];
    };
    // Checkout metadata names the order behind pi_pending (its order has no PaymentIntent yet: the webhook was lost).
    const side = await stripeSide(checks(), [...clean, ...extra], lookup, async () => new Map([["pi_pending", "o3"]]));
    expect(side.unpaidOrders).toEqual([{ stripeId: "txn_4", orderId: "o3", status: "pending" }]);
    expect(side.timing).toEqual([{ stripeId: "txn_5", orderId: "o4" }]);
    expect(side.unrelated).toEqual([{ stripeId: "txn_6", type: "charge", amount: 999 }]);
    const report = buildReport(checks(), side);
    expect(report).toMatchObject({ discrepancies: 1, explained: 2 });
  });

  it("counts database checks, and an unchecked Stripe side, as differences; notes as explained", () => {
    const db = checks({ checks: { paid_order_invoice_mismatch: { count: 2, ids: ["o1", "o2"] }, shadow_drift: { count: 1, ids: [] } }, notes: { voided_test_documents: 3 } });
    const report = buildReport(db, { checked: false, reason: "stripe_unavailable", matched: 0, issues: [], unpaidOrders: [], timing: [], unrelated: [] });
    expect(report).toMatchObject({ discrepancies: 4, explained: 3, stripeChecked: false });
  });

  it("counts consecutive clean days from the latest, using each day's latest run", () => {
    expect(cleanStreak([
      { day: "2026-10-13", discrepancies: 0, generatedAt: "2026-10-14T05:00:00Z" },
      { day: "2026-10-12", discrepancies: 2, generatedAt: "2026-10-13T05:00:00Z" },
      { day: "2026-10-12", discrepancies: 0, generatedAt: "2026-10-13T09:00:00Z" },
      { day: "2026-10-11", discrepancies: 0, generatedAt: "2026-10-12T05:00:00Z" },
      { day: "2026-10-09", discrepancies: 0, generatedAt: "2026-10-10T05:00:00Z" },
    ])).toEqual({ days: 3, since: "2026-10-11" });
    expect(cleanStreak([{ day: "2026-10-13", discrepancies: 1, generatedAt: "2026-10-14T05:00:00Z" }])).toEqual({ days: 0, since: null });
    expect(cleanStreak([])).toEqual({ days: 0, since: null });
  });

  it("runs at scheduler start and once in the 05:00 UTC hour", () => {
    expect(reconciliationDue(0, new Date("2026-10-13T12:00:00Z"))).toBe(true);
    expect(reconciliationDue(Date.parse("2026-10-13T04:10:00Z"), new Date("2026-10-13T05:20:00Z"))).toBe(true);
    expect(reconciliationDue(Date.parse("2026-10-13T05:01:00Z"), new Date("2026-10-13T05:30:00Z"))).toBe(false);
    expect(reconciliationDue(Date.parse("2026-10-13T04:00:00Z"), new Date("2026-10-13T12:00:00Z"))).toBe(false);
  });
});
