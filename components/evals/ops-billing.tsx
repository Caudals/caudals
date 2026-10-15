"use client";

/**
 * Ops billing console (launch spec v2 §6.13, §6.15; L-16), under
 * /ops/platform/billing for platform admins: account search and view with
 * grant, adjust, refund, extend and freeze actions, two-person approvals,
 * per-workspace overrides (L-14), the price book with increase notices,
 * the daily reconciliation, manual invoices (L-13), the monthly export, the
 * fraud queue and manual tax reviews (G2). Every change needs a recent sign-in and a reason and is
 * audited on the server; above 10,000 credits (€100) a second admin approves.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ShieldCheck, Snowflake } from "lucide-react";
import { evalRequest } from "./api";
import {
  Action, Badge, Check, DataTable, EmptyState, Field, FilterChips, RowTitle, SearchInput, SectionHeading, SelectField, Stat, StatGrid, Status,
  StatusBadge, TabLinks, TableSkeleton, Time, Toolbar, formatDate, humanize,
} from "./primitives";
import { ActionMenu, Modal } from "./overlays";
import { FraudQueue, MonthlyExport, ManualInvoices, PriceBook, Reconciliation } from "./ops-billing-reports";
import { TaxReviews } from "./ops-billing-tax";
import { credits, euros, newKey, outcomeMessage, planLabel, short, useOpsAction, type Outcome } from "./ops-billing-shared";
import { BILLING_VIEWS, type BillingView } from "./ops-billing-views";
import { t, tv } from "@/lib/evals/messages/runtime";

/** Plan and billing mode, once when they say the same ("Free", not "Free · Free" or "Gratis · Gratuito"). */
export const modeLabel = (plan: string | null, mode: string) => (plan === mode ? planLabel(plan) : [...new Set([planLabel(plan), humanize(mode)])].join(" · "));
/** Credit enforcement for a workspace override. */
const enforcementLabel = (value: string) => (value === "inherit" ? t("billingOpsInherit") : humanize(value));
/** System-written ledger reasons in the interface language; an operator's own reason is shown as written. */
const ledgerReason = (reason: string) => {
  const allowance = reason.match(/^Monthly allowance (\d{4}-\d{2})$/);
  return allowance ? tv("billingOpsAllowanceReason", { month: allowance[1] }) : reason;
};

export type { BillingView } from "./ops-billing-views";

export function OpsBilling({ view, admin, userId, initialOrgId }: { view: BillingView; admin: boolean; userId: string; initialOrgId?: string | null }) {
  if (!admin) return <Status>{t("billingOpsAdminOnly")}</Status>;
  return (
    <>
      <div className="p-section-tight">
        <TabLinks label={t("billingOpsSections")} current={view} variant="pill"
          options={BILLING_VIEWS.map(item => ({ id: item.id, href: `/ops/platform/billing?view=${item.id}`, label: t(item.label) }))} />
      </div>
      {view === "accounts" ? <Accounts userId={userId} initialOrgId={initialOrgId ?? null} />
        : view === "approvals" ? <Approvals userId={userId} />
          : view === "price-book" ? <PriceBook />
            : view === "reconciliation" ? <Reconciliation />
              : view === "invoices" ? <ManualInvoices />
                : view === "export" ? <MonthlyExport />
                  : view === "fraud" ? <FraudQueue />
                    : view === "tax-review" ? <TaxReviews />
                      : <Overrides />}
    </>
  );
}

/* ------------------------------------------------------------- accounts --- */

type AccountRow = { orgId: string; workspace: string; plan: string | null; billingMode: string; available: string; held: string; frozenReason: string | null; ownerDomain: string | null; lastEntryAt: string | null };

function Accounts({ userId, initialOrgId }: { userId: string; initialOrgId: string | null }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(initialOrgId);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void evalRequest<{ accounts: AccountRow[] }>(`/billing/admin/accounts?q=${encodeURIComponent(query.trim())}`)
        .then(data => { setRows(data.accounts); setError(""); })
        .catch(reason => setError(reason instanceof Error ? reason.message : t("error")));
    }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query]);
  if (selected) return <AccountDetail orgId={selected} userId={userId} onBack={() => setSelected(null)} />;
  return (
    <section>
      <SectionHeading title={t("billingOpsAccounts")}>{t("billingOpsAccountsHelp")}</SectionHeading>
      <Toolbar><SearchInput value={query} onChange={setQuery} label={t("billingOpsSearchAccounts")} /></Toolbar>
      {error && <Status error>{error}</Status>}
      {!rows ? <TableSkeleton columns={4} /> : !rows.length ? <EmptyState compact title={t("billingOpsNoAccounts")} /> : (
        <DataTable caption={t("billingOpsAccounts")} headers={[t("workspace"), t("billingOpsMode"), { label: t("billingOpsAvailable"), align: "end" }, { label: t("billingOpsHeld"), align: "end" }, { label: t("billingOpsLastEntry"), align: "end" }]}>
          {rows.map(row => (
            <tr key={row.orgId}>
              <RowTitle meta={[row.ownerDomain, short(row.orgId)].filter(Boolean).join(" · ")}>
                <button type="button" className="p-link-button" onClick={() => setSelected(row.orgId)}>{row.workspace}</button>
                {row.frozenReason && <> <Badge tone="warn" dot>{t("billingOpsFrozen")}</Badge></>}
              </RowTitle>
              <td className="p-cell-meta">{modeLabel(row.plan, row.billingMode)}</td>
              <td className="p-num">{credits(row.available)}</td>
              <td className="p-num">{credits(row.held)}</td>
              <td className="p-table-action p-cell-meta"><Time value={row.lastEntryAt} /></td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}

type Ledger = { id: string; type: string; credits: string; availableAfter: string; heldAfter: string; reason: string | null; actorId: string; actorKind: string; meter: string | null; runId: string | null; refKind: string | null; refId: string | null; reversed: boolean; reversesEntryId: string | null; createdAt: string };
type Lot = { id: string; source: string; granted: string; remaining: string; held: string; expired: string; expiresAt: string | null; orderId: string | null; campaign: string | null; createdAt: string; extendable: boolean };
type Hold = { id: string; key: string; amount: string; captured: string; state: string; runId: string | null; expiresAt: string; createdAt: string };
type Order = { id: string; status: string; pack: string; netCents: number; grossCents: number; credits: number; bonusCredits: number; paidAt: string | null; refundedAt: string | null; livemode: boolean; riskFlags: string[]; refundable: boolean; needsSecondApprover: boolean; createdAt: string };
type Document = { id: string; kind: string; status: string; number: string | null; grossCents: number; orderId: string | null; livemode: boolean; pdfAttached: boolean; createdAt: string };
export type Approval = { id: string; orgId: string; workspace: string | null; action: string; credits: string; netCents: number | null; payload: Record<string, unknown>; payloadSha256: string; reason: string; requestedBy: string; requestedAt: string; expiresAt: string; status: string; approvedBy: string | null; decidedBy: string | null; decisionReason: string | null; executedAt: string | null };
export type Override = { enforcement: string; livePayments: boolean; plansV2: boolean; reason: string; version: number; updatedAt: string | null };
type AccountData = {
  account: { orgId: string; workspace: string | null; plan: string | null; billingMode: string; available: string; held: string; frozenReason: string | null; issues: string[] };
  lots: Lot[]; holds: Hold[]; ledger: Ledger[]; nextBefore: string | null; orders: Order[]; documents: Document[];
  alerts: Array<{ kind: string; period: string; attempts: number; sentAt: string | null; createdAt: string }>;
  approvals: Approval[]; override: Override | null; thresholdCredits: string;
};
type Dialog = null | { kind: "grant" } | { kind: "adjust" } | { kind: "freeze" } | { kind: "override" } | { kind: "extend"; lot: Lot }
  | { kind: "reverse"; entry: Ledger } | { kind: "run"; runId: string } | { kind: "refund"; order: Order };

const REVERSIBLE = new Set(["grant", "allowance", "adjustment", "action", "capture", "refund"]);

function AccountDetail({ orgId, userId, onBack }: { orgId: string; userId: string; onBack: () => void }) {
  const [data, setData] = useState<AccountData | null>(null);
  const [older, setOlder] = useState<Ledger[]>([]);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  // The amount typed in Grant or Adjust, restated on the confirm button (launch R4).
  const [amount, setAmount] = useState("");
  const { run, pending, messages, clear } = useOpsAction();
  const load = useCallback(async () => {
    try {
      setData(await evalRequest<AccountData>(`/billing/admin/accounts/${orgId}`));
      setOlder([]);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("error")); }
  }, [orgId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (error) return <><Action variant="ghost" onClick={onBack}>{t("billingOpsBackToAccounts")}</Action><Status error>{error}</Status></>;
  if (!data) return <TableSkeleton columns={4} />;
  const close = () => { setDialog(null); setAmount(""); clear(); };
  const submit = (path: string, body: Record<string, unknown>, done: string) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = newKey();
    const ok = await run(async () => outcomeMessage(await evalRequest<Outcome>(path, "POST", { orgId, ...body }, key), done));
    if (ok) { close(); await load(); }
  };
  const form = (event: FormEvent<HTMLFormElement>) => new FormData(event.currentTarget);
  const dateValue = (value: FormDataEntryValue | null) => (value ? new Date(`${String(value)}T23:59:59Z`).toISOString() : undefined);
  const a = data.account;
  const ledger = [...data.ledger, ...older];
  const nextBefore = older.length ? null : data.nextBefore;

  return (
    <>
      <div className="p-row p-section-tight">
        <Action variant="ghost" onClick={onBack}><ChevronLeft aria-hidden="true" />{t("billingOpsBackToAccounts")}</Action>
      </div>
      <SectionHeading title={a.workspace ?? short(a.orgId)} actions={
        <span className="p-row">
          <Action variant="secondary" onClick={() => setDialog({ kind: "grant" })}>{t("billingOpsGrant")}</Action>
          <Action variant="secondary" onClick={() => setDialog({ kind: "adjust" })}>{t("billingOpsAdjust")}</Action>
          <ActionMenu label={t("billingOpsMoreActions")} items={[
            { label: a.frozenReason ? t("billingOpsUnfreeze") : t("billingOpsFreeze"), icon: <Snowflake />, tone: a.frozenReason ? undefined : "danger", onSelect: () => setDialog({ kind: "freeze" }) },
            { label: t("billingOpsEditOverride"), icon: <ShieldCheck />, onSelect: () => setDialog({ kind: "override" }) },
          ]} />
        </span>
      }>
        {modeLabel(a.plan, a.billingMode)} · <code className="p-code">{a.orgId}</code>
      </SectionHeading>
      {dialog === null && messages}
      {a.frozenReason && <Status tone="warn">{tv("billingOpsFrozenBecause", { reason: a.frozenReason })}</Status>}
      {a.issues.length > 0 && <Status error>{tv("billingOpsInvariantIssues", { issues: a.issues.map(humanize).join(", ") })}</Status>}
      <StatGrid>
        <Stat label={t("billingOpsAvailable")} value={credits(a.available)} meta={euros(Math.ceil(Number(a.available)))} />
        <Stat label={t("billingOpsHeld")} value={credits(a.held)} meta={tv("billingOpsOpenHolds", { count: data.holds.filter(hold => hold.state === "held").length })} />
        <Stat label={t("billingOpsInvariants")} value={<Badge tone={a.issues.length ? "fail" : "pass"} dot>{a.issues.length ? t("billingOpsDrift") : t("billingOpsConsistent")}</Badge>} meta={t("billingOpsInvariantsHelp")} />
        <Stat label={t("billingOpsOverride")} value={data.override ? enforcementLabel(data.override.enforcement) : t("billingOpsInherit")}
          meta={data.override ? [data.override.livePayments && t("billingOpsLivePayments"), data.override.plansV2 && t("billingOpsPlansV2")].filter(Boolean).join(" · ") || "—" : "—"} />
      </StatGrid>

      {data.approvals.some(item => item.status === "pending" || item.status === "approved") && (
        <section className="p-section">
          <SectionHeading title={t("billingOpsPendingApprovals")}>{tv("billingOpsTwoPersonHelp", { credits: credits(data.thresholdCredits) })}</SectionHeading>
          <ApprovalTable rows={data.approvals.filter(item => item.status === "pending" || item.status === "approved")} userId={userId} onChanged={load} />
        </section>
      )}

      <section className="p-section">
        <SectionHeading title={t("billingOpsLedger")}>{t("billingOpsLedgerHelp")}</SectionHeading>
        {!ledger.length ? <EmptyState compact title={t("billingOpsNoEntries")} /> : (
          <DataTable caption={t("billingOpsLedger")} headers={[t("billingOpsEntry"), { label: t("billingOpsCredits"), align: "end" }, { label: t("billingOpsAvailableAfter"), align: "end" }, t("billingOpsActorReason"), { label: t("createdAt"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
            {ledger.map(entry => {
              const items = [
                ...(REVERSIBLE.has(entry.type) && !entry.reversed && Number(entry.credits) !== 0 && !(entry.type === "refund" && Number(entry.credits) < 0)
                  ? [{ label: t("billingOpsReverse"), tone: "danger" as const, onSelect: () => setDialog({ kind: "reverse", entry }) }] : []),
                ...(entry.runId && (entry.type === "capture" || entry.type === "action") && !entry.reversed
                  ? [{ label: t("billingOpsRefundRun"), tone: "danger" as const, onSelect: () => setDialog({ kind: "run", runId: entry.runId! }) }] : []),
              ];
              return (
                <tr key={entry.id}>
                  <RowTitle meta={[entry.meter && humanize(entry.meter), entry.runId && `${t("run")} ${short(entry.runId)}`, entry.reversed && t("billingOpsReversed")].filter(Boolean).join(" · ") || undefined}>
                    {humanize(entry.type)}
                  </RowTitle>
                  <td className="p-num">{Number(entry.credits) > 0 ? "+" : ""}{credits(entry.credits)}</td>
                  <td className="p-num p-cell-meta">{credits(entry.availableAfter)}</td>
                  <td className="p-cell-meta">{humanize(entry.actorKind)}{entry.reason ? ` · ${ledgerReason(entry.reason)}` : ""}</td>
                  <td className="p-table-action p-cell-meta"><Time value={entry.createdAt} /></td>
                  <td className="p-table-action">{items.length > 0 && <ActionMenu label={`${t("actions")}: ${humanize(entry.type)}`} items={items} />}</td>
                </tr>
              );
            })}
          </DataTable>
        )}
        {nextBefore && (
          <div className="p-row p-section-tight">
            <Action variant="secondary" onClick={() => void evalRequest<AccountData>(`/billing/admin/accounts/${orgId}?before=${nextBefore}`).then(next => setOlder(next.ledger)).catch(() => undefined)}>{t("loadOlder")}</Action>
          </div>
        )}
      </section>

      <div className="p-split p-section">
        <section>
          <SectionHeading title={t("billingOpsLots")}>{t("billingOpsLotsHelp")}</SectionHeading>
          {!data.lots.length ? <EmptyState compact title={t("billingOpsNoLots")} /> : (
            <DataTable caption={t("billingOpsLots")} headers={[t("billingOpsSource"), { label: t("billingOpsRemaining"), align: "end" }, { label: t("billingOpsExpires"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
              {data.lots.map(lot => (
                <tr key={lot.id}>
                  <RowTitle meta={[lot.campaign && humanize(lot.campaign), lot.orderId && `${t("billingOpsOrder")} ${short(lot.orderId)}`].filter(Boolean).join(" · ") || undefined}>{humanize(lot.source)}</RowTitle>
                  <td className="p-num">{credits(lot.remaining)} / {credits(lot.granted)}</td>
                  <td className="p-table-action p-cell-meta"><Time value={lot.expiresAt} withTime={false} /></td>
                  <td className="p-table-action">
                    {lot.extendable && (
                      <Action variant="ghost" size="sm" onClick={() => setDialog({ kind: "extend", lot })}>{t("billingOpsExtend")}</Action>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
        <section>
          <SectionHeading title={t("billingOpsHolds")}>{t("billingOpsHoldsHelp")}</SectionHeading>
          {!data.holds.length ? <EmptyState compact title={t("billingOpsNoHolds")} /> : (
            <DataTable caption={t("billingOpsHolds")} headers={[t("billingOpsHold"), { label: t("billingOpsCredits"), align: "end" }, { label: t("createdAt"), align: "end" }]}>
              {data.holds.map(hold => (
                <tr key={hold.id}>
                  <RowTitle meta={hold.runId ? `${t("run")} ${short(hold.runId)}` : undefined}><StatusBadge value={hold.state} /></RowTitle>
                  <td className="p-num">{credits(hold.captured)} / {credits(hold.amount)}</td>
                  <td className="p-table-action p-cell-meta"><Time value={hold.createdAt} /></td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      </div>

      <section className="p-section">
        <SectionHeading title={t("billingOpsOrders")}>{t("billingOpsOrdersHelp")}</SectionHeading>
        {!data.orders.length ? <EmptyState compact title={t("billingOpsNoOrders")} /> : (
          <DataTable caption={t("billingOpsOrders")} headers={[t("billingOpsOrder"), t("statusLabel"), { label: t("billingOpsGross"), align: "end" }, { label: t("billingOpsPaid"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
            {data.orders.map(order => (
              <tr key={order.id}>
                <RowTitle meta={[short(order.id), order.livemode ? t("billingOpsLive") : t("billingOpsTestMode"), ...order.riskFlags.map(humanize)].join(" · ")}>{order.pack}</RowTitle>
                <td><StatusBadge value={order.status} /></td>
                <td className="p-num">{euros(order.grossCents)}</td>
                <td className="p-table-action p-cell-meta"><Time value={order.paidAt} /></td>
                <td className="p-table-action">
                  {order.refundable && <Action variant="ghost" size="sm" onClick={() => setDialog({ kind: "refund", order })}>{t("billingOpsRefundMoney")}</Action>}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <div className="p-split p-section">
        <section>
          <SectionHeading title={t("billingOpsInvoices")} />
          {!data.documents.length ? <EmptyState compact title={t("billingOpsNoDocuments")} /> : (
            <DataTable caption={t("billingOpsInvoices")} headers={[t("billingOpsDocument"), t("statusLabel"), { label: t("billingOpsGross"), align: "end" }]}>
              {data.documents.map(document => (
                <tr key={document.id}>
                  <RowTitle meta={document.number ?? short(document.id)}>{t(document.kind === "credit_note" ? "billingOpsCreditNote" : "billingOpsInvoice")}</RowTitle>
                  <td><StatusBadge value={document.status} /></td>
                  <td className="p-num">{euros(document.grossCents)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
        <section>
          <SectionHeading title={t("billingOpsAlerts")} />
          {!data.alerts.length ? <EmptyState compact title={t("billingOpsNoAlerts")} /> : (
            <DataTable caption={t("billingOpsAlerts")} headers={[t("billingOpsAlert"), { label: t("billingOpsSent"), align: "end" }]}>
              {data.alerts.map(alert => (
                <tr key={`${alert.kind}-${alert.period}`}>
                  <RowTitle meta={alert.period.length > 20 ? short(alert.period) : alert.period}>{humanize(alert.kind)}</RowTitle>
                  <td className="p-table-action p-cell-meta"><Time value={alert.sentAt} /></td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      </div>

      <Modal alert={messages} open={dialog?.kind === "grant"} onOpenChange={value => !value && close()} title={t("billingOpsGrant")} description={tv("billingOpsGrantHelp", { credits: credits(data.thresholdCredits) })}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-grant" disabled={pending}>{Number(amount) > 0 ? tv("billingOpsGrantAmount", { credits: credits(Number(amount)), euros: euros(Number(amount)) }) : t("billingOpsGrant")}</Action></>}>
        <form id="ob-grant" className="p-stack" onSubmit={event => { const f = form(event); return void submit("/billing/admin/grants", {
          credits: Number(f.get("credits")), source: f.get("source"), reason: f.get("reason"), expiresAt: dateValue(f.get("expiresAt")),
          campaign: String(f.get("campaign") ?? "").trim() || undefined }, t("billingOpsGranted"))(event); }}>
          <div className="p-grid-2 p-form-grid">
            <Field id="ob-grant-credits" name="credits" type="number" min={1} max={10_000_000} step={1} label={t("billingOpsCredits")} required onChange={event => setAmount(event.target.value)} />
            <SelectField id="ob-grant-source" name="source" label={t("billingOpsSource")} defaultValue="grant">
              <option value="grant">{t("billingOpsSourceGrant")}</option>
              <option value="promo">{t("billingOpsSourcePromo")}</option>
            </SelectField>
            <Field id="ob-grant-expiry" name="expiresAt" type="date" label={t("billingOpsExpiry")} hint={t("billingOpsExpiryDefaultHint")} />
            <Field id="ob-grant-campaign" name="campaign" label={t("billingOpsCampaign")} placeholder="design-partner" pattern="[a-z0-9][a-z0-9_.:\-]{0,79}" />
          </div>
          <Field id="ob-grant-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
        </form>
      </Modal>

      <Modal alert={messages} open={dialog?.kind === "adjust"} onOpenChange={value => !value && close()} title={t("billingOpsAdjust")} description={tv("billingOpsAdjustHelp", { credits: credits(data.thresholdCredits) })}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-adjust" variant={Number(amount) < 0 ? "danger" : undefined} disabled={pending}>{Number(amount) > 0 ? tv("billingOpsAddAmount", { credits: credits(Number(amount)), euros: euros(Number(amount)) }) : Number(amount) < 0 ? tv("billingOpsRemoveAmount", { credits: credits(-Number(amount)), euros: euros(-Number(amount)) }) : t("billingOpsAdjust")}</Action></>}>
        <form id="ob-adjust" className="p-stack" onSubmit={event => { const f = form(event); return void submit("/billing/admin/adjustments", {
          credits: Number(f.get("credits")), reason: f.get("reason"), expiresAt: Number(f.get("credits")) > 0 ? dateValue(f.get("expiresAt")) : undefined }, t("billingOpsAdjusted"))(event); }}>
          <div className="p-grid-2 p-form-grid">
            <Field id="ob-adjust-credits" name="credits" type="number" min={-10_000_000} max={10_000_000} step={1} label={t("billingOpsCreditsSigned")} required onChange={event => setAmount(event.target.value)} />
            <Field id="ob-adjust-expiry" name="expiresAt" type="date" label={t("billingOpsExpiry")} hint={t("billingOpsAdjustExpiryHint")} />
          </div>
          <Field id="ob-adjust-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
        </form>
      </Modal>

      <Modal alert={messages} open={dialog?.kind === "freeze"} onOpenChange={value => !value && close()} size="sm"
        title={a.frozenReason ? t("billingOpsUnfreeze") : t("billingOpsFreeze")} description={a.frozenReason ? t("billingOpsUnfreezeHelp") : t("billingOpsFreezeHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-freeze" variant={a.frozenReason ? undefined : "danger"} disabled={pending}>{a.frozenReason ? t("billingOpsUnfreeze") : t("billingOpsFreeze")}</Action></>}>
        <form id="ob-freeze" className="p-stack" onSubmit={event => { const f = form(event); return void submit("/billing/admin/freeze", { frozen: !a.frozenReason, reason: f.get("reason") },
          a.frozenReason ? t("billingOpsUnfrozen") : t("billingOpsFrozenDone"))(event); }}>
          <Field id="ob-freeze-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
        </form>
      </Modal>

      <Modal alert={messages} open={dialog?.kind === "extend"} onOpenChange={value => !value && close()} size="sm" title={t("billingOpsExtend")} description={t("billingOpsExtendHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-extend" disabled={pending}>{t("billingOpsExtend")}</Action></>}>
        {dialog?.kind === "extend" && (
          <form id="ob-extend" className="p-stack" onSubmit={event => { const f = form(event); return void submit("/billing/admin/expiry", { lotId: dialog.lot.id, expiresAt: dateValue(f.get("expiresAt")), reason: f.get("reason") }, t("billingOpsExtended"))(event); }}>
            <p className="p-cell-meta">{humanize(dialog.lot.source)} · {credits(dialog.lot.remaining)} · <Time value={dialog.lot.expiresAt} withTime={false} /></p>
            <Field id="ob-extend-date" name="expiresAt" type="date" label={t("billingOpsNewExpiry")} required min={dialog.lot.expiresAt?.slice(0, 10)} />
            <Field id="ob-extend-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
          </form>
        )}
      </Modal>

      <Modal alert={messages} open={dialog?.kind === "reverse" || dialog?.kind === "run"} onOpenChange={value => !value && close()} size="sm"
        title={dialog?.kind === "run" ? t("billingOpsRefundRun") : t("billingOpsReverse")} description={dialog?.kind === "run" ? t("billingOpsRefundRunHelp") : t("billingOpsReverseHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-credit-refund" variant="danger" disabled={pending}>{dialog?.kind === "run" ? t("billingOpsRefundRun") : t("billingOpsReverse")}</Action></>}>
        {(dialog?.kind === "reverse" || dialog?.kind === "run") && (
          <form id="ob-credit-refund" className="p-stack" onSubmit={event => { const f = form(event); return void submit("/billing/admin/credit-refunds",
            dialog.kind === "run" ? { runId: dialog.runId, reason: f.get("reason") } : { entryId: dialog.entry.id, reason: f.get("reason") },
            dialog.kind === "run" ? t("billingOpsRunRefunded") : t("billingOpsReversedDone"))(event); }}>
            {dialog.kind === "reverse" && <p className="p-cell-meta">{humanize(dialog.entry.type)} · {credits(dialog.entry.credits)} · <Time value={dialog.entry.createdAt} /></p>}
            <Field id="ob-credit-refund-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
          </form>
        )}
      </Modal>

      <Modal alert={messages} open={dialog?.kind === "refund"} onOpenChange={value => !value && close()} size="sm" title={t("billingOpsRefundMoney")}
        description={dialog?.kind === "refund" && dialog.order.needsSecondApprover ? t("billingOpsRefundMoneyApprovalHelp") : t("billingOpsRefundMoneyHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-refund" variant="danger" disabled={pending}>{t("billingOpsRefundMoney")}</Action></>}>
        {dialog?.kind === "refund" && (
          <form id="ob-refund" className="p-stack" onSubmit={event => { const f = form(event); return void submit("/billing/admin/refunds", { orderId: dialog.order.id, reason: f.get("reason") }, t("billingOpsRefunded"))(event); }}>
            <p className="p-cell-meta">{dialog.order.pack} · {euros(dialog.order.grossCents)} · {dialog.order.livemode ? t("billingOpsLive") : t("billingOpsTestMode")}</p>
            <Field id="ob-refund-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
          </form>
        )}
      </Modal>

      <OverrideDialog open={dialog?.kind === "override"} orgId={orgId} workspace={a.workspace} current={data.override} onClose={close} onSaved={load} />
    </>
  );
}

/* ------------------------------------------------------------ approvals --- */

function payloadSummary(item: Approval) {
  const p = item.payload;
  const parts: string[] = [humanize(item.action)];
  if (typeof p.credits === "number") parts.push(`${p.credits > 0 ? "+" : ""}${credits(p.credits)} ${t("billingOpsCreditsLower")}`);
  else if (item.netCents != null) parts.push(euros(item.netCents));
  else parts.push(`${credits(item.credits)} ${t("billingOpsCreditsLower")}`);
  if (typeof p.expiresAt === "string") parts.push(tv("billingOpsUntil", { date: formatDate(p.expiresAt) }));
  if (typeof p.campaign === "string") parts.push(humanize(p.campaign));
  return parts.join(" · ");
}

export function ApprovalTable({ rows, userId, onChanged }: { rows: Approval[]; userId: string; onChanged: () => Promise<void> | void }) {
  const [dialog, setDialog] = useState<null | { kind: "approve" | "close"; item: Approval }>(null);
  const { run, pending, messages, clear } = useOpsAction();
  const close = () => { setDialog(null); clear(); };
  const mine = (item: Approval) => item.requestedBy === userId;
  return (
    <>
      {dialog === null && messages}
      <DataTable caption={t("billingOpsApprovals")} headers={[t("billingOpsAction"), t("workspace"), t("billingOpsRequestedBy"), t("statusLabel"), { label: t("billingOpsExpires"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
        {rows.map(item => (
          <tr key={item.id}>
            <RowTitle meta={item.reason}>{payloadSummary(item)}</RowTitle>
            <td>{item.workspace ?? short(item.orgId)}</td>
            <td className="p-cell-meta">{mine(item) ? t("billingOpsYou") : <code className="p-code" title={item.requestedBy}>{short(item.requestedBy)}</code>}</td>
            <td><StatusBadge value={item.status} /></td>
            <td className="p-table-action p-cell-meta"><Time value={item.expiresAt} /></td>
            <td className="p-table-action">
              {(item.status === "pending" || (item.status === "approved" && item.approvedBy === userId)) && (
                <span className="p-row">
                  {!mine(item) && <Action size="sm" onClick={() => setDialog({ kind: "approve", item })}>{item.status === "approved" ? t("billingOpsRetry") : t("billingOpsApprove")}</Action>}
                  {item.status === "pending" && <Action variant="ghost" size="sm" onClick={() => setDialog({ kind: "close", item })}>{mine(item) ? t("cancel") : t("billingOpsReject")}</Action>}
                </span>
              )}
              {item.status === "pending" && mine(item) && <span className="p-cell-meta p-cell-note">{t("billingOpsNeedsAnotherAdmin")}</span>}
            </td>
          </tr>
        ))}
      </DataTable>
      <Modal alert={messages} open={dialog?.kind === "approve"} onOpenChange={value => !value && close()} title={t("billingOpsApprove")} description={t("billingOpsApproveHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action disabled={pending} onClick={() => { const key = newKey(); return dialog && void run(async () => {
          await evalRequest(`/billing/admin/approvals/${dialog.item.id}/approve`, "POST", { orgId: dialog.item.orgId, payloadSha256: dialog.item.payloadSha256 }, key);
          return t("billingOpsApproved");
        }).then(async ok => { if (ok) { close(); await onChanged(); } }); }}>{t("billingOpsApproveAndRun")}</Action></>}>
        {dialog?.kind === "approve" && (
          <dl className="p-defs">
            <dt>{t("billingOpsAction")}</dt><dd>{payloadSummary(dialog.item)}</dd>
            <dt>{t("workspace")}</dt><dd>{dialog.item.workspace ?? dialog.item.orgId}</dd>
            <dt>{t("billingOpsReason")}</dt><dd>{dialog.item.reason}</dd>
            <dt>{t("billingOpsRequestedBy")}</dt><dd><code className="p-code">{dialog.item.requestedBy}</code></dd>
            <dt>{t("billingOpsPayloadHash")}</dt><dd><code className="p-code">{dialog.item.payloadSha256.slice(0, 16)}…</code></dd>
          </dl>
        )}
      </Modal>
      <Modal alert={messages} open={dialog?.kind === "close"} onOpenChange={value => !value && close()} size="sm"
        title={dialog && mine(dialog.item) ? t("billingOpsCancelRequest") : t("billingOpsReject")} description={t("billingOpsCloseHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-close" variant={dialog && !mine(dialog.item) ? "danger" : undefined} disabled={pending}>{dialog && mine(dialog.item) ? t("billingOpsCancelRequest") : t("billingOpsReject")}</Action></>}>
        <form id="ob-close" className="p-stack" onSubmit={event => {
          event.preventDefault();
          if (!dialog) return;
          const reason = new FormData(event.currentTarget).get("reason");
          const key = newKey();
          void run(async () => {
            await evalRequest(`/billing/admin/approvals/${dialog.item.id}/close`, "POST", { orgId: dialog.item.orgId, reason }, key);
            return t("billingOpsRequestClosed");
          }).then(async ok => { if (ok) { close(); await onChanged(); } });
        }}>
          <Field id="ob-close-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
        </form>
      </Modal>
    </>
  );
}

function Approvals({ userId }: { userId: string }) {
  const [status, setStatus] = useState<"open" | "executed" | "rejected" | "cancelled" | "expired">("open");
  const [data, setData] = useState<{ approvals: Approval[]; thresholdCredits: string; thresholdNetCents: number } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setData(await evalRequest(`/billing/admin/approvals?status=${status}`)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : t("error")); }
  }, [status]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return (
    <section>
      <SectionHeading title={t("billingOpsApprovals")}>
        {data ? tv("billingOpsApprovalsHelp", { credits: credits(data.thresholdCredits), euros: euros(data.thresholdNetCents) }) : null}
      </SectionHeading>
      <div className="p-toolbar">
        <FilterChips value={status} onChange={setStatus} label={t("filterStatus")} options={[
          { value: "open", label: t("billingOpsOpen") }, { value: "executed", label: t("billingOpsChipExecuted") }, { value: "rejected", label: t("billingOpsChipRejected") },
          { value: "cancelled", label: t("billingOpsChipCancelled") }, { value: "expired", label: t("billingOpsChipExpired") },
        ]} />
      </div>
      {error && <Status error>{error}</Status>}
      {!data ? <TableSkeleton columns={5} /> : !data.approvals.length
        ? <EmptyState title={t("billingOpsNoApprovals")}><p>{t("billingOpsNoApprovalsHelp")}</p></EmptyState>
        : <ApprovalTable rows={data.approvals} userId={userId} onChanged={load} />}
    </section>
  );
}

/* ------------------------------------------------------------ overrides --- */

function OverrideDialog({ open, orgId, workspace, current, onClose, onSaved }: { open: boolean; orgId: string; workspace: string | null; current: Override | null; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const { run, pending, messages, clear } = useOpsAction();
  const close = () => { clear(); onClose(); };
  return (
    <Modal alert={messages} open={open} onOpenChange={value => !value && close()} title={`${t("billingOpsEditOverride")}${workspace ? ` · ${workspace}` : ""}`} description={t("billingOpsOverrideHelp")}
      footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-override" disabled={pending}>{t("save")}</Action></>}>
      <form id="ob-override" className="p-stack" onSubmit={event => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        const key = newKey();
        void run(async () => {
          await evalRequest("/billing/admin/overrides", "PUT", { orgId, enforcement: f.get("enforcement"), livePayments: f.has("livePayments"), plansV2: f.has("plansV2"), reason: f.get("reason") }, key);
          return t("billingOpsOverrideSaved");
        }).then(async ok => { if (ok) { close(); await onSaved(); } });
      }}>
        <SelectField id="ob-override-enforcement" name="enforcement" label={t("billingOpsEnforcement")} defaultValue={current?.enforcement ?? "inherit"} hint={t("billingOpsEnforcementHint")}>
          <option value="inherit">{t("billingOpsInherit")}</option>
          <option value="shadow">{humanize("shadow")}</option>
          <option value="enforce">{humanize("enforce")}</option>
        </SelectField>
        <Check name="livePayments" defaultChecked={current?.livePayments ?? false} label={t("billingOpsLivePayments")} description={t("billingOpsLivePaymentsHelp")} />
        <Check name="plansV2" defaultChecked={current?.plansV2 ?? false} label={t("billingOpsPlansV2")} description={t("billingOpsPlansV2Help")} />
        <Field id="ob-override-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
      </form>
    </Modal>
  );
}

type OverrideRow = { orgId: string; workspace: string | null; plan: string | null; billingMode: string | null; enforcement: string; livePayments: boolean; plansV2: boolean; reason: string; version: number; updatedBy: string; updatedAt: string };

function Overrides() {
  const [rows, setRows] = useState<OverrideRow[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<OverrideRow | null>(null);
  const load = useCallback(async () => {
    try { setRows(await evalRequest<OverrideRow[]>("/billing/admin/overrides")); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : t("error")); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const flags = (row: OverrideRow): ReactNode => [row.livePayments && t("billingOpsLivePayments"), row.plansV2 && t("billingOpsPlansV2")].filter(Boolean).join(" · ") || "—";
  return (
    <section>
      <SectionHeading title={t("billingOpsOverrides")}>{t("billingOpsOverridesHelp")}</SectionHeading>
      {error && <Status error>{error}</Status>}
      {!rows ? <TableSkeleton columns={4} /> : !rows.length ? <EmptyState compact title={t("billingOpsNoOverrides")} /> : (
        <DataTable caption={t("billingOpsOverrides")} headers={[t("workspace"), t("billingOpsEnforcement"), t("billingOpsOverrideFlags"), { label: t("billingOpsUpdated"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
          {rows.map(row => (
            <tr key={row.orgId}>
              <RowTitle meta={row.reason}>{row.workspace ?? short(row.orgId)}</RowTitle>
              <td><Badge>{enforcementLabel(row.enforcement)}</Badge></td>
              <td className="p-cell-meta">{flags(row)}</td>
              <td className="p-table-action p-cell-meta"><Time value={row.updatedAt} /></td>
              <td className="p-table-action"><Action variant="ghost" size="sm" onClick={() => setEditing(row)}>{t("billingOpsEdit")}</Action></td>
            </tr>
          ))}
        </DataTable>
      )}
      <p className="p-field-hint p-section-tight">{t("billingOpsOverridesNew")}</p>
      <OverrideDialog open={!!editing} orgId={editing?.orgId ?? ""} workspace={editing?.workspace ?? null}
        current={editing ? { enforcement: editing.enforcement, livePayments: editing.livePayments, plansV2: editing.plansV2, reason: editing.reason, version: editing.version, updatedAt: editing.updatedAt } : null}
        onClose={() => setEditing(null)} onSaved={load} />
    </section>
  );
}

