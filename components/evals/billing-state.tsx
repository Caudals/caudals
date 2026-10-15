"use client";

/**
 * The workspace's billing summary, shared by every billing surface in the
 * shell (launch L-15, spec §6.12): the sidebar pill, the low-balance banner,
 * Settings → Billing and usage, the run estimate dialog and the paused-for-
 * credits state. One request per workspace keeps their numbers identical.
 *
 * It asks only when the server says the billing screens may show at all
 * (`enabled`, BILLING_UI_ENABLED with the credit layer on) and the person is
 * not a viewer; GET /billing/summary then answers 404 wherever this workspace
 * is not eligible, and every billing surface stays hidden. The summary
 * refreshes every minute, when the window regains focus, every few seconds
 * while a top-up is pending, and at once on `caudals:billing-changed` (fired
 * after a purchase), so the balance updates without a reload.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { evalRequest, EvalRequestError } from "./api";
import { useWorkspace } from "./workspace-context";
import { getLocale } from "@/lib/evals/messages/runtime";

/** GET /api/evals/v1/billing/summary (lib/billing/customer-api.ts). Amounts are µcr strings. */
export type BillingSummary = {
  orgId: string;
  level: "owner" | "editor";
  role: string | null;
  plan: string;
  billingMode: "free" | "credits" | "contract";
  balance: { availableUcr: string; heldUcr: string };
  frozen: boolean;
  gate: "enforced" | "none";
  month: { period: string; from: string; to: string; usedUcr: string; committedUcr: string };
  caps: { monthlyUcr: string | null; perRunUcr: string | null; perRunMultiplier: number };
  lowBalance: { thresholdUcr: string; below: boolean };
  allowance: { monthlyCredits: number; period: string; granted: boolean; expiresAt: string | null } | null;
  nextExpiry: { ucr: string; at: string; source: string } | null;
  alerts: Array<{ kind: string; [key: string]: unknown }>;
  autoRecharge: {
    enabled: boolean; thresholdUcr: string | null; pack: string | null; packCredits: number | null; monthlyMaxCount: number | null;
    monthlyMaxCents: number | null; failures: number; disabledReason: string | null; lastFailureCode: string | null;
  } | null;
  card: { brand: string | null; last4: string | null } | null;
  payments: { access: "open" | "test_workspace" | "closed"; mode: "test" | "live"; pendingOrders: number } | null;
  asOf: string;
};

/** Fired after credits change (a paid top-up): every billing surface refreshes at once. */
export const BILLING_CHANGED_EVENT = "caudals:billing-changed";
export function announceBillingChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BILLING_CHANGED_EVENT));
}

type BillingState = {
  /** The summary, or null while loading, for viewers and wherever billing does not show. */
  summary: BillingSummary | null;
  loaded: boolean;
  refresh: () => void;
  /** Poll every few seconds for a while (after a top-up starts, while a run waits for credits). */
  watch: (ms?: number) => void;
};

const Context = createContext<BillingState>({ summary: null, loaded: true, refresh: () => undefined, watch: () => undefined });

export function BillingProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { orgId, role } = useWorkspace();
  const active = enabled && !!orgId && role !== "viewer";
  const [state, setState] = useState<{ orgId: string; summary: BillingSummary | null } | null>(null);
  const [version, setVersion] = useState(0);
  const fastUntil = useRef(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  const watch = useCallback((ms = 120_000) => { fastUntil.current = Date.now() + ms; setVersion(value => value + 1); }, []);

  useEffect(() => {
    if (!active) return;
    let live = true;
    let timer = 0;
    const load = async () => {
      let next: BillingSummary | null = null;
      try {
        next = await evalRequest<BillingSummary>(`/billing/summary?orgId=${encodeURIComponent(orgId)}`);
      } catch (error) {
        // 404: billing does not show here. Anything else: keep what we had and try again later.
        if (!live) return;
        if (error instanceof EvalRequestError && error.status === 404) setState({ orgId, summary: null });
        else setState(current => current?.orgId === orgId ? current : { orgId, summary: null });
        timer = window.setTimeout(() => void load(), 60_000);
        return;
      }
      if (!live) return;
      setState({ orgId, summary: next });
      const fast = Date.now() < fastUntil.current || (next.payments?.pendingOrders ?? 0) > 0;
      timer = window.setTimeout(() => void load(), document.hidden ? 120_000 : fast ? 4_000 : 60_000);
    };
    void load();
    const onChange = () => { window.clearTimeout(timer); void load(); };
    window.addEventListener(BILLING_CHANGED_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener(BILLING_CHANGED_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [active, orgId, version]);

  const value = useMemo<BillingState>(() => {
    const current = active && state?.orgId === orgId ? state.summary : null;
    return { summary: current, loaded: !active || state?.orgId === orgId, refresh, watch };
  }, [active, state, orgId, refresh, watch]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBilling() {
  return useContext(Context);
}

/* ------------------------------------------------------------ formatting --- */

const MICRO = BigInt(1_000_000);
const HUNDREDTH = BigInt(10_000);
const ZERO = BigInt(0);
const intl = () => (getLocale() === "es" ? "es-ES" : "en-GB");

/** µcr (string or bigint) as bigint; anything unreadable is 0. */
export function ucr(value: string | bigint | null | undefined): bigint {
  if (typeof value === "bigint") return value;
  try { return value ? BigInt(value) : ZERO; } catch { return ZERO; }
}

/**
 * Credits as screens show them: whole credits when exact, otherwise two
 * decimals cut toward zero, so a balance is never overstated; the CSV export
 * keeps every decimal. "1,820", "1,819.92"; Spanish "1820", "1819,92".
 */
export function formatCredits(value: string | bigint | null | undefined): string {
  const amount = ucr(value);
  const negative = amount < ZERO;
  const abs = negative ? -amount : amount;
  const whole = abs / MICRO;
  const hundredths = (abs % MICRO) / HUNDREDTH;
  const number = Number(whole) + Number(hundredths) / 100;
  const text = new Intl.NumberFormat(intl(), { minimumFractionDigits: hundredths > ZERO ? 2 : 0, maximumFractionDigits: 2 }).format(number);
  return negative ? `−${text}` : text;
}

/** Whole credits (a plain integer, e.g. from the estimator) with grouping. */
export function formatCount(value: number | string): string {
  return new Intl.NumberFormat(intl()).format(Number(value));
}

/** The euro equivalent of µcr (1 credit = €0.01 excl. VAT), cut to the cent like the credits. */
export function formatCreditEuros(value: string | bigint | null | undefined): string {
  const cents = ucr(value) / MICRO;
  return new Intl.NumberFormat(intl(), { style: "currency", currency: "EUR" }).format(Number(cents) / 100);
}

export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat(intl(), { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** µcr → whole credits rounded up (a charge or a shortfall is never understated). */
export function creditsUp(value: string | bigint | null | undefined): number {
  const amount = ucr(value);
  return Number(amount <= ZERO ? ZERO : (amount + MICRO - BigInt(1)) / MICRO);
}
