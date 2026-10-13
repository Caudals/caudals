"use client";

/**
 * Ops billing console (L-16), second half: the price book (draft from
 * provider prices and FX, margin and run-impact preview, schedule with the
 * 30-day notice for increases, activate, history), the daily reconciliation
 * (stored reports, clean-day streak), manual invoices (L-13's attach and
 * void), the monthly accountant export and the fraud queue.
 */
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { Download, Plus, RefreshCw } from "lucide-react";
import { evalRequest } from "./api";
import {
  Action, Badge, Check, DataTable, EmptyState, Field, FilterChips, RowTitle, SectionHeading, SelectField, Stat, StatGrid, Status, StatusBadge,
  TableSkeleton, Time, humanize,
} from "./primitives";
import { Modal } from "./overlays";
import { useWorkspace } from "./workspace-context";
import { accountHref, credits, euros, newKey, short, treatmentLabel, useOpsAction } from "./ops-billing-shared";
import { t, tv, type MessageKey } from "@/lib/evals/messages/en";

const error = (reason: unknown) => (reason instanceof Error ? reason.message : t("error"));
const pct = (value: number) => `${Math.round(value * 1000) / 10} %`;
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/* ----------------------------------------------------------- price book --- */

type Revision = { id: string; revision: number; status: string; title: string; notes: string | null; effectiveAt: string | null; multiplier: string; fxUsdPerEur: string; fxDate: string; raisesPrices: boolean | null; noticeSentAt: string | null; createdAt: string };
type RateChange = { label: string; provider: string; modelId: string | null; minInputTokens: number; status: string; input?: { listed: string }; output?: { listed: string } };
type BookList = {
  effectiveRevisionId: string | null; revisions: Revision[]; routes: Array<{ issue: string | null }>;
  latestFx: { usdPerEur: string; date: string; source: string } | null;
  latestCheck: { checkedAt: string; changed: number; unavailable: number; changes: RateChange[] } | null;
};
type ModelView = { id: string; label: string; provider: string; modelId: string | null; minInputTokens: number; credits: { input: string; output: string }; margin: { input: number; output: number }; planningRunCredits50: number; costBasis: string };
type RevisionView = Revision & { models: ModelView[]; actions: Array<{ meter: string; label: string; credits: string; unit: string }>; routeIssues: Array<{ role: string; modelId: string; issue: string }> };
type Notice = {
  state: "not_required" | "due" | "sent" | "missed" | "draft"; deadline: string | null; noticeSentAt: string | null; canSend: boolean; mode: "internal" | "owners";
  increases: Array<{ kind: string; label: string; now: string; next: string }>; recipients: Array<{ orgId: string; workspace: string; owners: number; models: string[] }>;
  totals: { workspaces: number; owners: number };
};

const NOTICE_LABEL: Record<Notice["state"], MessageKey> = {
  not_required: "billingOpsNoticeNotRequired", due: "billingOpsNoticeDue", sent: "billingOpsNoticeSent", missed: "billingOpsNoticeMissed", draft: "billingOpsNoticeDraft",
};
function noticeOf(revision: Revision): Notice["state"] {
  if (revision.status === "draft") return "draft";
  if (!revision.raisesPrices) return "not_required";
  const deadline = revision.effectiveAt ? Date.parse(revision.effectiveAt) - 30 * 86_400_000 : 0;
  if (revision.noticeSentAt) return Date.parse(revision.noticeSentAt) <= deadline ? "sent" : "missed";
  return Date.now() <= deadline ? "due" : "missed";
}
const keyOf = (model: Pick<ModelView, "provider" | "modelId" | "minInputTokens">) => `${model.provider}|${model.modelId ?? ""}|${model.minInputTokens}`;

export function PriceBook() {
  const { orgId } = useWorkspace();
  const [list, setList] = useState<BookList | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const [drafting, setDrafting] = useState(false);
  const load = useCallback(async () => {
    if (!orgId) return;
    try { setList(await evalRequest<BookList>(`/billing/admin/price-book/revisions?orgId=${orgId}`)); setFailure(""); } catch (reason) { setFailure(error(reason)); }
  }, [orgId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (!orgId) return <Status>{t("platformNeedsClient")}</Status>;
  if (failure) return <Status error>{failure}</Status>;
  if (!list) return <TableSkeleton columns={5} />;
  if (selected) return <RevisionDetail id={selected} list={list} onBack={() => setSelected(null)} onChanged={load} />;
  return (
    <section>
      <SectionHeading title={t("billingOpsPriceBook")} actions={<Action variant="secondary" onClick={() => setDrafting(true)}><Plus aria-hidden="true" />{t("billingOpsNewDraft")}</Action>}>
        {t("billingOpsPriceBookHelp")}
      </SectionHeading>
      {list.revisions.some(revision => noticeOf(revision) === "due") && <Status tone="warn">{t("billingOpsNoticeDueBanner")}</Status>}
      {list.revisions.some(revision => noticeOf(revision) === "missed" && revision.status === "scheduled") && <Status error>{t("billingOpsNoticeMissedBanner")}</Status>}
      <DataTable caption={t("billingOpsPriceBook")} headers={[t("billingOpsRevision"), t("statusLabel"), { label: t("billingOpsEffective"), align: "end" }, t("billingOpsNotice"), { label: t("actions"), align: "end", hidden: true }]}>
        {list.revisions.map(revision => {
          const notice = noticeOf(revision);
          return (
            <tr key={revision.id}>
              <RowTitle meta={`${revision.title}${revision.id === list.effectiveRevisionId ? ` · ${t("billingOpsInEffect")}` : ""}`}>{tv("billingOpsRevisionNumber", { n: revision.revision })}</RowTitle>
              <td><StatusBadge value={revision.status} /></td>
              <td className="p-table-action p-cell-meta"><Time value={revision.effectiveAt} /></td>
              <td>
                <Badge tone={notice === "missed" ? "fail" : notice === "due" ? "warn" : notice === "sent" ? "pass" : "neutral"} dot={notice === "due" || notice === "missed"}>{t(NOTICE_LABEL[notice])}</Badge>
                {notice === "due" && revision.effectiveAt && <span className="p-cell-meta p-cell-note">{tv("billingOpsNoticeBy", { date: new Date(Date.parse(revision.effectiveAt) - 30 * 86_400_000).toISOString().slice(0, 10) })}</span>}
              </td>
              <td className="p-table-action"><Action variant="ghost" size="sm" onClick={() => setSelected(revision.id)}>{t("billingOpsView")}</Action></td>
            </tr>
          );
        })}
      </DataTable>
      <DraftDialog open={drafting} list={list} onClose={() => setDrafting(false)} onCreated={async id => { setDrafting(false); await load(); setSelected(id); }} />
    </section>
  );
}

function DraftDialog({ open, list, onClose, onCreated }: { open: boolean; list: BookList; onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const { orgId } = useWorkspace();
  const { run, pending, messages, clear } = useOpsAction();
  const effective = list.revisions.find(revision => revision.id === list.effectiveRevisionId);
  const changed = (list.latestCheck?.changes ?? []).filter(change => change.status === "changed" && change.input?.listed && change.output?.listed);
  const close = () => { clear(); onClose(); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = newKey();
    const custom = form.get("fxMode") === "custom";
    const body = {
      orgId, title: form.get("title"), notes: String(form.get("notes") ?? "").trim() || undefined,
      multiplier: String(form.get("multiplier") ?? "").trim() || undefined,
      fx: custom ? { usdPerEur: String(form.get("fxRate")), date: String(form.get("fxDate")), source: String(form.get("fxSource")) } : undefined,
      models: form.has("useCheck") ? changed.map(change => ({ provider: change.provider, modelId: change.modelId, minInputTokens: change.minInputTokens,
        usdInputPerM: change.input!.listed, usdOutputPerM: change.output!.listed, sourceAccessedOn: today() })) : [],
    };
    let created = "";
    const ok = await run(async () => {
      created = (await evalRequest<{ id: string }>("/billing/admin/price-book/revisions", "POST", body, key)).id;
      return t("billingOpsDraftCreated");
    });
    if (ok && created) await onCreated(created);
  }
  return (
    <Modal alert={messages} open={open} onOpenChange={value => !value && close()} size="lg" title={t("billingOpsNewDraft")} description={t("billingOpsNewDraftHelp")}
      footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-draft" disabled={pending}>{t("billingOpsCreateDraft")}</Action></>}>
      <form id="ob-draft" className="p-stack" onSubmit={submit}>
        <Field id="ob-draft-title" name="title" label={t("billingOpsDraftTitle")} required minLength={3} maxLength={200} defaultValue={tv("billingOpsDraftDefaultTitle", { date: today() })} />
        <Field id="ob-draft-notes" name="notes" label={t("billingOpsDraftNotes")} maxLength={4000} />
        <Field id="ob-draft-multiplier" name="multiplier" label={t("billingOpsMultiplier")} placeholder={effective?.multiplier ?? "1.5"} inputMode="decimal" hint={t("billingOpsMultiplierHint")} />
        <fieldset className="p-fieldset">
          <legend>{t("billingOpsFx")}</legend>
          <label className="p-check"><input type="radio" name="fxMode" value="latest" defaultChecked /><span><span className="p-check-label">
            {list.latestFx ? tv("billingOpsFxLatest", { rate: list.latestFx.usdPerEur, date: list.latestFx.date }) : t("billingOpsFxBook")}</span></span></label>
          <label className="p-check"><input type="radio" name="fxMode" value="custom" /><span><span className="p-check-label">{t("billingOpsFxCustom")}</span></span></label>
          <div className="p-grid-2 p-form-grid">
            <Field id="ob-draft-fx" name="fxRate" label={t("billingOpsFxRate")} inputMode="decimal" placeholder="1.1605" />
            <Field id="ob-draft-fx-date" name="fxDate" type="date" label={t("billingOpsFxDate")} />
          </div>
          <Field id="ob-draft-fx-source" name="fxSource" label={t("billingOpsFxSource")} placeholder="ECB reference rate" />
        </fieldset>
        <Check name="useCheck" disabled={!changed.length} defaultChecked={changed.length > 0}
          label={tv("billingOpsUseCheck", { count: changed.length })}
          description={list.latestCheck ? tv("billingOpsUseCheckHelp", { date: list.latestCheck.checkedAt.slice(0, 10) }) : t("billingOpsNoCheck")} />
      </form>
    </Modal>
  );
}

function RevisionDetail({ id, list, onBack, onChanged }: { id: string; list: BookList; onBack: () => void; onChanged: () => Promise<void> }) {
  const { orgId } = useWorkspace();
  const [view, setView] = useState<RevisionView | null>(null);
  const [base, setBase] = useState<RevisionView | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [failure, setFailure] = useState("");
  const [dialog, setDialog] = useState<null | "schedule" | "notice-test" | "notice-send">(null);
  const { run, pending, messages, clear } = useOpsAction();
  const load = useCallback(async () => {
    try {
      const next = await evalRequest<RevisionView>(`/billing/admin/price-book/revisions/${id}?orgId=${orgId}`);
      setView(next);
      const compareTo = list.effectiveRevisionId && list.effectiveRevisionId !== id ? list.effectiveRevisionId : null;
      setBase(compareTo ? await evalRequest<RevisionView>(`/billing/admin/price-book/revisions/${compareTo}?orgId=${orgId}`) : null);
      setNotice(await evalRequest<Notice>(`/billing/admin/price-book/revisions/${id}/notice?orgId=${orgId}`));
      setFailure("");
    } catch (reason) { setFailure(error(reason)); }
  }, [id, orgId, list.effectiveRevisionId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (failure) return <><Action variant="ghost" onClick={onBack}>{t("billingOpsBackToPriceBook")}</Action><Status error>{failure}</Status></>;
  if (!view || !notice) return <TableSkeleton columns={5} />;
  const before = new Map((base?.models ?? []).map(model => [keyOf(model), model]));
  const raises = view.models.some(model => { const old = before.get(keyOf(model)); return !!old && (Number(model.credits.input) > Number(old.credits.input) || Number(model.credits.output) > Number(old.credits.output)); })
    || view.actions.some(action => { const old = base?.actions.find(item => item.meter === action.meter); return !!old && Number(action.credits) > Number(old.credits); });
  const close = () => { setDialog(null); clear(); };
  const transition = (action: "activate" | "cancel", done: string) => {
    const key = newKey();
    return void run(async () => { await evalRequest(`/billing/admin/price-book/revisions/${id}/${action}`, "POST", { orgId }, key); return done; })
      .then(async ok => { if (ok) { await onChanged(); await load(); } });
  };
  const noticeAction = (action: "test" | "send") => {
    const key = newKey();
    return void run(async () => {
      const result = await evalRequest<{ sent: number }>(`/billing/admin/price-book/revisions/${id}/notice`, "POST", { orgId, action }, key);
      return action === "test" ? tv("billingOpsNoticeTestSent", { count: result.sent }) : t("billingOpsNoticeRecorded");
    }).then(async ok => { if (ok) { close(); await onChanged(); await load(); } });
  };
  const minDate = raises ? plusDays(31) : today();
  return (
    <>
      <div className="p-row p-section-tight"><Action variant="ghost" onClick={onBack}>{t("billingOpsBackToPriceBook")}</Action></div>
      <SectionHeading title={`${tv("billingOpsRevisionNumber", { n: view.revision })} · ${view.title}`} actions={
        <span className="p-row">
          {view.status === "draft" && <Action onClick={() => setDialog("schedule")}>{raises ? t("billingOpsSchedule") : t("billingOpsScheduleOrApply")}</Action>}
          {view.status === "scheduled" && <Action variant="secondary" disabled={pending} onClick={() => transition("activate", t("billingOpsActivated"))}>{t("billingOpsActivate")}</Action>}
          {view.status === "scheduled" && <Action variant="ghost" disabled={pending} onClick={() => transition("cancel", t("billingOpsCancelled"))}>{t("billingOpsCancelSchedule")}</Action>}
        </span>
      }>
        <StatusBadge value={view.status} /> {view.notes}
      </SectionHeading>
      {dialog === null && messages}
      {view.routeIssues.length > 0 && <Status error>{tv("billingOpsRouteIssues", { count: view.routeIssues.length })}</Status>}
      <StatGrid>
        <Stat label={t("billingOpsEffective")} value={view.effectiveAt ? <Time value={view.effectiveAt} /> : "—"} meta={view.status === "draft" ? t("billingOpsNotScheduled") : undefined} />
        <Stat label={t("billingOpsMultiplier")} value={`× ${view.multiplier}`} meta={tv("billingOpsFxValue", { rate: view.fxUsdPerEur, date: view.fxDate })} />
        <Stat label={t("billingOpsChange")} value={base ? (raises ? t("billingOpsIncrease") : t("billingOpsNoIncrease")) : "—"}
          meta={base ? tv("billingOpsComparedTo", { n: list.revisions.find(item => item.id === list.effectiveRevisionId)?.revision ?? "—" }) : t("billingOpsInEffect")} />
        <Stat label={t("billingOpsNotice")} value={t(NOTICE_LABEL[notice.state])} meta={notice.deadline ? tv("billingOpsNoticeBy", { date: notice.deadline.slice(0, 10) }) : undefined} />
      </StatGrid>

      {(notice.state === "due" || notice.state === "sent" || notice.state === "missed" || (notice.state === "draft" && raises)) && (
        <section className="p-section">
          <SectionHeading title={t("billingOpsIncreaseNotice")} actions={notice.state === "due" ? (
            <span className="p-row">
              <Action variant="secondary" onClick={() => setDialog("notice-test")}>{t("billingOpsNoticeSendTest")}</Action>
              <Action disabled={notice.mode !== "owners"} onClick={() => setDialog("notice-send")}>{t("billingOpsNoticeSendOwners")}</Action>
            </span>
          ) : undefined}>
            {tv("billingOpsIncreaseNoticeHelp", { workspaces: notice.totals.workspaces, owners: notice.totals.owners })}
          </SectionHeading>
          {notice.state === "due" && notice.mode !== "owners" && <Status>{t("billingOpsNoticeInternalOnly")}</Status>}
          {notice.state === "missed" && <Status error>{t("billingOpsNoticeMissedHelp")}</Status>}
          {notice.increases.length > 0 && (
            <DataTable caption={t("billingOpsIncreaseNotice")} headers={[t("billingOpsRate"), { label: t("billingOpsNow"), align: "end" }, { label: t("billingOpsNext"), align: "end" }]}>
              {notice.increases.map(item => (
                <tr key={`${item.kind}-${item.label}`}>
                  <RowTitle meta={humanize(item.kind)}>{item.label}</RowTitle>
                  <td className="p-num">{item.now}</td>
                  <td className="p-num">{item.next}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      )}

      <section className="p-section">
        <SectionHeading title={t("billingOpsModelRates")}>{t("billingOpsModelRatesHelp")}</SectionHeading>
        <DataTable caption={t("billingOpsModelRates")} headers={[t("model"), { label: t("billingOpsCreditsPerM"), align: "end" }, { label: t("billingOpsMargin"), align: "end" }, { label: t("billingOpsRun50"), align: "end" }]}>
          {view.models.map(model => {
            const old = before.get(keyOf(model));
            const moved = old && (old.credits.input !== model.credits.input || old.credits.output !== model.credits.output);
            const delta = old ? model.planningRunCredits50 - old.planningRunCredits50 : 0;
            return (
              <tr key={model.id}>
                <RowTitle meta={[model.provider, model.minInputTokens ? `> ${credits(model.minInputTokens)} tokens` : null, humanize(model.costBasis)].filter(Boolean).join(" · ")}>{model.label}</RowTitle>
                <td className="p-num">{moved ? <><span className="p-cell-meta">{credits(old!.credits.input)} · {credits(old!.credits.output)} →</span> </> : null}{credits(model.credits.input)} · {credits(model.credits.output)}</td>
                <td className={`p-num${model.margin.input < 0.25 || model.margin.output < 0.25 ? " p-text-warn" : ""}`}>{pct(model.margin.input)} · {pct(model.margin.output)}</td>
                <td className="p-num">{credits(model.planningRunCredits50)}{delta ? <span className="p-cell-meta"> ({delta > 0 ? "+" : ""}{credits(delta)})</span> : null}</td>
              </tr>
            );
          })}
        </DataTable>
        <p className="p-field-hint">{t("billingOpsRun50Help")}</p>
      </section>
      <section className="p-section">
        <SectionHeading title={t("billingOpsMeters")} />
        <DataTable caption={t("billingOpsMeters")} headers={[t("billingOpsMeter"), { label: t("billingOpsCredits"), align: "end" }]}>
          {view.actions.map(action => {
            const old = base?.actions.find(item => item.meter === action.meter);
            return (
              <tr key={action.meter}>
                <RowTitle meta={humanize(action.unit)}>{action.label}</RowTitle>
                <td className="p-num">{old && old.credits !== action.credits ? <span className="p-cell-meta">{credits(old.credits)} → </span> : null}{credits(action.credits)}</td>
              </tr>
            );
          })}
        </DataTable>
      </section>

      <Modal alert={messages} open={dialog === "schedule"} onOpenChange={value => !value && close()} size="sm" title={t("billingOpsSchedule")}
        description={raises ? t("billingOpsScheduleIncreaseHelp") : t("billingOpsScheduleDecreaseHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-schedule" disabled={pending}>{t("billingOpsSchedule")}</Action></>}>
        <form id="ob-schedule" className="p-stack" onSubmit={event => {
          event.preventDefault();
          const value = String(new FormData(event.currentTarget).get("date"));
          const effectiveAt = value === today() && !raises ? new Date().toISOString() : new Date(`${value}T00:00:00Z`).toISOString();
          const key = newKey();
          void run(async () => { await evalRequest(`/billing/admin/price-book/revisions/${id}/schedule`, "POST", { orgId, effectiveAt }, key); return t("billingOpsScheduled"); })
            .then(async ok => { if (ok) { close(); await onChanged(); await load(); } });
        }}>
          <Field id="ob-schedule-date" name="date" type="date" label={t("billingOpsEffectiveDate")} required min={minDate} defaultValue={minDate}
            hint={raises ? t("billingOpsScheduleIncreaseHint") : t("billingOpsScheduleDecreaseHint")} />
        </form>
      </Modal>
      <Modal alert={messages} open={dialog === "notice-test"} onOpenChange={value => !value && close()} size="sm" title={t("billingOpsNoticeSendTest")} description={t("billingOpsNoticeTestHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action disabled={pending} onClick={() => noticeAction("test")}>{t("billingOpsNoticeSendTest")}</Action></>} />
      <Modal alert={messages} open={dialog === "notice-send"} onOpenChange={value => !value && close()} size="sm" title={t("billingOpsNoticeSendOwners")}
        description={tv("billingOpsNoticeSendHelp", { workspaces: notice.totals.workspaces, owners: notice.totals.owners })}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action disabled={pending} onClick={() => noticeAction("send")}>{t("billingOpsNoticeSendOwners")}</Action></>} />
    </>
  );
}

/* ------------------------------------------------------- reconciliation --- */

type CheckResult = { count: number; ids: string[] };
type StoredReport = {
  id: string; day: string; livemode: boolean; generatedAt: string; discrepancies: number; explained: number; stripeChecked: boolean;
  report: null | {
    checks: Record<string, CheckResult>; notes: Record<string, number>; totals: Record<string, number | string>;
    stripe: { checked: boolean; reason?: string; matched: number; issues: Array<{ orderId: string; movement: string; status: string }>; unpaidOrders: Array<{ stripeId: string; orderId: string; status: string }>; timing: Array<{ stripeId: string; orderId: string }>; unrelated: Array<{ stripeId: string; type: string; amount: number }> };
  };
};
type ReconciliationData = { mode: "test" | "live"; configuredMode: string; reports: StoredReport[]; report: StoredReport | null; streak: { days: number; since: string | null } };

const CHECK_LABEL: Record<string, MessageKey> = {
  paid_order_purchase_mismatch: "billingOpsCheckPurchase", paid_order_bonus_mismatch: "billingOpsCheckBonus", purchase_without_paid_order: "billingOpsCheckOrphanPurchase",
  refunded_order_without_refund_entries: "billingOpsCheckRefundEntries", refund_entry_without_refunded_order: "billingOpsCheckOrphanRefund",
  refund_pending_unconfirmed: "billingOpsCheckRefundPending", chargeback_without_entry: "billingOpsCheckChargeback", paid_order_invoice_mismatch: "billingOpsCheckInvoice",
  refunded_order_credit_note_mismatch: "billingOpsCheckCreditNote", document_without_order: "billingOpsCheckOrphanDocument", holds_open_over_25h: "billingOpsCheckHolds",
  inconsistent_accounts: "billingOpsCheckAccounts", shadow_drift: "billingOpsCheckShadow",
};

export function Reconciliation() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [day, setDay] = useState<string>("");
  const [failure, setFailure] = useState("");
  const { run, pending, messages } = useOpsAction();
  const load = useCallback(async (date?: string) => {
    try {
      setData(await evalRequest<ReconciliationData>(`/billing/admin/reconciliation${date ? `?date=${date}` : ""}`));
      setFailure("");
    } catch (reason) { setFailure(error(reason)); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const runNow = () => {
    const key = newKey();
    void run(async () => {
      const result = await evalRequest<{ day: string; discrepancies: number }>("/billing/admin/reconciliation", "POST", day ? { date: day } : {}, key);
      return result.discrepancies ? tv("billingOpsReconcileFound", { count: result.discrepancies }) : t("billingOpsReconcileClean");
    }).then(async ok => { if (ok) await load(day || undefined); });
  };
  if (failure) return <Status error>{failure}</Status>;
  if (!data) return <TableSkeleton columns={4} />;
  const current = data.report;
  const report = current?.report ?? null;
  return (
    <section>
      <SectionHeading title={t("billingOpsReconciliation")} actions={
        <span className="p-row">
          <Field id="ob-reconcile-day" label={t("billingOpsDay")} type="date" max={today()} value={day} onChange={(event: ChangeEvent<HTMLInputElement>) => { setDay(event.target.value); if (event.target.value) void load(event.target.value); }} />
          <Action variant="secondary" disabled={pending} onClick={runNow}><RefreshCw aria-hidden="true" />{day ? t("billingOpsRunForDay") : t("billingOpsRunToday")}</Action>
        </span>
      }>
        {tv("billingOpsReconciliationHelp", { mode: humanize(data.mode) })}
      </SectionHeading>
      {messages}
      <StatGrid>
        <Stat label={t("billingOpsCleanStreak")} value={data.streak.days} meta={data.streak.since ? tv("billingOpsSince", { date: data.streak.since }) : t("billingOpsGateBNeeds")} />
        <Stat label={t("billingOpsDay")} value={current?.day ?? "—"} meta={current ? <Time value={current.generatedAt} /> : undefined} />
        <Stat label={t("billingOpsDiscrepancies")} value={current?.discrepancies ?? "—"} meta={current ? tv("billingOpsExplained", { count: current.explained }) : undefined} />
        <Stat label={t("billingOpsStripe")} value={report ? (report.stripe.checked ? tv("billingOpsStripeMatched", { count: report.stripe.matched }) : t("billingOpsStripeNotChecked")) : "—"}
          meta={report && !report.stripe.checked ? humanize(report.stripe.reason ?? "unavailable") : undefined} />
      </StatGrid>
      {current && current.discrepancies === 0 && <Status tone="success">{t("billingOpsReconcileCleanBanner")}</Status>}
      {current && current.discrepancies > 0 && <Status error>{tv("billingOpsReconcileFound", { count: current.discrepancies })}</Status>}
      {report && (
        <div className="p-split p-section">
          <section>
            <SectionHeading title={t("billingOpsChecks")} />
            <DataTable caption={t("billingOpsChecks")} headers={[t("billingOpsCheck"), { label: t("billingOpsCount"), align: "end" }]}>
              {Object.entries(report.checks).map(([name, check]) => (
                <tr key={name}>
                  <RowTitle meta={check.ids.length ? check.ids.slice(0, 3).map(short).join(", ") : undefined}>{CHECK_LABEL[name] ? t(CHECK_LABEL[name]) : humanize(name)}</RowTitle>
                  <td className="p-num">{check.count ? <Badge tone="fail" dot>{check.count}</Badge> : 0}</td>
                </tr>
              ))}
            </DataTable>
          </section>
          <section>
            <SectionHeading title={t("billingOpsStripe")} />
            {!report.stripe.checked ? <Status tone="warn">{t("billingOpsStripeNotCheckedHelp")}</Status> : (
              <DataTable caption={t("billingOpsStripe")} headers={[t("billingOpsCheck"), { label: t("billingOpsCount"), align: "end" }]}>
                <tr><RowTitle>{t("billingOpsStripeMatchedRow")}</RowTitle><td className="p-num">{report.stripe.matched}</td></tr>
                <tr><RowTitle meta={report.stripe.issues.slice(0, 3).map(item => short(item.orderId)).join(", ") || undefined}>{t("billingOpsStripeIssues")}</RowTitle><td className="p-num">{report.stripe.issues.length ? <Badge tone="fail" dot>{report.stripe.issues.length}</Badge> : 0}</td></tr>
                <tr><RowTitle meta={report.stripe.unpaidOrders.slice(0, 3).map(item => short(item.orderId)).join(", ") || undefined}>{t("billingOpsStripeUnpaid")}</RowTitle><td className="p-num">{report.stripe.unpaidOrders.length ? <Badge tone="fail" dot>{report.stripe.unpaidOrders.length}</Badge> : 0}</td></tr>
                <tr><RowTitle meta={t("billingOpsExplainedNote")}>{t("billingOpsStripeTiming")}</RowTitle><td className="p-num">{report.stripe.timing.length}</td></tr>
                <tr><RowTitle meta={t("billingOpsExplainedNote")}>{t("billingOpsStripeUnrelated")}</RowTitle><td className="p-num">{report.stripe.unrelated.length}</td></tr>
              </DataTable>
            )}
          </section>
        </div>
      )}
      <section className="p-section">
        <SectionHeading title={t("billingOpsReportHistory")} />
        {!data.reports.length ? <p className="p-cell-meta">{t("billingOpsNoReports")}</p> : (
          <DataTable caption={t("billingOpsReportHistory")} headers={[t("billingOpsDay"), { label: t("billingOpsDiscrepancies"), align: "end" }, { label: t("billingOpsExplainedShort"), align: "end" }, t("billingOpsStripe"), { label: t("billingOpsGenerated"), align: "end" }]}>
            {data.reports.slice(0, 30).map(row => (
              <tr key={row.id}>
                <RowTitle><button type="button" className="p-link-button" onClick={() => { setDay(row.day); void load(row.day); }}>{row.day}</button></RowTitle>
                <td className="p-num">{row.discrepancies ? <Badge tone="fail" dot>{row.discrepancies}</Badge> : 0}</td>
                <td className="p-num">{row.explained}</td>
                <td className="p-cell-meta">{row.stripeChecked ? t("billingOpsChecked") : t("billingOpsStripeNotChecked")}</td>
                <td className="p-table-action p-cell-meta"><Time value={row.generatedAt} /></td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </section>
  );
}

/* ------------------------------------------------------ manual invoices --- */

type InvoiceDoc = { id: string; org_id: string; kind: "invoice" | "credit_note"; status: string; number: string | null; series_code: string; gross_cents: number; operation_date: string; livemode: boolean; workspace: string; legal_name: string | null; country: string | null; pdf_attached: boolean; created_at: string };

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error(t("billingOpsPdfUnreadable")));
    reader.readAsDataURL(file);
  });
}

export function ManualInvoices() {
  const [status, setStatus] = useState<"pending_issue" | "queued" | "issued" | "voided">("pending_issue");
  const [rows, setRows] = useState<InvoiceDoc[] | null>(null);
  const [failure, setFailure] = useState("");
  const [dialog, setDialog] = useState<null | { kind: "issue" | "void"; doc: InvoiceDoc }>(null);
  const { run, pending, messages, clear } = useOpsAction();
  const load = useCallback(async () => {
    try { setRows((await evalRequest<{ documents: InvoiceDoc[] }>(`/billing/admin/invoices?status=${status}`)).documents); setFailure(""); } catch (reason) { setFailure(error(reason)); }
  }, [status]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const close = () => { setDialog(null); clear(); };
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("pdf");
    const key = newKey();
    const ok = await run(async () => {
      const pdfBase64 = file instanceof File && file.size ? await readBase64(file) : "";
      await evalRequest(`/billing/admin/invoices/${dialog.doc.id}`, "POST", { action: "issue", orgId: dialog.doc.org_id, kind: dialog.doc.kind,
        number: form.get("number"), issueDate: form.get("issueDate"), pdfBase64, verifactuStatus: form.get("verifactu") || undefined, reason: form.get("reason") }, key);
      return t("billingOpsInvoiceAttached");
    });
    if (ok) { close(); await load(); }
  }
  return (
    <section>
      <SectionHeading title={t("billingOpsInvoices")}>{t("billingOpsInvoicesHelp")}</SectionHeading>
      <div className="p-toolbar">
        <FilterChips value={status} onChange={setStatus} label={t("filterStatus")} options={[
          { value: "pending_issue", label: humanize("pending_issue") }, { value: "queued", label: humanize("queued") },
          { value: "issued", label: humanize("issued") }, { value: "voided", label: humanize("voided") },
        ]} />
      </div>
      {dialog === null && messages}
      {failure && <Status error>{failure}</Status>}
      {!rows ? <TableSkeleton columns={4} /> : !rows.length ? <p className="p-cell-meta">{t("billingOpsNoDocuments")}</p> : (
        <DataTable caption={t("billingOpsInvoices")} headers={[t("billingOpsDocument"), t("workspace"), { label: t("billingOpsGross"), align: "end" }, { label: t("billingOpsOperationDate"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
          {rows.map(doc => (
            <tr key={doc.id}>
              <RowTitle meta={[doc.number ?? `${doc.series_code}-…`, doc.livemode ? t("billingOpsLive") : t("billingOpsTestMode")].join(" · ")}>{t(doc.kind === "credit_note" ? "billingOpsCreditNote" : "billingOpsInvoice")}</RowTitle>
              <td>{doc.legal_name ?? doc.workspace}<span className="p-cell-meta p-cell-note">{doc.workspace}</span></td>
              <td className="p-num">{euros(doc.gross_cents)}</td>
              <td className="p-table-action p-cell-meta">{String(doc.operation_date).slice(0, 10)}</td>
              <td className="p-table-action">
                <span className="p-row">
                  {(doc.status === "pending_issue" || doc.status === "queued") && <Action variant="ghost" size="sm" onClick={() => setDialog({ kind: "issue", doc })}>{t("billingOpsAttach")}</Action>}
                  {!doc.livemode && doc.status !== "voided" && <Action variant="ghost" size="sm" onClick={() => setDialog({ kind: "void", doc })}>{t("billingOpsVoid")}</Action>}
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      <Modal alert={messages} open={dialog?.kind === "issue"} onOpenChange={value => !value && close()} title={t("billingOpsAttach")} description={t("billingOpsAttachHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-issue" disabled={pending}>{t("billingOpsAttach")}</Action></>}>
        <form id="ob-issue" className="p-stack" onSubmit={issue}>
          <div className="p-grid-2 p-form-grid">
            <Field id="ob-issue-number" name="number" label={t("billingOpsInvoiceNumber")} required minLength={3} maxLength={60} placeholder={dialog?.doc.livemode ? `${dialog.doc.series_code}-2026-0001` : `TEST-${dialog?.doc.series_code ?? "CAU"}-0001`} />
            <Field id="ob-issue-date" name="issueDate" type="date" label={t("billingOpsIssueDate")} required max={today()} />
          </div>
          <Field id="ob-issue-pdf" name="pdf" type="file" accept="application/pdf" label={t("billingOpsInvoicePdf")} required hint={t("billingOpsInvoicePdfHint")} />
          <SelectField id="ob-issue-verifactu" name="verifactu" label={t("billingOpsVerifactu")} defaultValue="">
            <option value="">{t("billingOpsNotRecorded")}</option>
            {["not_applicable", "pending", "accepted", "accepted_with_errors", "rejected"].map(value => <option key={value} value={value}>{humanize(value)}</option>)}
          </SelectField>
          <Field id="ob-issue-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
        </form>
      </Modal>
      <Modal alert={messages} open={dialog?.kind === "void"} onOpenChange={value => !value && close()} size="sm" title={t("billingOpsVoid")} description={t("billingOpsVoidHelp")}
        footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-void" variant="danger" disabled={pending}>{t("billingOpsVoid")}</Action></>}>
        <form id="ob-void" className="p-stack" onSubmit={event => {
          event.preventDefault();
          if (!dialog) return;
          const reason = new FormData(event.currentTarget).get("reason");
          const key = newKey();
          void run(async () => {
            await evalRequest(`/billing/admin/invoices/${dialog.doc.id}`, "POST", { action: "void", orgId: dialog.doc.org_id, kind: dialog.doc.kind, reason }, key);
            return t("billingOpsVoided");
          }).then(async ok => { if (ok) { close(); await load(); } });
        }}>
          <Field id="ob-void-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
        </form>
      </Modal>
    </section>
  );
}

/* -------------------------------------------------------- monthly export --- */

type ExportSummary = {
  month: string; livemode: boolean; complete: boolean; checks: Record<string, number>; orders: number; documentsToIssue: number; chargebacks: number;
  sales: Array<{ tax_treatment: string; orders: number; net_cents: number; vat_cents: number; gross_cents: number; credits: number }>;
  purchasedCredits: Record<string, { credits: number; eur: number }>; files: string[];
  reconciliation: { reconciled: boolean; issues: number; unmatched: number } | null; stripeNote: string | null;
};
const BUCKETS = ["opening", "purchased", "consumed", "returned", "refunded", "expired", "charged_back", "adjusted", "closing"];

export function MonthlyExport() {
  const previous = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const [month, setMonth] = useState(previous);
  const [mode, setMode] = useState<"" | "test" | "live">("");
  const [stripe, setStripe] = useState(false);
  const [data, setData] = useState<ExportSummary | null>(null);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(false);
  const query = `month=${month}${mode ? `&mode=${mode}` : ""}${stripe ? "&stripe=1" : ""}`;
  const load = useCallback(async () => {
    setLoading(true);
    try { const next = await evalRequest<ExportSummary>(`/billing/admin/export?${query}`); setData(next); setFailure(""); } catch (reason) { setFailure(error(reason)); } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const resolvedMode = mode || (data ? (data.livemode ? "live" : "test") : "");
  return (
    <section>
      <SectionHeading title={t("billingOpsExport")}>{t("billingOpsExportHelp")}</SectionHeading>
      <div className="p-toolbar p-row">
        <Field id="ob-export-month" label={t("billingOpsMonth")} type="month" value={month} onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.value && setMonth(event.target.value)} />
        <SelectField id="ob-export-mode" label={t("billingOpsMode")} value={resolvedMode} onChange={event => setMode(event.target.value as "test" | "live")}>
          <option value="live">{t("billingOpsLive")}</option>
          <option value="test">{t("billingOpsTestMode")}</option>
        </SelectField>
        <Check checked={stripe} onChange={event => setStripe(event.target.checked)} label={t("billingOpsReconcileStripe")} />
      </div>
      {failure && <Status error>{failure}</Status>}
      {!data || loading ? <TableSkeleton columns={3} /> : (
        <>
          {!data.livemode && <Status tone="warn">{t("billingOpsExportTestMode")}</Status>}
          {data.stripeNote && <Status tone="warn">{t("billingOpsStripeNotCheckedHelp")}</Status>}
          <StatGrid>
            <Stat label={t("billingOpsOrders")} value={data.orders} meta={data.complete ? t("billingOpsMonthComplete") : t("billingOpsMonthOpen")} />
            <Stat label={t("billingOpsDocumentsToIssue")} value={data.documentsToIssue} />
            <Stat label={t("billingOpsChecksNeedingReview")} value={Object.entries(data.checks).filter(([name, value]) => name !== "documents_to_issue" && value > 0).length} />
            <Stat label={t("billingOpsStripe")} value={data.reconciliation ? (data.reconciliation.reconciled ? t("billingOpsReconciled") : tv("billingOpsReconcileFound", { count: data.reconciliation.issues })) : t("billingOpsStripeNotChecked")} />
          </StatGrid>
          <div className="p-split p-section">
            <section>
              <SectionHeading title={t("billingOpsSales")} />
              {!data.sales.length ? <p className="p-cell-meta">{t("billingOpsNoSales")}</p> : (
                <DataTable caption={t("billingOpsSales")} headers={[t("billingOpsTreatment"), { label: t("billingOpsNet"), align: "end" }, { label: t("billingOpsVat"), align: "end" }, { label: t("billingOpsGross"), align: "end" }]}>
                  {data.sales.map(row => (
                    <tr key={row.tax_treatment}>
                      <RowTitle meta={tv("billingOpsOrdersCount", { count: row.orders })}>{treatmentLabel(row.tax_treatment)}</RowTitle>
                      <td className="p-num">{euros(row.net_cents)}</td><td className="p-num">{euros(row.vat_cents)}</td><td className="p-num">{euros(row.gross_cents)}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </section>
            <section>
              <SectionHeading title={t("billingOpsDeferred")} />
              <DataTable caption={t("billingOpsDeferred")} headers={[t("billingOpsBucket"), { label: t("billingOpsCredits"), align: "end" }, { label: "€", align: "end" }]}>
                {BUCKETS.filter(bucket => data.purchasedCredits[bucket]).map(bucket => (
                  <tr key={bucket}><RowTitle>{humanize(bucket)}</RowTitle><td className="p-num">{credits(data.purchasedCredits[bucket].credits)}</td><td className="p-num">{credits(data.purchasedCredits[bucket].eur)}</td></tr>
                ))}
              </DataTable>
            </section>
          </div>
          <section className="p-section">
            <SectionHeading title={t("billingOpsFiles")} />
            <div className="p-row p-wrap">
              {data.files.map(file => (
                <a key={file} className="p-btn" data-variant="secondary" href={`/api/evals/v1/billing/admin/export?${query}${mode ? "" : `&mode=${resolvedMode}`}&file=${file}`} download>
                  <Download aria-hidden="true" />{file}
                </a>
              ))}
            </div>
            <p className="p-field-hint">{t("billingOpsFilesHelp")}</p>
          </section>
        </>
      )}
    </section>
  );
}

/* ----------------------------------------------------------- fraud queue --- */

type Fraud = {
  signups: Array<{ org_id: string; workspace: string; created_at: string; domain: string | null; hosts: number; runs_last_day: number; flags: string[] }>;
  velocity: Array<{ org_id: string; workspace: string; orders_24h: number; orders: number; failed: number; paid_net_cents: number }>;
  flagged_orders: Array<{ order_id: string; org_id: string; workspace: string; status: string; livemode: boolean; net_cents: number; card_country: string | null; flags: string[]; created_at: string }>;
  disputes: Array<{ order_id: string; org_id: string; workspace: string; status: string; livemode: boolean; net_cents: number; updated_at: string }>;
  frozen_accounts: Array<{ org_id: string; workspace: string; frozen_reason: string; available: string; updated_at: string }>;
};

export function FraudQueue() {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [data, setData] = useState<Fraud | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void evalRequest<Fraud>(`/billing/admin/fraud?days=${days}`).then(next => { setData(next); setFailure(""); }).catch(reason => setFailure(error(reason)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [days]);
  const link = (orgId: string, label: string) => <Link href={accountHref(orgId)}>{label}</Link>;
  if (failure) return <Status error>{failure}</Status>;
  const total = data ? data.signups.length + data.velocity.length + data.flagged_orders.length + data.disputes.length + data.frozen_accounts.length : 0;
  return (
    <section>
      <SectionHeading title={t("billingOpsFraud")}>{t("billingOpsFraudHelp")}</SectionHeading>
      <div className="p-toolbar">
        <FilterChips value={days} onChange={setDays} label={t("billingOpsPeriod")} options={[{ value: "7", label: tv("billingOpsDays", { n: 7 }) }, { value: "30", label: tv("billingOpsDays", { n: 30 }) }, { value: "90", label: tv("billingOpsDays", { n: 90 }) }]} />
      </div>
      {!data ? <TableSkeleton columns={4} /> : !total ? <EmptyState title={t("billingOpsFraudEmpty")}><p>{t("billingOpsFraudEmptyHelp")}</p></EmptyState> : (
        <>
          {data.disputes.length > 0 && (
            <section className="p-section">
              <SectionHeading title={t("billingOpsDisputes")} />
              <DataTable caption={t("billingOpsDisputes")} headers={[t("workspace"), t("statusLabel"), { label: t("billingOpsNet"), align: "end" }, { label: t("billingOpsUpdated"), align: "end" }]}>
                {data.disputes.map(row => <tr key={row.order_id}><RowTitle meta={short(row.order_id)}>{link(row.org_id, row.workspace)}</RowTitle><td><StatusBadge value={row.status} /></td><td className="p-num">{euros(row.net_cents)}</td><td className="p-table-action p-cell-meta"><Time value={row.updated_at} /></td></tr>)}
              </DataTable>
            </section>
          )}
          {data.frozen_accounts.length > 0 && (
            <section className="p-section">
              <SectionHeading title={t("billingOpsFrozenAccounts")} />
              <DataTable caption={t("billingOpsFrozenAccounts")} headers={[t("workspace"), t("billingOpsReason"), { label: t("billingOpsAvailable"), align: "end" }]}>
                {data.frozen_accounts.map(row => <tr key={row.org_id}><RowTitle>{link(row.org_id, row.workspace)}</RowTitle><td className="p-cell-meta">{row.frozen_reason}</td><td className="p-num">{credits(row.available)}</td></tr>)}
              </DataTable>
            </section>
          )}
          {data.flagged_orders.length > 0 && (
            <section className="p-section">
              <SectionHeading title={t("billingOpsFlaggedOrders")} />
              <DataTable caption={t("billingOpsFlaggedOrders")} headers={[t("workspace"), t("billingOpsFlags"), { label: t("billingOpsNet"), align: "end" }, { label: t("createdAt"), align: "end" }]}>
                {data.flagged_orders.map(row => <tr key={row.order_id}><RowTitle meta={[short(row.order_id), row.livemode ? t("billingOpsLive") : t("billingOpsTestMode")].join(" · ")}>{link(row.org_id, row.workspace)}</RowTitle><td className="p-cell-meta">{row.flags.map(humanize).join(", ")}</td><td className="p-num">{euros(row.net_cents)}</td><td className="p-table-action p-cell-meta"><Time value={row.created_at} /></td></tr>)}
              </DataTable>
            </section>
          )}
          {data.velocity.length > 0 && (
            <section className="p-section">
              <SectionHeading title={t("billingOpsVelocity")}>{t("billingOpsVelocityHelp")}</SectionHeading>
              <DataTable caption={t("billingOpsVelocity")} headers={[t("workspace"), { label: t("billingOpsOrders24h"), align: "end" }, { label: t("billingOpsFailedPayments"), align: "end" }, { label: t("billingOpsPaidNet"), align: "end" }]}>
                {data.velocity.map(row => <tr key={row.org_id}><RowTitle>{link(row.org_id, row.workspace)}</RowTitle><td className="p-num">{row.orders_24h}</td><td className="p-num">{row.failed}</td><td className="p-num">{euros(row.paid_net_cents)}</td></tr>)}
              </DataTable>
            </section>
          )}
          {data.signups.length > 0 && (
            <section className="p-section">
              <SectionHeading title={t("billingOpsFlaggedSignups")}>{t("billingOpsFlaggedSignupsHelp")}</SectionHeading>
              <DataTable caption={t("billingOpsFlaggedSignups")} headers={[t("workspace"), t("billingOpsFlags"), { label: t("billingOpsHosts"), align: "end" }, { label: t("createdAt"), align: "end" }]}>
                {data.signups.map(row => <tr key={row.org_id}><RowTitle meta={row.domain ?? undefined}>{link(row.org_id, row.workspace)}</RowTitle><td className="p-cell-meta">{row.flags.map(humanize).join(", ")}</td><td className="p-num">{row.hosts}</td><td className="p-table-action p-cell-meta"><Time value={row.created_at} /></td></tr>)}
              </DataTable>
            </section>
          )}
        </>
      )}
    </section>
  );
}
