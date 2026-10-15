"use client";

/**
 * Settings → Billing and usage (launch L-15, spec §6.12, P-13). Tabs:
 *
 *   Overview         balance (available and held), plan and allowance, usage
 *                    this month against the cap, auto-recharge, alerts, next expiry
 *   Top up           packs with the VAT preview and first-top-up bonus, Stripe
 *                    Checkout, auto-recharge settings, the saved card     (owners)
 *   Usage            by day, by evaluation and run, by model and meter; CSV;
 *                    account activity from the ledger (owners)
 *   Invoices         invoices and rectifying invoices with PDFs; shown only when
 *                    the invoices API answers (L-13, invoicing on)        (owners)
 *   Billing details  legal name, tax ID with VIES status, address, billing
 *                    email; payment methods in the Stripe Customer Portal (owners)
 *   Limits & alerts  monthly and per-run caps, the low-balance threshold and
 *                    who gets billing email                               (owners)
 *
 * Editors see Overview and Usage; viewers never reach this tab (the server
 * answers 404 to them, and Settings does not list it). Every number comes
 * from the ledger through /billing/summary and /billing/usage.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Download } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import {
  Action, ActionAnchor, ActionLink, Badge, DataTable, EmptyState, Field, Loading, RowTitle, Section, SelectField, SettingsRow, Stat, StatGrid,
  Status, Switch, Tabs, Time, formatDate,
} from "./primitives";
import { DayBars, Meter } from "./charts";
import { notify } from "./overlays";
import { HelpLink } from "./help";
import { PackPurchase, PaymentMethod, ProfileSection, usePacks, type Overview } from "./billing-top-up";
import {
  creditsUp, formatCount, formatCreditEuros, formatCredits, formatEuroCents, ucr, useBilling, type BillingSummary,
} from "./billing-state";
import { useWorkspace } from "./workspace-context";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";

export type BillingView = "overview" | "top-up" | "usage" | "invoices" | "details" | "limits";
const VIEWS: readonly BillingView[] = ["overview", "top-up", "usage", "invoices", "details", "limits"];

const PLAN_KEY: Record<string, MessageKey> = { free: "limitPlan_free", payg: "limitPlan_payg", managed: "limitPlan_managed", partner: "limitPlan_partner" };
/** "1 credit", "1,820 credits" (cut to two decimals like every balance). */
export function creditsText(value: string | bigint) {
  return tv(ucr(value) === BigInt(1_000_000) ? "billingCreditOne" : "billingPillCredits", { credits: formatCredits(value) });
}

export function planName(plan: string | null | undefined) {
  return plan && PLAN_KEY[plan] ? t(PLAN_KEY[plan]) : t("limitPlan_managed");
}

const subscribeNever = () => () => undefined;
function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** The Billing and usage link for a workspace, at a tab. */
export function billingHref(withOrg: (href: string) => string, view: BillingView = "overview") {
  return withOrg(`/workspace/settings?tab=billing${view === "overview" ? "" : `&view=${view}`}`);
}

/* ------------------------------------------------------------------ page --- */

export function WorkspaceBilling() {
  const { orgId } = useWorkspace();
  const { summary, loaded, refresh } = useBilling();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const owner = summary?.level === "owner";
  const invoices = useInvoices(orgId, owner);
  const views = useMemo(() => {
    const list: Array<{ value: BillingView; label: string }> = [{ value: "overview", label: t("billingOverview") }];
    if (owner) list.push({ value: "top-up", label: t("billingTopUpTab") });
    list.push({ value: "usage", label: t("billingUsage") });
    if (owner && invoices.available) list.push({ value: "invoices", label: t("billingInvoices") });
    if (owner) list.push({ value: "details", label: t("billingDetailsTitle") }, { value: "limits", label: t("billingLimits") });
    return list;
  }, [owner, invoices.available]);
  const requested = params.get("view") as BillingView | null;
  const view: BillingView = requested && VIEWS.includes(requested) && views.some(item => item.value === requested) ? requested : "overview";
  const select = useCallback((value: BillingView) => {
    const next = new URLSearchParams(params.toString());
    if (value === "overview") next.delete("view"); else next.set("view", value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  if (!loaded) return <Loading>{t("billingLoading")}</Loading>;
  if (!summary) return <EmptyState title={t("billingNotShown")}><p>{t("billingNotShownHelp")}</p></EmptyState>;
  return (
    <div className="p-billing" data-testid="workspace-billing">
      <div className="p-billing-head">
        <Tabs value={view} onChange={select} label={t("billingAndUsage")} options={views} variant="pill" />
        <HelpLink topic="billing" />
        {summary.payments?.mode === "test" && summary.payments.access !== "closed" && <Badge tone="warn" dot>{t("billingTestMode")}</Badge>}
      </div>
      {view === "overview" ? <BillingOverview summary={summary} onSelect={select} />
        : view === "top-up" ? <TopUpPanel summary={summary} onChanged={refresh} />
        : view === "usage" ? <UsagePanel summary={summary} />
        : view === "invoices" ? <InvoicesPanel invoices={invoices} />
        : view === "details" ? <DetailsPanel summary={summary} />
        : <LimitsPanel summary={summary} onSaved={refresh} />}
    </div>
  );
}

/* -------------------------------------------------------------- overview --- */

function alertText(alert: BillingSummary["alerts"][number]): { tone: "warn" | "error" | "info"; text: string } {
  switch (alert.kind) {
    case "frozen": return { tone: "error", text: t("billingFrozen") };
    case "low_balance": return { tone: "warn", text: tv("billingAlertLow", { threshold: formatCredits(String(alert.thresholdUcr)) }) };
    case "cap": return { tone: Number(alert.percent) >= 100 ? "error" : "warn", text: tv("billingAlertCap", { percent: Math.min(Number(alert.percent), 999) }) };
    case "auto_recharge_failing": return { tone: "warn", text: t("billingAlertRechargeFailing") };
    case "auto_recharge_off": return { tone: "warn", text: t("billingAlertRechargeOff") };
    case "expiring": return { tone: "info", text: tv("billingAlertExpiring", { credits: formatCredits(String(alert.ucr)), date: formatDate(String(alert.at)) }) };
    default: return { tone: "info", text: alert.kind };
  }
}

function BillingOverview({ summary, onSelect }: { summary: BillingSummary; onSelect: (view: BillingView) => void }) {
  const owner = summary.level === "owner";
  const contract = summary.billingMode === "contract";
  const cap = summary.caps.monthlyUcr ? ucr(summary.caps.monthlyUcr) : null;
  const committed = ucr(summary.month.committedUcr);
  const canBuy = owner && summary.payments?.access !== "closed";
  const recharge = summary.autoRecharge;
  return (
    <div className="p-stack">
      {summary.alerts.map(alert => {
        const { tone, text } = alertText(alert);
        return <Status key={alert.kind} tone={tone} error={tone === "error"}>{text}</Status>;
      })}
      <StatGrid>
        <Stat hero label={t("billingAvailable")} value={<span data-testid="billing-available">{formatCredits(summary.balance.availableUcr)}</span>}
          meta={tv("billingEuroEquivalent", { euros: formatCreditEuros(summary.balance.availableUcr) })} />
        <Stat label={t("billingHeld")} value={formatCredits(summary.balance.heldUcr)} meta={t("billingHeldMeta")} />
        <Stat label={t("billingUsedThisMonth")} value={<span data-testid="billing-used">{formatCredits(summary.month.usedUcr)}</span>}
          meta={cap ? tv("billingOfCap", { cap: formatCredits(cap) }) : t("billingNoCap")} />
        <Stat label={t("billingPlan")} value={planName(summary.plan)}
          meta={summary.allowance ? tv(summary.allowance.granted ? "billingAllowanceGranted" : "billingAllowancePending", { credits: formatCount(summary.allowance.monthlyCredits) }) : contract ? t("billingContractMeta") : undefined} />
      </StatGrid>
      {cap && (
        <SettingsRow title={t("billingMonthCap")} description={tv("billingMonthCapHelp", { used: formatCredits(committed), cap: formatCredits(cap) })}>
          <Meter value={cap > BigInt(0) ? Number((committed * BigInt(1000)) / cap) / 1000 : null} label={t("billingMonthCap")} tone={committed >= cap ? "fail" : committed * BigInt(100) >= cap * BigInt(80) ? "warn" : "neutral"} />
        </SettingsRow>
      )}
      {summary.nextExpiry && (
        <SettingsRow title={t("billingNextExpiry")} description={tv(summary.nextExpiry.source === "allowance" ? "billingNextExpiryAllowance" : "billingNextExpiryHelp", {
          credits: formatCredits(summary.nextExpiry.ucr), date: formatDate(summary.nextExpiry.at),
        })} />
      )}
      {owner && recharge && (
        <SettingsRow title={t("billingAutoRecharge")} description={recharge.enabled
          ? tv("billingAutoRechargeOnHelp", { threshold: formatCredits(recharge.thresholdUcr), credits: formatCount(recharge.packCredits ?? 0), count: recharge.monthlyMaxCount ?? 0, euros: formatEuroCents(recharge.monthlyMaxCents ?? 0) })
          : t("billingAutoRechargeOffHelp")}>
          <span className="p-row">
            <Badge tone={recharge.enabled ? (recharge.failures ? "warn" : "pass") : "neutral"} dot>{t(recharge.enabled ? "billingOn" : "billingOff")}</Badge>
            {summary.payments?.access !== "closed" && <Action variant="secondary" size="sm" onClick={() => onSelect("top-up")}>{t("billingEditSettings")}</Action>}
          </span>
        </SettingsRow>
      )}
      {contract && <Status tone="info">{t("billingContractNote")}</Status>}
      <p className="p-cell-meta">{t("billingCreditsExplained")}</p>
      <div className="p-toolbar">
        {canBuy && <Action onClick={() => onSelect("top-up")}><CreditCard aria-hidden="true" />{t("billingAddCredits")}</Action>}
        <Action variant="secondary" onClick={() => onSelect("usage")}>{t("billingSeeUsage")}</Action>
        {!owner && <span className="p-cell-meta">{t("billingEditorNote")}</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- top up --- */

function TopUpPanel({ summary, onChanged }: { summary: BillingSummary; onChanged: () => void }) {
  const { orgId } = useWorkspace();
  const open = summary.payments?.access !== "closed";
  const { overview, error, reload } = usePacks(orgId, open);
  if (!open) return <Status tone="info">{t("billingUnavailable")}</Status>;
  if (!overview) return error ? <Status error action={<Action variant="secondary" size="sm" onClick={() => reload()}>{t("retry")}</Action>}>{error}</Status> : <Loading>{t("billingLoading")}</Loading>;
  return (
    <div className="p-stack">
      <p className="p-cell-meta">{t("billingTopUpIntro")}</p>
      {!overview.profile?.taxTreatment && <ProfileSection orgId={orgId} profile={overview.profile} onSaved={reload} />}
      {overview.profile?.taxTreatment && (
        <Section title={t("billingPacksTitle")} actions={overview.firstTopUp ? <Badge tone="pass">{t("billingFirstTopUp")}</Badge> : undefined}>
          <PackPurchase orgId={orgId} overview={overview} returnTo={`/workspace/settings?orgId=${orgId}&tab=billing`} />
        </Section>
      )}
      {overview.profile && <AutoRechargeForm orgId={orgId} overview={overview} summary={summary} onSaved={() => { reload(); onChanged(); }} />}
      {overview.profile && <PaymentMethod orgId={orgId} card={overview.card} />}
    </div>
  );
}

type AutoRechargeView = { enabled: boolean; thresholdCredits: number; pack: string | null; monthlyMaxCount: number; monthlyMaxCents: number; failures: number; disabledReason: string | null };

function AutoRechargeForm({ orgId, overview, summary, onSaved }: { orgId: string; overview: Overview; summary: BillingSummary; onSaved: () => void }) {
  const current = (overview as Overview & { autoRecharge?: AutoRechargeView }).autoRecharge;
  const [enabled, setEnabled] = useState(Boolean(current?.enabled));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = Boolean(overview.card?.last4);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      await evalRequest("/billing/auto-recharge", "PUT", {
        orgId, enabled, thresholdCredits: Number(form.get("threshold")), pack: String(form.get("pack")),
        monthlyMaxCount: Number(form.get("count")), monthlyMaxEuros: Number(form.get("euros")),
      });
      notify(t("billingAutoRechargeSaved"));
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("error")); }
    finally { setBusy(false); }
  }
  return (
    <Section title={t("billingAutoRecharge")} description={t("billingAutoRechargeHelp")}>
      <form className="p-stack" onSubmit={save} aria-label={t("billingAutoRecharge")}>
        {current?.disabledReason === "payment_failed" && <Status tone="warn">{t("billingAlertRechargeOff")}</Status>}
        {!card && <Status tone="info">{t("billingAutoRechargeNeedsCard")}</Status>}
        <label className="p-row">
          <Switch checked={enabled} onChange={event => setEnabled(event.currentTarget.checked)} disabled={!card && !enabled} aria-label={t("billingAutoRechargeSwitch")} />
          <span>{t("billingAutoRechargeSwitch")}</span>
        </label>
        <div className="p-form-grid">
          <Field id="recharge-threshold" name="threshold" type="number" min={100} max={100000} step={1} required label={t("billingRechargeThreshold")}
            defaultValue={current?.thresholdCredits ?? 500} hint={t("billingRechargeThresholdHint")} />
          <SelectField id="recharge-pack" name="pack" label={t("billingRechargePack")} defaultValue={current?.pack ?? "eur_50"}>
            {overview.packs.map(pack => <option key={pack.id} value={pack.id}>{tv("billingRechargePackOption", { net: formatEuroCents(pack.netCents), credits: formatCount(pack.credits + (pack.bonusKind === "pack" ? pack.bonusCredits : 0)) })}</option>)}
          </SelectField>
          <Field id="recharge-count" name="count" type="number" min={1} max={31} required label={t("billingRechargeCount")} defaultValue={current?.monthlyMaxCount ?? 3} />
          <Field id="recharge-euros" name="euros" type="number" min={20} max={10000} required label={t("billingRechargeEuros")} defaultValue={(current?.monthlyMaxCents ?? 30000) / 100} hint={t("billingRechargeEurosHint")} />
        </div>
        {summary.autoRecharge?.failures ? <Status tone="warn">{t("billingAlertRechargeFailing")}</Status> : null}
        {error && <Status error>{error}</Status>}
        <div className="p-toolbar"><Action type="submit" variant="secondary" disabled={busy}>{busy ? t("billingSaving") : t("billingSaveRecharge")}</Action></div>
      </form>
    </Section>
  );
}

/* ----------------------------------------------------------------- usage --- */

type UsageRow = { key: string; runId: string | null; evaluationId: string | null; evaluationTitle: string | null; runStartedAt: string | null; runStatus: string | null; reportId: string | null; netUcr: string; returnedUcr: string; entries: number };
type UsageItem = { kind: "tokens" | "meter"; key: string; netUcr: string; returnedUcr: string; quantity: number; tokens: number; entries: number };
type UsageData = { from: string; to: string; totals: { grossUcr: string; returnedUcr: string; netUcr: string }; days: Array<{ day: string; netUcr: string }>; runs: UsageRow[]; items: UsageItem[] };
type Range = "this_month" | "last_month" | "last_30" | "last_90";

const iso = (date: Date) => date.toISOString().slice(0, 10);
export function rangeDates(range: Range, now = new Date()): { from: string; to: string } {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  if (range === "this_month") return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
  if (range === "last_month") return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
  const days = range === "last_30" ? 29 : 89;
  return { from: iso(new Date(Date.UTC(y, m, d - days))), to: iso(new Date(Date.UTC(y, m, d))) };
}
/** Every UTC day in [from, to], with the usage of the days that had any. */
function allDays(from: string, to: string, days: UsageData["days"]) {
  const values = new Map(days.map(item => [item.day, Number(ucr(item.netUcr)) / 1_000_000]));
  const out: Array<{ day: string; value: number }> = [];
  for (let at = new Date(`${from}T00:00:00Z`); iso(at) <= to && out.length < 400; at = new Date(at.getTime() + 86_400_000)) out.push({ day: iso(at), value: values.get(iso(at)) ?? 0 });
  return out;
}
const METER_KEY: Record<string, MessageKey> = {
  website_question: "billingMeter_website_question", api_question: "billingMeter_api_question", graded_answer: "billingMeter_graded_answer",
  web_page_read: "billingMeter_web_page_read", document_page: "billingMeter_document_page", web_search_query: "billingMeter_web_search_query",
};
const dayFormat = (day: string) => new Intl.DateTimeFormat(getLocale() === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

function UsagePanel({ summary }: { summary: BillingSummary }) {
  const { orgId, withOrg } = useWorkspace();
  const [range, setRange] = useState<Range>("this_month");
  const [loaded, setLoaded] = useState<{ key: string; data: UsageData | null; error: string | null } | null>(null);
  const [version, setVersion] = useState(0);
  const { from, to } = rangeDates(range);
  const key = `${orgId}:${from}:${to}:${version}`;
  useEffect(() => {
    let live = true;
    evalRequest<UsageData>(`/billing/usage?orgId=${encodeURIComponent(orgId)}&from=${from}&to=${to}`).then(
      value => { if (live) setLoaded({ key, data: value, error: null }); },
      caught => { if (live) setLoaded({ key, data: null, error: caught instanceof Error ? caught.message : t("error") }); },
    );
    return () => { live = false; };
  }, [orgId, from, to, key]);
  // A result for another period is not shown while the new one loads.
  const data = loaded?.key === key ? loaded.data : null;
  const error = loaded?.key === key ? loaded.error : null;
  const csv = `/api/evals/v1/billing/usage?orgId=${encodeURIComponent(orgId)}&from=${from}&to=${to}&format=csv`;
  return (
    <div className="p-stack">
      <div className="p-toolbar">
        <SelectField id="usage-range" label={t("billingRange")} value={range} onChange={event => setRange(event.currentTarget.value as Range)}>
          <option value="this_month">{t("billingRangeThisMonth")}</option>
          <option value="last_month">{t("billingRangeLastMonth")}</option>
          <option value="last_30">{t("billingRangeLast30")}</option>
          <option value="last_90">{t("billingRangeLast90")}</option>
        </SelectField>
        <ActionAnchor variant="secondary" href={csv} download><Download aria-hidden="true" />{t("billingExportCsv")}</ActionAnchor>
      </div>
      {error ? <Status error action={<Action size="sm" variant="secondary" onClick={() => setVersion(value => value + 1)}>{t("retry")}</Action>}>{error}</Status>
        : !data ? <Loading>{t("billingLoading")}</Loading> : (
        <>
          <StatGrid>
            <Stat label={t("billingUsedInRange")} value={<span data-testid="usage-total">{formatCredits(data.totals.netUcr)}</span>} meta={tv("billingEuroEquivalent", { euros: formatCreditEuros(data.totals.netUcr) })} />
            <Stat label={t("billingReturned")} value={formatCredits(data.totals.returnedUcr)} meta={t("billingRefundedMeta")} />
          </StatGrid>
          <Section title={t("billingByDay")}>
            <DayBars days={allDays(from, to, data.days)} label={t("billingByDay")} tableLabel={t("billingDayTable")} dayHeader={t("billingDay")} valueLabel={t("billingCredits")}
              format={value => formatCredits(BigInt(Math.round(value * 1_000_000)))} dayLabel={dayFormat} />
          </Section>
          <Section title={t("billingByRun")} description={t("billingByRunHelp")}>
            {data.runs.length ? (
              <DataTable caption={t("billingByRun")} headers={[t("evaluation"), t("billingRunStarted"), t("billingReturned"), { label: t("billingCredits"), align: "end" }]}>
                {data.runs.map(row => (
                  <tr key={row.key}>
                    <RowTitle href={row.reportId ? withOrg(`/workspace/reports/${row.reportId}`) : row.evaluationId ? withOrg(`/workspace/evaluations/${row.evaluationId}`) : undefined}
                      meta={row.runId ? (row.reportId ? t("billingOpenReport") : t("billingOpenRun")) : t("billingPreparation")}>
                      {row.evaluationTitle ?? (row.runId ? t("billingDeletedEvaluation") : t("billingSources"))}
                    </RowTitle>
                    <td>{row.runStartedAt ? <Time value={row.runStartedAt} withTime={false} /> : "—"}</td>
                    <td>{ucr(row.returnedUcr) > BigInt(0) ? formatCredits(row.returnedUcr) : "—"}</td>
                    <td className="p-table-action">{formatCredits(row.netUcr)}</td>
                  </tr>
                ))}
              </DataTable>
            ) : <p className="p-cell-meta">{t("billingNoUsage")}</p>}
          </Section>
          <Section title={t("billingByModel")}>
            {data.items.length ? (
              <DataTable caption={t("billingByModel")} headers={[t("billingItem"), t("billingQuantity"), { label: t("billingCredits"), align: "end" }]}>
                {data.items.map(item => (
                  <tr key={`${item.kind}:${item.key}`}>
                    <RowTitle meta={item.kind === "tokens" ? t("billingEngineTokens") : t("billingPlatformMeter")}>{item.kind === "meter" && METER_KEY[item.key] ? t(METER_KEY[item.key]) : item.key}</RowTitle>
                    <td>{item.kind === "tokens" ? tv("billingTokens", { n: formatCount(item.tokens) }) : formatCount(item.quantity)}</td>
                    <td className="p-table-action">{formatCredits(item.netUcr)}</td>
                  </tr>
                ))}
              </DataTable>
            ) : <p className="p-cell-meta">{t("billingNoUsage")}</p>}
          </Section>
          <p className="p-cell-meta">{t("billingUsageNote")}</p>
        </>
      )}
      {summary.level === "owner" && <ActivityLog orgId={orgId} />}
    </div>
  );
}

type LedgerEntryView = { id: string; createdAt: string; type: string; amountUcr: string; availableAfterUcr: string; heldAfterUcr: string; runId: string | null; meter: string | null };
const ENTRY_KEY: Record<string, MessageKey> = {
  purchase: "billingEntry_purchase", grant: "billingEntry_grant", allowance: "billingEntry_allowance", bonus: "billingEntry_bonus", hold: "billingEntry_hold",
  release: "billingEntry_release", capture: "billingEntry_capture", action: "billingEntry_action", refund: "billingEntry_refund", adjustment: "billingEntry_adjustment",
  expiry: "billingEntry_expiry", chargeback: "billingEntry_chargeback", reversal: "billingEntry_reversal",
};

function ActivityLog({ orgId }: { orgId: string }) {
  const [entries, setEntries] = useState<LedgerEntryView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [version, setVersion] = useState(0);
  const fetchPage = useCallback((before: string | null) =>
    evalRequest<{ entries: LedgerEntryView[]; nextCursor: string | null }>(`/billing/ledger?orgId=${encodeURIComponent(orgId)}&limit=25${before ? `&cursor=${before}` : ""}`), [orgId]);
  useEffect(() => {
    let live = true;
    fetchPage(null).then(page => {
      if (!live) return;
      setEntries(page.entries); setCursor(page.nextCursor); setState("idle");
    }, () => { if (live) setState("error"); });
    return () => { live = false; };
  }, [fetchPage, version]);
  async function more(before: string) {
    setState("loading");
    try {
      const page = await fetchPage(before);
      setEntries(current => [...current, ...page.entries]); setCursor(page.nextCursor); setState("idle");
    } catch { setState("error"); }
  }
  const load = (before: string | null) => { if (before) void more(before); else { setState("loading"); setVersion(value => value + 1); } };
  return (
    <Section title={t("billingActivity")} description={t("billingActivityHelp")}>
      {entries.length ? (
        <DataTable caption={t("billingActivity")} headers={[t("billingEntryType"), t("billingDate"), t("billingChange"), { label: t("billingBalanceAfter"), align: "end" }]}>
          {entries.map(entry => {
            const amount = ucr(entry.amountUcr);
            return (
              <tr key={entry.id}>
                <RowTitle meta={entry.meter && METER_KEY[entry.meter] ? t(METER_KEY[entry.meter]) : undefined}>{ENTRY_KEY[entry.type] ? t(ENTRY_KEY[entry.type]) : entry.type}</RowTitle>
                <td><Time value={entry.createdAt} /></td>
                <td>{amount > BigInt(0) ? `+${formatCredits(amount)}` : amount < BigInt(0) ? formatCredits(amount) : "0"}</td>
                <td className="p-table-action">{formatCredits(entry.availableAfterUcr)}</td>
              </tr>
            );
          })}
        </DataTable>
      ) : state === "idle" ? <p className="p-cell-meta">{t("billingNoActivity")}</p> : null}
      {state === "loading" && <Loading>{t("billingLoading")}</Loading>}
      {state === "error" && <Status error action={<Action size="sm" variant="secondary" onClick={() => load(null)}>{t("retry")}</Action>}>{t("error")}</Status>}
      {cursor && state === "idle" && <div className="p-toolbar"><Action variant="secondary" size="sm" onClick={() => load(cursor)}>{t("billingLoadMore")}</Action></div>}
    </Section>
  );
}

/* -------------------------------------------------------------- invoices --- */

type InvoiceView = {
  id: string; kind: "invoice" | "credit_note" | string; status: "issued" | "pending"; number: string | null; issueDate: string | null; operationDate: string;
  grossCents: number; netCents: number; vatCents: number; taxMention: string | null; pdfAvailable: boolean; rectifiesNumber: string | null; livemode: boolean;
};

/** The owner's invoices (L-13): available when GET /billing/invoices answers; hidden otherwise (invoicing off, or not an owner). */
function useInvoices(orgId: string, owner: boolean) {
  const [state, setState] = useState<{ orgId: string; invoices: InvoiceView[] | null }>({ orgId: "", invoices: null });
  useEffect(() => {
    if (!owner || !orgId) return;
    let live = true;
    evalRequest<{ invoices: InvoiceView[] }>(`/billing/invoices?orgId=${encodeURIComponent(orgId)}`).then(
      value => { if (live) setState({ orgId, invoices: Array.isArray(value?.invoices) ? value.invoices : null }); },
      () => { if (live) setState({ orgId, invoices: null }); },
    );
    return () => { live = false; };
  }, [orgId, owner]);
  const invoices = state.orgId === orgId ? state.invoices : null;
  return { available: owner && invoices !== null, invoices: invoices ?? [] };
}

function InvoicesPanel({ invoices }: { invoices: { invoices: InvoiceView[] } }) {
  const { orgId } = useWorkspace();
  if (!invoices.invoices.length) return <EmptyState title={t("billingNoInvoices")}><p>{t("billingNoInvoicesHelp")}</p></EmptyState>;
  return (
    <DataTable caption={t("billingInvoices")} headers={[t("billingInvoiceNumber"), t("billingDate"), t("billingInvoiceTotal"), { label: t("billingInvoicePdf"), align: "end" }]}>
      {invoices.invoices.map(invoice => (
        <tr key={invoice.id}>
          <RowTitle meta={invoice.kind === "invoice" ? t("billingInvoiceKind") : tv("billingCreditNoteKind", { number: invoice.rectifiesNumber ?? "—" })}>
            {invoice.number ?? t("billingInvoicePending")}
          </RowTitle>
          <td>{invoice.issueDate ? formatDate(invoice.issueDate) : formatDate(invoice.operationDate)}</td>
          <td>{formatEuroCents(invoice.grossCents)}{invoice.taxMention ? <span className="p-cell-meta"> · {invoice.taxMention}</span> : null}</td>
          <td className="p-table-action">{invoice.pdfAvailable
            ? <ActionAnchor size="sm" variant="secondary" href={`/api/evals/v1/billing/invoices/${invoice.id}/pdf?orgId=${encodeURIComponent(orgId)}`}><Download aria-hidden="true" />PDF</ActionAnchor>
            : <span className="p-cell-meta">{t("billingInvoicePending")}</span>}</td>
        </tr>
      ))}
    </DataTable>
  );
}

/* --------------------------------------------------------------- details --- */

function DetailsPanel({ summary }: { summary: BillingSummary }) {
  const { orgId } = useWorkspace();
  const open = summary.payments?.access !== "closed";
  const { overview, error, reload } = usePacks(orgId, open);
  if (!open) return <Status tone="info">{t("billingUnavailable")}</Status>;
  if (!overview) return error ? <Status error action={<Action variant="secondary" size="sm" onClick={() => reload()}>{t("retry")}</Action>}>{error}</Status> : <Loading>{t("billingLoading")}</Loading>;
  return (
    <div className="p-stack">
      <ProfileSection orgId={orgId} profile={overview.profile} onSaved={reload} />
      <PaymentMethod orgId={orgId} card={overview.card} />
    </div>
  );
}

/* ---------------------------------------------------------------- limits --- */

type CapsView = {
  monthlyUcr: string | null; perRunUcr: string | null; perRunMultiplier: number; recipients: string[] | null; updatedAt: string | null;
  /** The threshold in use, the owner's own (null: the default rule) and the default (§6.10, migration 112). */
  lowBalanceThresholdUcr: string; lowBalanceCustomUcr?: string | null; lowBalanceDefaultUcr?: string;
};

function LimitsPanel({ summary, onSaved }: { summary: BillingSummary; onSaved: () => void }) {
  const { orgId, withOrg } = useWorkspace();
  const [caps, setCaps] = useState<CapsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [monthly, setMonthly] = useState<"none" | "cap">("none");
  const [perRun, setPerRun] = useState<"multiplier" | "fixed">("multiplier");
  const [lowBalance, setLowBalance] = useState<"default" | "custom">("default");
  const key = useRef(newKey());
  useEffect(() => {
    let live = true;
    evalRequest<CapsView>(`/billing/caps?orgId=${encodeURIComponent(orgId)}`).then(value => {
      if (!live) return;
      setCaps(value); setMonthly(value.monthlyUcr ? "cap" : "none"); setPerRun(value.perRunUcr ? "fixed" : "multiplier");
      setLowBalance(value.lowBalanceCustomUcr ? "custom" : "default");
    }, caught => { if (live) setError(caught instanceof Error ? caught.message : t("error")); });
    return () => { live = false; };
  }, [orgId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const saved = await evalRequest<CapsView>("/billing/caps", "PUT", {
        orgId,
        monthlyCapCredits: monthly === "cap" ? Number(form.get("monthlyCap")) : null,
        perRun: perRun === "fixed" ? { mode: "fixed", credits: Number(form.get("runCap")) } : { mode: "multiplier", multiplier: Number(form.get("multiplier")) },
        lowBalanceThresholdCredits: lowBalance === "custom" ? Number(form.get("lowBalance")) : null,
      }, key.current);
      key.current = newKey();
      setCaps(current => current ? { ...current, ...saved } : current);
      notify(t("billingLimitsSaved"));
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("error")); }
    finally { setBusy(false); }
  }
  if (!caps) return error ? <Status error>{error}</Status> : <Loading>{t("billingLoading")}</Loading>;
  const enforced = summary.gate === "enforced";
  return (
    <form className="p-settings" onSubmit={save} aria-label={t("billingLimits")}>
      {!enforced && summary.billingMode !== "contract" && <Status tone="info">{t("billingLimitsNotEnforced")}</Status>}
      <SettingsRow title={t("billingMonthCap")} description={t("billingMonthCapSetHelp")}>
        <span className="p-stack p-stack-tight">
          <SelectField id="cap-monthly-mode" label={t("billingMonthCap")} value={monthly} onChange={event => setMonthly(event.currentTarget.value as "none" | "cap")}>
            <option value="none">{t("billingNoMonthCap")}</option>
            <option value="cap">{t("billingSetMonthCap")}</option>
          </SelectField>
          {monthly === "cap" && <Field id="cap-monthly" name="monthlyCap" type="number" min={100} max={10000000} required label={t("billingMonthCapCredits")}
            defaultValue={caps.monthlyUcr ? creditsUp(caps.monthlyUcr) : 5000} hint={tv("billingUsedSoFar", { used: formatCredits(summary.month.committedUcr) })} />}
        </span>
      </SettingsRow>
      <SettingsRow title={t("billingRunCap")} description={t("billingRunCapHelp")}>
        <span className="p-stack p-stack-tight">
          <SelectField id="cap-run-mode" label={t("billingRunCap")} value={perRun} onChange={event => setPerRun(event.currentTarget.value as "multiplier" | "fixed")}>
            <option value="multiplier">{t("billingRunCapMultiple")}</option>
            <option value="fixed">{t("billingRunCapFixed")}</option>
          </SelectField>
          {perRun === "multiplier"
            ? <SelectField id="cap-multiplier" name="multiplier" label={t("billingRunCapTimes")} defaultValue={String(caps.perRunMultiplier)}>
                {[1, 1.5, 2, 3, 5, 10].map(value => <option key={value} value={value}>{tv("billingTimesEstimate", { n: value.toLocaleString(getLocale() === "es" ? "es-ES" : "en-GB") })}</option>)}
              </SelectField>
            : <Field id="cap-run" name="runCap" type="number" min={10} max={1000000} required label={t("billingRunCapCredits")} defaultValue={caps.perRunUcr ? creditsUp(caps.perRunUcr) : 1000} />}
        </span>
      </SettingsRow>
      <SettingsRow title={t("billingLowBalance")} description={t("billingLowBalanceSetHelp")}>
        <span className="p-stack p-stack-tight">
          <SelectField id="low-balance-mode" label={t("billingLowBalance")} value={lowBalance} onChange={event => setLowBalance(event.currentTarget.value as "default" | "custom")}>
            <option value="default">{tv("billingLowBalanceDefault", { threshold: formatCredits(caps.lowBalanceDefaultUcr ?? caps.lowBalanceThresholdUcr) })}</option>
            <option value="custom">{t("billingLowBalanceCustom")}</option>
          </SelectField>
          {lowBalance === "custom"
            ? <Field id="low-balance" name="lowBalance" type="number" min={1} max={10000000} required label={t("billingLowBalanceCredits")}
                defaultValue={creditsUp(caps.lowBalanceCustomUcr ?? caps.lowBalanceThresholdUcr)} />
            : <span className="p-field-hint">{t("billingLowBalanceDefaultHint")}</span>}
        </span>
      </SettingsRow>
      <SettingsRow title={t("billingRecipients")} description={<>{t("billingRecipientsHelp")} <Link className="p-link" href={withOrg("/workspace/settings?tab=notifications")}>{t("notifications")}</Link>.</>}>
        {caps.recipients?.length ? <ul className="p-plain-list">{caps.recipients.map(email => <li key={email}>{email}</li>)}</ul> : <span className="p-cell-meta">{t("billingNoRecipients")}</span>}
      </SettingsRow>
      {error && <Status error>{error}</Status>}
      <div className="p-settings-actions"><Action type="submit" disabled={busy}>{busy ? t("billingSaving") : t("billingSaveLimits")}</Action></div>
    </form>
  );
}

/* ------------------------------------------------- shell and Home pieces --- */

/**
 * The plan and the credit balance in a line (P-13), for the sidebar pill and
 * Home. Nothing where billing does not show.
 */
export function BillingPill({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { summary } = useBilling();
  const { withOrg } = useWorkspace();
  const pathname = usePathname();
  const params = useSearchParams();
  if (!summary) return null;
  const contract = summary.billingMode === "contract";
  const label = contract ? planName(summary.plan) : `${planName(summary.plan)} · ${creditsText(summary.balance.availableUcr)}`;
  const current = pathname.startsWith("/workspace/settings") && params.get("tab") === "billing";
  return (
    <Link href={billingHref(withOrg)} className="p-nav-item p-billing-pill" data-tone={summary.frozen || summary.lowBalance.below ? "warn" : undefined}
      aria-current={current ? "page" : undefined} title={collapsed ? label : undefined} onClick={onNavigate} data-testid="billing-pill">
      <CreditCard />
      <span className="p-nav-label-text">
        <span className="sr-only">{t("billingAndUsage")}: </span>
        {label}
      </span>
    </Link>
  );
}

/** Plan and balance for a card (Home, Settings → General). */
export function PlanBalance({ compact = false }: { compact?: boolean }) {
  const { summary } = useBilling();
  const { withOrg } = useWorkspace();
  if (!summary) return null;
  return (
    <span className="p-plan-balance" data-compact={compact ? "true" : undefined}>
      {summary.billingMode !== "contract" && <><strong>{formatCredits(summary.balance.availableUcr)}</strong> <span className="p-cell-meta">{t("billingCreditsAvailable")}</span></>}
      <Link className="p-link" href={billingHref(withOrg)}>{t("billingOpen")}</Link>
    </span>
  );
}

/** The low-balance banner (§6.12): below the threshold, on every page but Billing itself; dismissible for the session. */
export function LowBalanceBanner() {
  const { summary } = useBilling();
  const { withOrg, orgId } = useWorkspace();
  const pathname = usePathname();
  const params = useSearchParams();
  const storageKey = `caudals.lowbalance.${orgId}`;
  // Session storage is device state, absent on the server: read it as an external store.
  const stored = useSyncExternalStore(subscribeNever, () => { try { return window.sessionStorage.getItem(storageKey); } catch { return null; } }, () => null);
  const [dismissed, setDismissed] = useState<{ key: string; at: string } | null>(null);
  const hidden = dismissed?.key === storageKey ? dismissed.at : stored;
  if (!summary?.lowBalance.below || summary.billingMode === "contract") return null;
  if (pathname.startsWith("/workspace/settings") && params.get("tab") === "billing") return null;
  // Dismissed at this balance or a higher one: show again when it drops further.
  if (hidden !== null && ucr(summary.balance.availableUcr) >= ucr(hidden)) return null;
  const owner = summary.level === "owner" && summary.payments?.access !== "closed";
  function dismiss() {
    try { window.sessionStorage.setItem(storageKey, summary!.balance.availableUcr); } catch { /* best effort */ }
    setDismissed({ key: storageKey, at: summary!.balance.availableUcr });
  }
  return (
    <div className="p-billing-banner" data-testid="low-balance-banner">
      <Status tone="warn" action={
        <span className="p-row">
          {owner ? <ActionLink size="sm" href={billingHref(withOrg, "top-up")}>{t("billingAddCredits")}</ActionLink> : null}
          <Action size="sm" variant="ghost" onClick={dismiss}>{t("dismiss")}</Action>
        </span>
      }>
        {tv(owner ? "billingLowBanner" : "billingLowBannerEditor", { credits: creditsText(summary.balance.availableUcr) })}
      </Status>
    </div>
  );
}

/** Settings → General: "Plan and limits" replaces the machine-spend row (P-13); machine spend stays in ops. */
export function PlanAndLimits({ entitlement, systems }: {
  entitlement: { plan?: string | null; max_systems?: number | null; max_tests_per_set?: number | null; max_runs_per_month?: number | null; max_active_runs: number; max_members?: number | null };
  systems: number;
}): ReactNode {
  const items: string[] = [];
  const limit = (value: number | null | undefined, key: MessageKey, unlimited: MessageKey) => items.push(value === null || value === undefined ? t(unlimited) : tv(key, { n: formatCount(value) }));
  limit(entitlement.max_systems, "planLimitSystems", "planLimitSystemsAny");
  limit(entitlement.max_tests_per_set, "planLimitQuestions", "planLimitQuestionsAny");
  limit(entitlement.max_runs_per_month, "planLimitRuns", "planLimitRunsAny");
  items.push(tv("planLimitActive", { n: formatCount(entitlement.max_active_runs) }));
  if (entitlement.max_members !== null && entitlement.max_members !== undefined) items.push(tv("planLimitMembers", { n: formatCount(entitlement.max_members) }));
  return (
    <span className="p-stack p-stack-tight">
      <span className="p-row"><Badge tone="strong">{planName(entitlement.plan)}</Badge>{entitlement.max_systems ? <span className="p-cell-meta">{tv("planSystemsUsed", { used: systems, limit: entitlement.max_systems })}</span> : null}</span>
      <ul className="p-plain-list" aria-label={t("planAndLimits")}>{items.map(item => <li key={item}>{item}</li>)}</ul>
      <PlanBalance compact />
    </span>
  );
}

/** Keeps the run estimate's error codes readable (402 credits, 409 caps). */
export function isCreditError(error: unknown): error is EvalRequestError {
  return error instanceof EvalRequestError && (error.code === "CREDITS_EXHAUSTED" || error.code === "CAP_REACHED");
}
