"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Inbox, Users } from "lucide-react";
import {
  REVIEW_SECTORS, missingOnboarding, slaState,
  type ExpertOnboardingInput, type ReviewScope, type ReviewSector,
} from "@/lib/evals/experts/review-contracts";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";
import { expertReviewLabel } from "@/lib/evals/reports/summary";
import { evalRequest } from "./api";
import { SECTOR_LABEL } from "./expert-review-request";
import { CodeBlock, SidePanel, notify } from "./overlays";
import {
  Action, ActionLink, Badge, Card, Check, DataTable, DefinitionList, EmptyState, Field, Loading, PageHeading,
  RowTitle, SelectField, Status, StatusBadge, TextArea, Toolbar, formatDate, formatMoney,
} from "./primitives";
import { usePageCrumb } from "./workspace-context";

/*
 * Ops side of expert review (launch L-26, spec v2 P-10, P-32, P-33): the
 * requests customers send from reports, turning one into an order with a
 * hand-written quote and redacted assignments, publishing the reviewed
 * revision, and the expert bench's onboarding checklist. Nothing here pays
 * anyone or charges credits; quotes and expert payments are handled by hand.
 */

type RequestStatus = "requested" | "quoted" | "ordered" | "delivered" | "declined";
type RequestRow = {
  id: string; org_id: string; workspace: string | null; report_title: string | null; report_id: string; scope_kind: ReviewScope;
  sector: ReviewSector; status: RequestStatus; created_at: string; reply_due_at: string; replied_at: string | null;
  due_at: string | null; delivered_at: string | null; order_id: string | null; order_status: string | null; reviewer_count: number | null;
};
const SCOPE_LABEL: Record<ReviewScope, MessageKey> = { failed_answers: "erScopeFailed", whole_report: "erScopeWhole", findings: "erScopeFindings", pilot: "erScopePilot" };
const STATUS_LABEL: Record<RequestStatus, MessageKey> = { requested: "erStatusRequested", quoted: "erStatusQuoted", ordered: "erStatusOrdered", delivered: "erStatusDelivered", declined: "erStatusDeclined" };
const sectorLabel = (value: string) => (value in SECTOR_LABEL ? t(SECTOR_LABEL[value as ReviewSector]) : value);

/** Overdue, due within a day, on time or done, for a reply or an order. */
export function SlaBadge({ due, done, kind }: { due: string | null; done: boolean; kind: "reply" | "due" }) {
  const state = slaState(due, done);
  if (state === "none" || state === "done") return null;
  const tone = state === "overdue" ? "fail" : state === "due_soon" ? "warn" : "neutral";
  const text = state === "overdue" ? t(kind === "reply" ? "erReplyOverdue" : "erOverdue") : tv(kind === "reply" ? "erReplyDue" : "erDue", { date: formatDate(due, true) });
  return <Badge tone={tone} dot>{text}</Badge>;
}

function requestSla(row: Pick<RequestRow, "status" | "reply_due_at" | "replied_at" | "due_at" | "delivered_at">) {
  if (row.status === "requested") return <SlaBadge due={row.reply_due_at} done={!!row.replied_at} kind="reply" />;
  if (row.status === "ordered") return <SlaBadge due={row.due_at} done={!!row.delivered_at} kind="due" />;
  return null;
}

/* ------------------------------------------------------------- requests --- */

export function ReviewRequestList() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    evalRequest<RequestRow[]>("/expert-reviews").then((data) => { if (live) setRows(data); }).catch(() => { if (live) setError(t("erLoadFailed")); });
    return () => { live = false; };
  }, []);
  if (error) return <Status error>{error}</Status>;
  if (!rows) return <Loading>{t("erLoading")}</Loading>;
  if (!rows.length) return <EmptyState title={t("erNoRequests")} icon={<Inbox />}><p>{t("erNoRequestsHelp")}</p></EmptyState>;
  return (
    <DataTable caption={t("erRequestsCaption")} headers={[t("erColRequest"), t("erColScope"), t("erColStatus"), t("erColSla"), { label: "", align: "end" }]}>
      {rows.map((row) => (
        <tr key={row.id} data-review-request-row={row.status}>
          <RowTitle href={`/ops/experts/reviews/${row.id}`} meta={`${row.report_title ?? "—"} · ${formatDate(row.created_at, true)}`}>{row.workspace ?? "—"}</RowTitle>
          <td>{t(SCOPE_LABEL[row.scope_kind])}<span className="p-cell-meta"> · {sectorLabel(row.sector)}</span></td>
          <td><StatusBadge value={row.status} label={t(STATUS_LABEL[row.status])} /></td>
          <td>{requestSla(row) ?? (row.status === "delivered" ? <span className="p-cell-meta">{tv(row.reviewer_count === 1 ? "erDeliveredByOne" : "erDeliveredBy", { count: row.reviewer_count ?? 0, date: formatDate(row.delivered_at) })}</span> : <span className="p-cell-meta">—</span>)}</td>
          <td className="p-table-action"><ActionLink size="sm" variant="secondary" href={`/ops/experts/reviews/${row.id}`}>{t("erOpen")}</ActionLink></td>
        </tr>
      ))}
    </DataTable>
  );
}

/* --------------------------------------------------------------- detail --- */

type BenchRow = {
  /** The expert's display name (ops only; null when the account has none). */
  id: string; user_id: string; name?: string | null; domains: string[]; languages: string[]; credentials_status: string; terms_status: string; eligibility_status: string;
  onboarding: (Partial<ExpertOnboardingInput> & { updated_at?: string }) | null; ready: boolean; missing: string[];
};
type Detail = {
  request: RequestRow & { surface: string; scope_note: string | null; deadline: string | null; locale: string; close_reason: string | null };
  draft: { id: string; summary: Record<string, unknown>; created_at: string } | null;
  report: { title: string; currentRevisionId: string | null; reviewStatus: string | null; expertReview: { reviewer_count: number; reviewed_on: string; scope: string } | null } | null;
  results: Array<{ id: string; title: string; topic: string; outcome: string; severity: string; label: string | null }>;
  order: null | { id: string; scope: string; sector: string; due_at: string; quote_amount: string; quote_currency: string; quote_note: string; status: string; reviewer_count: number | null; delivered_at: string | null; created_at: string; result_revision_id: string | null; cancel_reason: string | null };
  assignments: Array<{ id: string; status: string; due_at: string | null; expert_user_id: string; expert_name?: string | null; revisions: number; submitted_at: string | null }>;
  progress: { reviewer_count: number; assignment_count: number };
};

/** An expert as operators read them: the account's name, else the start of the user id. */
function expertLabel(name: string | null | undefined, userId: string) {
  return name?.trim() || `${userId.slice(0, 12)}…`;
}

function dueIso(date: string) {
  // The end of the chosen day in the operator's time zone.
  const value = new Date(`${date}T18:00:00`);
  return Number.isNaN(value.getTime()) ? "" : value.toISOString();
}

export function ReviewRequestDetail({ requestId }: { requestId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [bench, setBench] = useState<BenchRow[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    try {
      const [next, experts] = await Promise.all([
        evalRequest<Detail>(`/expert-reviews/${encodeURIComponent(requestId)}`),
        evalRequest<BenchRow[]>("/expert-bench").catch(() => [] as BenchRow[]),
      ]);
      setDetail(next); setBench(experts); setError("");
    } catch { setError(t("erLoadFailed")); }
  }, [requestId]);
  useEffect(() => { void load(); }, [load]);
  usePageCrumb(detail?.request.workspace ?? undefined);

  async function act(path: string, method: string, body: unknown, done: string, key?: string) {
    setPending(true); setError("");
    try { await evalRequest(path, method, body, key); notify(done); await load(); return true; }
    catch (caught) { setError(caught instanceof Error && caught.message ? caught.message : t("erActionFailed")); return false; }
    finally { setPending(false); }
  }

  if (error && !detail) return <Status error>{error}</Status>;
  if (!detail) return <Loading>{t("erLoading")}</Loading>;
  const { request, order } = detail;
  const open = request.status === "requested" || request.status === "quoted";
  const reportHref = `/workspace/reports/${request.report_id}?orgId=${encodeURIComponent(request.org_id)}`;
  return (
    <div className="p-stack">
      <PageHeading
        title={`${request.workspace ?? "—"} · ${detail.report?.title ?? t("report")}`}
        meta={<><StatusBadge value={request.status} label={t(STATUS_LABEL[request.status])} />{requestSla(request)}</>}
        actions={<ActionLink variant="secondary" href={reportHref}>{t("erOpenReport")}</ActionLink>}
      >
        {open ? t("erDetailIntro") : null}
      </PageHeading>
      {error && <Status error>{error}</Status>}
      <div className="p-grid p-grid-2">
        <Card title={t("erRequestCard")}>
          <DefinitionList items={[
            { term: t("erRequestedOn"), value: formatDate(request.created_at, true) },
            { term: t("erColScope"), value: t(SCOPE_LABEL[request.scope_kind]) },
            { term: t("erNote"), value: request.scope_note ?? "—" },
            { term: t("erDeadline"), value: request.deadline ? formatDate(request.deadline) : "—" },
            { term: t("erSector"), value: sectorLabel(request.sector) },
            { term: t("erLanguage"), value: request.locale === "es" ? "Español" : "English" },
            { term: t("erReplyBy"), value: request.replied_at ? tv("erRepliedOn", { date: formatDate(request.replied_at, true) }) : formatDate(request.reply_due_at, true) },
            ...(request.close_reason ? [{ term: t("erCloseReason"), value: request.close_reason }] : []),
          ]} />
          {open && <RequestActions pending={pending} quoted={request.status === "quoted"}
            onQuoted={() => void act(`/expert-reviews/${requestId}`, "PATCH", { action: "quoted" }, t("erQuotedDone"))}
            onDecline={(reason) => act(`/expert-reviews/${requestId}`, "PATCH", { action: "declined", reason }, t("erDeclinedDone"))} />}
        </Card>
        <Card title={t("erCrmDraft")}>
          <p className="p-field-hint">{t("erCrmDraftHelp")}</p>
          {/* The raw handoff opens on demand, so the card stays the height of its neighbour (launch U1). */}
          {detail.draft ? (
            <details className="p-details">
              <summary>{t("erCrmDraftShow")}</summary>
              <CodeBlock label={t("erCrmDraftLabel")} code={JSON.stringify(detail.draft.summary, null, 2)} />
            </details>
          ) : <p>—</p>}
        </Card>
      </div>
      {!order && open && <OrderForm detail={detail} bench={bench} pending={pending} requestId={requestId}
        onCreate={(body, key) => act(`/expert-reviews/${requestId}/order`, "POST", body, t("erOrderCreated"), key)} />}
      {order && <OrderCard detail={detail} pending={pending}
        onPublish={(note) => act(`/expert-reviews/${requestId}/order`, "PATCH", { action: "publish", orderId: order.id, note: note || null }, t("erPublished"))}
        onCancel={(reason) => act(`/expert-reviews/${requestId}/order`, "PATCH", { action: "cancel", orderId: order.id, reason }, t("erOrderCanceled"))} />}
    </div>
  );
}

function RequestActions({ pending, quoted, onQuoted, onDecline }: { pending: boolean; quoted: boolean; onQuoted: () => void; onDecline: (reason: string) => Promise<boolean> }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="p-stack">
      <Toolbar>
        {!quoted && <Action variant="secondary" onClick={onQuoted} disabled={pending}>{t("erMarkQuoted")}</Action>}
        <Action variant="ghost" onClick={() => setDeclining((value) => !value)} disabled={pending}>{t("erDecline")}</Action>
      </Toolbar>
      {declining && (
        <div className="p-stack">
          <TextArea id="decline-reason" label={t("erDeclineReason")} rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          <Action variant="secondary" disabled={pending || !reason.trim()} onClick={() => void onDecline(reason.trim()).then((ok) => { if (ok) setDeclining(false); })}>{t("erDeclineConfirm")}</Action>
        </div>
      )}
    </div>
  );
}

const FAILING = new Set(["fail", "partial"]);

function OrderForm({ detail, bench, pending, requestId, onCreate }: {
  detail: Detail; bench: BenchRow[]; pending: boolean; requestId: string;
  onCreate: (body: unknown, key: string) => Promise<boolean>;
}) {
  const { request, results } = detail;
  const defaults = useMemo(() => results.filter((item) => request.scope_kind !== "failed_answers" || FAILING.has(item.outcome)).map((item) => item.id), [results, request.scope_kind]);
  const [scope, setScope] = useState(() => `${t(SCOPE_LABEL[request.scope_kind])}${request.scope_note ? `: ${request.scope_note}` : ""}`.slice(0, 300));
  const [sector, setSector] = useState<string>(request.sector);
  const [due, setDue] = useState(request.deadline ?? "");
  const [amount, setAmount] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [experts, setExperts] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(defaults);
  const [cleared, setCleared] = useState(false);
  const [preview, setPreview] = useState<{ key: string; excerpts: Array<{ anchor: string; text: string }> } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const selection = JSON.stringify([...selected].sort());
  const ready = bench.filter((item) => item.ready);
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((item) => item !== id));

  async function check() {
    setPreviewError("");
    try {
      const result = await evalRequest<{ excerpts: Array<{ anchor: string; text: string }> }>(`/expert-reviews/${requestId}/excerpts`, "POST", { resultIds: selected });
      setPreview({ key: selection, excerpts: result.excerpts });
    } catch { setPreviewError(t("erPreviewFailed")); }
  }
  const checked = preview?.key === selection;
  const valid = scope.trim().length >= 3 && due && /^\d{1,10}(?:\.\d{1,2})?$/.test(amount) && quoteNote.trim() && experts.length > 0 && selected.length > 0 && cleared && checked;
  return (
    <Card title={t("erCreateOrder")}>
      <div className="p-stack">
      <p className="p-field-hint">{t("erCreateOrderHelp")}</p>
      <div className="p-form-grid">
        <Field id="order-scope" label={t("erOrderScope")} hint={t("erOrderScopeHint")} maxLength={300} value={scope} onChange={(event) => setScope(event.target.value)} />
        <SelectField id="order-sector" label={t("erSector")} value={sector} onChange={(event) => setSector(event.target.value)}>
          {REVIEW_SECTORS.map((value) => <option key={value} value={value}>{sectorLabel(value)}</option>)}
        </SelectField>
        <Field id="order-due" type="date" label={t("erOrderDue")} value={due} onChange={(event) => setDue(event.target.value)} />
        <Field id="order-amount" inputMode="decimal" label={t("erQuoteAmount")} hint={t("erQuoteAmountHint")} placeholder="1500.00" value={amount} onChange={(event) => setAmount(event.target.value.trim())} />
      </div>
      <TextArea id="order-quote" label={t("erQuoteNote")} hint={t("erQuoteNoteHint")} rows={3} maxLength={4000} value={quoteNote} onChange={(event) => setQuoteNote(event.target.value)} />
      <fieldset className="p-fieldset">
        <legend>{t("erExperts")}</legend>
        {!bench.length ? <p className="p-field-hint">{t("erNoExperts")}</p> : (
          <div className="eval-review-scopes">
            {bench.map((item) => (
              <Check key={item.id} label={`${expertLabel(item.name, item.user_id)} · ${item.domains.join(", ")}`}
                description={item.ready ? (item.onboarding?.sectors?.length ? item.onboarding.sectors.map(sectorLabel).join(", ") : t("erReady")) : tv("erNotReadyMissing", { items: item.missing.map((miss) => t(missingLabel(miss))).join(", ") })}
                disabled={!item.ready} checked={experts.includes(item.id)} onChange={(event) => setExperts((list) => toggle(list, item.id, event.target.checked))} />
            ))}
          </div>
        )}
        {bench.length > 0 && !ready.length && <Status tone="warn">{t("erNoReadyExperts")}</Status>}
      </fieldset>
      <fieldset className="p-fieldset">
        <legend>{tv("erResults", { selected: selected.length, total: results.length })}</legend>
        <div className="eval-review-scopes" data-order-results>
          {results.map((item) => (
            <Check key={item.id} label={item.title} description={`${item.topic} · ${item.outcome} · ${item.severity}`}
              checked={selected.includes(item.id)} onChange={(event) => setSelected((list) => toggle(list, item.id, event.target.checked))} />
          ))}
        </div>
      </fieldset>
      <Check label={t("erConflictsCleared")} description={t("erConflictsClearedHelp")} checked={cleared} onChange={(event) => setCleared(event.target.checked)} />
      <Toolbar>
        <Action variant="secondary" onClick={() => void check()} disabled={pending || !selected.length}>{t("erPreview")}</Action>
        <Action disabled={pending || !valid} onClick={() => void onCreate({
          orgId: request.org_id, scope: scope.trim(), sector, dueAt: dueIso(due), quoteAmount: amount, quoteCurrency: "EUR",
          quoteNote: quoteNote.trim(), expertProfileIds: experts, resultIds: selected, conflictsCleared: true,
        }, key)}>{t("erCreateOrderAction")}</Action>
      </Toolbar>
      {!checked && <p className="p-field-hint">{t("erPreviewFirst")}</p>}
      {previewError && <Status error>{previewError}</Status>}
      {preview && checked && (
        <section className="p-stack" aria-label={t("erPreviewTitle")} data-order-preview>
          <h3>{tv("erPreviewCount", { count: preview.excerpts.length })}</h3>
          {preview.excerpts.map((excerpt) => <article className="eval-evidence" key={excerpt.anchor}><p className="p-eyebrow">{excerpt.anchor}</p><p style={{ whiteSpace: "pre-wrap" }}>{excerpt.text}</p></article>)}
        </section>
      )}
      </div>
    </Card>
  );
}

function OrderCard({ detail, pending, onPublish, onCancel }: { detail: Detail; pending: boolean; onPublish: (note: string) => Promise<boolean>; onCancel: (reason: string) => Promise<boolean> }) {
  const order = detail.order!;
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const reviewers = detail.progress.reviewer_count;
  const hours = order.delivered_at ? Math.round(((Date.parse(order.delivered_at) - Date.parse(detail.request.created_at)) / 3_600_000) * 10) / 10 : null;
  const preview = reviewers > 0 ? expertReviewLabel({ reviewer_count: reviewers, reviewed_on: new Date().toISOString(), scope: order.scope }, getLocale()) : null;
  return (
    <Card title={t("erOrderCard")}>
      <div className="p-stack">
      <DefinitionList items={[
        { term: t("erOrderScope"), value: order.scope },
        { term: t("erSector"), value: sectorLabel(order.sector) },
        { term: t("erOrderDue"), value: <>{formatDate(order.due_at, true)} {order.status === "open" && <SlaBadge due={order.due_at} done={false} kind="due" />}</> },
        { term: t("erQuote"), value: `${formatMoney(order.quote_amount, order.quote_currency)} · ${order.quote_note}` },
        { term: t("erColStatus"), value: <StatusBadge value={order.status} label={t(order.status === "open" ? "erOrderOpen" : order.status === "delivered" ? "erStatusDelivered" : "erOrderCanceledLabel")} /> },
        { term: t("erReviewers"), value: tv("erReviewersOf", { reviewers, total: detail.progress.assignment_count }) },
        ...(hours !== null ? [{ term: t("erTimeToReview"), value: hours < 1 ? t("erHoursUnderOne") : tv("erHours", { hours }) }] : []),
        ...(order.cancel_reason ? [{ term: t("erCloseReason"), value: order.cancel_reason }] : []),
      ]} />
      <DataTable caption={t("erAssignments")} headers={[t("expertColExpert"), t("expertColStatus"), t("erSubmitted"), t("erColDue")]}>
        {detail.assignments.map((item) => (
          <tr key={item.id}>
            <RowTitle meta={item.revisions === 1 ? t("erRevisionsOne") : tv("erRevisions", { count: item.revisions })}>
              {item.expert_name ? <span title={item.expert_user_id}>{item.expert_name}</span> : <code className="p-code" title={item.expert_user_id}>{item.expert_user_id.slice(0, 12)}</code>}
            </RowTitle>
            <td><StatusBadge value={item.status} /></td>
            <td>{item.submitted_at ? formatDate(item.submitted_at, true) : "—"}</td>
            <td>{formatDate(item.due_at)}</td>
          </tr>
        ))}
      </DataTable>
      {order.status === "open" && (
        <div className="p-stack">
          <TextArea id="order-note" label={t("erPublishNote")} hint={t("erPublishNoteHint")} rows={3} maxLength={1500} value={note} onChange={(event) => setNote(event.target.value)} />
          {preview ? <Status tone="info">{tv("erLabelPreview", { label: preview })}</Status> : <Status tone="warn">{t("erNoSubmissions")}</Status>}
          <Toolbar>
            <Action disabled={pending || reviewers < 1} onClick={() => void onPublish(note.trim())}>{t("erPublish")}</Action>
            <Action variant="ghost" disabled={pending} onClick={() => setCancelling((value) => !value)}>{t("erCancelOrder")}</Action>
          </Toolbar>
          {cancelling && (
            <div className="p-stack">
              <TextArea id="cancel-reason" label={t("erDeclineReason")} rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
              <Action variant="secondary" disabled={pending || !reason.trim()} onClick={() => void onCancel(reason.trim())}>{t("erCancelConfirm")}</Action>
            </div>
          )}
        </div>
      )}
      {order.status === "delivered" && detail.report?.expertReview && (
        <Status tone="success">{expertReviewLabel(detail.report.expertReview, getLocale())}</Status>
      )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- bench --- */

const MISSING_LABEL: Record<string, MessageKey> = {
  credentials: "erMissingCredentials", contract: "erMissingContract", ip_assignment: "erMissingIp", confidentiality: "erMissingConfidentiality",
  dpa: "erMissingDpa", trial: "erMissingTrial", agreement: "erMissingAgreement", availability: "erMissingAvailability",
  profile_credentials: "erMissingProfileCredentials", profile_terms: "erMissingProfileTerms", profile_eligibility: "erMissingProfileEligibility",
};
const missingLabel = (key: string): MessageKey => MISSING_LABEL[key] ?? "erMissingAvailability";
const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : "");
const at = (value: string) => (value ? new Date(`${value}T12:00:00Z`).toISOString() : null);

export function ExpertBench() {
  const [rows, setRows] = useState<BenchRow[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<BenchRow | null>(null);
  const load = useCallback(() => evalRequest<BenchRow[]>("/expert-bench").then((data) => { setRows(data); setError(""); }).catch(() => setError(t("erLoadFailed"))), []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <Status error>{error}</Status>;
  if (!rows) return <Loading>{t("erLoading")}</Loading>;
  if (!rows.length) return <EmptyState title={t("expertNoProfiles")} icon={<Users />}><p>{t("expertNoProfilesHelp")}</p></EmptyState>;
  return (
    <>
      <p className="p-field-hint">{t("erBenchIntro")}</p>
      <div className="p-grid">
        {rows.map((row) => (
          <Card key={row.id} title={expertLabel(row.name, row.user_id)} actions={<Action size="sm" variant="secondary" onClick={() => setEditing(row)}>{t("erEditChecklist")}</Action>}>
            <div className="p-row">
              {row.ready ? <Badge tone="pass" dot>{t("erReady")}</Badge> : <Badge tone="warn" dot>{t("erNotReady")}</Badge>}
              <StatusBadge value={row.eligibility_status} />
            </div>
            <p className="p-cell-meta">{row.domains.join(", ")} · {row.languages.join(", ")}</p>
            {row.onboarding?.sectors?.length ? <p className="p-cell-meta">{t("erRoster")}: {row.onboarding.sectors.map(sectorLabel).join(", ")}</p> : null}
            {!row.ready && <p className="p-cell-meta" data-bench-missing>{tv("erNotReadyMissing", { items: row.missing.map((key) => t(missingLabel(key))).join(", ") })}</p>}
          </Card>
        ))}
      </div>
      {editing && <BenchEditor row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </>
  );
}

function BenchEditor({ row, onClose, onSaved }: { row: BenchRow; onClose: () => void; onSaved: () => void }) {
  const o = row.onboarding ?? {};
  const [form, setForm] = useState({
    credentials: day(o.credentials_verified_at), contract: day(o.contract_signed_at), ip: !!o.ip_assignment, confidentiality: !!o.confidentiality,
    dpa: day(o.dpa_signed_at), trialDone: day(o.trial_completed_at), trialPaid: day(o.trial_paid_at),
    items: o.trial_gold_items == null ? "" : String(o.trial_gold_items), agreement: o.trial_agreement == null ? "" : String(Math.round(Number(o.trial_agreement) * 100)),
    threshold: String(Math.round(Number(o.agreement_threshold ?? 0.8) * 100)), sectors: (o.sectors ?? []) as ReviewSector[],
    availability: (o.availability ?? "unavailable") as "available" | "limited" | "unavailable", hours: o.hours_per_week == null ? "" : String(o.hours_per_week), notes: o.notes ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const body: ExpertOnboardingInput = {
    credentials_verified_at: at(form.credentials), contract_signed_at: at(form.contract), ip_assignment: form.ip, confidentiality: form.confidentiality,
    dpa_signed_at: at(form.dpa), trial_gold_items: form.items === "" ? null : Number(form.items), trial_agreement: form.agreement === "" ? null : Number(form.agreement) / 100,
    agreement_threshold: Number(form.threshold) / 100, trial_completed_at: at(form.trialDone), trial_paid_at: at(form.trialPaid), sectors: form.sectors,
    availability: form.availability, hours_per_week: form.hours === "" ? null : Number(form.hours), notes: form.notes.trim() || null,
  };
  const missing = missingOnboarding(body);
  async function save() {
    setPending(true); setError("");
    try { await evalRequest(`/expert-bench/${row.id}`, "PUT", body); notify(t("erChecklistSaved")); onSaved(); }
    catch { setError(t("erChecklistFailed")); }
    finally { setPending(false); }
  }
  return (
    <SidePanel open onOpenChange={(value) => { if (!value) onClose(); }} title={tv("erChecklistTitle", { expert: expertLabel(row.name, row.user_id) })} description={t("erChecklistHelp")}
      footer={<><Action variant="secondary" onClick={onClose}>{t("cancel")}</Action><Action onClick={() => void save()} disabled={pending}>{t("erSaveChecklist")}</Action></>}>
      <div className="p-stack">
        {error && <Status error>{error}</Status>}
        <Field id="ob-credentials" type="date" label={t("erObCredentials")} value={form.credentials} onChange={(event) => set("credentials", event.target.value)} />
        <Field id="ob-contract" type="date" label={t("erObContract")} value={form.contract} onChange={(event) => set("contract", event.target.value)} />
        <Check label={t("erObIp")} checked={form.ip} onChange={(event) => set("ip", event.target.checked)} />
        <Check label={t("erObConfidentiality")} checked={form.confidentiality} onChange={(event) => set("confidentiality", event.target.checked)} />
        <Field id="ob-dpa" type="date" label={t("erObDpa")} value={form.dpa} onChange={(event) => set("dpa", event.target.value)} />
        <div className="p-form-grid">
          <Field id="ob-items" inputMode="numeric" label={t("erObGoldItems")} value={form.items} onChange={(event) => set("items", event.target.value.replace(/\D/g, ""))} />
          <Field id="ob-agreement" inputMode="numeric" label={t("erObAgreement")} value={form.agreement} onChange={(event) => set("agreement", event.target.value.replace(/\D/g, "").slice(0, 3))} />
          <Field id="ob-threshold" inputMode="numeric" label={t("erObThreshold")} value={form.threshold} onChange={(event) => set("threshold", event.target.value.replace(/\D/g, "").slice(0, 3))} />
          <Field id="ob-trial-done" type="date" label={t("erObTrialDone")} value={form.trialDone} onChange={(event) => set("trialDone", event.target.value)} />
          <Field id="ob-trial-paid" type="date" label={t("erObTrialPaid")} hint={t("erObTrialPaidHint")} value={form.trialPaid} onChange={(event) => set("trialPaid", event.target.value)} />
          <Field id="ob-hours" inputMode="numeric" label={t("erObHours")} value={form.hours} onChange={(event) => set("hours", event.target.value.replace(/\D/g, "").slice(0, 2))} />
        </div>
        <SelectField id="ob-availability" label={t("erObAvailability")} value={form.availability} onChange={(event) => set("availability", event.target.value as typeof form.availability)}>
          <option value="available">{t("erAvailable")}</option><option value="limited">{t("erLimited")}</option><option value="unavailable">{t("erUnavailable")}</option>
        </SelectField>
        <fieldset className="p-fieldset">
          <legend>{t("erRoster")}</legend>
          <div className="p-checks p-checks-grid eval-review-scopes">
            {REVIEW_SECTORS.map((value) => <Check key={value} label={sectorLabel(value)} checked={form.sectors.includes(value)} onChange={(event) => set("sectors", event.target.checked ? [...form.sectors, value] : form.sectors.filter((item) => item !== value))} />)}
          </div>
        </fieldset>
        <TextArea id="ob-notes" label={t("erObNotes")} rows={3} maxLength={2000} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        {missing.length ? <Status tone="warn">{tv("erNotReadyMissing", { items: missing.map((key) => t(missingLabel(key))).join(", ") })}</Status> : <Status tone="success">{t("erChecklistComplete")}</Status>}
      </div>
    </SidePanel>
  );
}

export { ClipboardCheck as ExpertReviewIcon };
