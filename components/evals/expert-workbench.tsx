"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { slaState } from "@/lib/evals/experts/review-contracts";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/en";
import { methodologyUrl } from "@/lib/evals/public-links";
import { evalRequest, EvalRequestError } from "./api";
import {
  Action, ActionLink, Badge, Card, Check, DataTable, EmptyState, Loading, PageHeading,
  RowTitle, SelectField, Status, StatusBadge, Tabs, TextArea, Toolbar, formatDate,
} from "./primitives";

type WorkSummary = {
  id: string; kind: string; status: string; severity: string; due_at: string | null; updated_at: string;
};
type SubmissionDocument = {
  answer: unknown; rationale: string; source_refs: Array<{ source_revision_id: string; anchor: string }>;
  flags: Array<"ambiguous" | "missing_source" | "guideline_question">;
};
type Assignment = {
  id: string; kind: string; status: string;
  evidence: {
    excerpts: Array<{ anchor: string; text: string; source_revision_id?: string }>;
    transcript: Array<{ role: string; content: string; turn?: number }>;
  };
  guideline: { title: string; instructions: string };
  dueAt: string | null;
  ownRevision: { version: number; status: string; document: SubmissionDocument } | null;
  reviewTarget?: { answer: unknown; rationale: string; sourceAnchors: string[]; flags: string[] };
  peerDecisions?: Array<{ decision: string; rationale: string }>;
};

const KIND: Record<string, MessageKey> = {
  authoring: "xwKindAuthoring", independent_review: "xwKindReview", adjudication: "xwKindAdjudication", calibration: "xwKindCalibration",
};
const kindLabel = (kind: string) => (KIND[kind] ? t(KIND[kind]) : kind.replaceAll("_", " "));
const CLOSED = new Set(["approved", "rejected", "adjudicated", "canceled"]);
const LOCKED = new Set(["guideline_changed", "submitted", "approved", "rejected", "adjudicated", "canceled"]);

/** Due date with its SLA: overdue, due within a day, or the date (launch L-26, spec §5.4). */
function DueBadge({ due, closed }: { due: string | null; closed: boolean }) {
  if (!due) return <span className="p-cell-meta">{t("xwNoDue")}</span>;
  const state = slaState(due, closed);
  if (state === "overdue") return <Badge tone="fail" dot>{tv("xwOverdue", { date: formatDate(due) })}</Badge>;
  if (state === "due_soon") return <Badge tone="warn" dot>{tv("xwDueSoon", { date: formatDate(due, true) })}</Badge>;
  return <span>{tv("xwDueOn", { date: formatDate(due) })}</span>;
}

export function ExpertAssignmentQueue() {
  const [rows, setRows] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tab, setTab] = useState<"open" | "all">("open");
  useEffect(() => {
    let live = true;
    evalRequest<WorkSummary[]>("/review/assignments").then((data) => { if (live) setRows(data); })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason : new Error("load_failed")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  // Open work first by due date (no date last), so the next deadline is on top.
  const byDue = (a: WorkSummary, b: WorkSummary) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || b.updated_at.localeCompare(a.updated_at);
  const visible = (tab === "all" ? rows : rows.filter((row) => !CLOSED.has(row.status))).slice().sort(byDue);
  return <div className="p-stack">
    <PageHeading title={t("xwQueueTitle")}>{t("xwQueueIntro")}</PageHeading>
    <Tabs value={tab} onChange={setTab} label={t("xwViewLabel")} options={[{ value: "open", label: t("xwTabOpen") }, { value: "all", label: t("xwTabAll") }]} />
    {loading ? <Loading>{t("xwLoading")}</Loading> : error ? <Status error>{error instanceof EvalRequestError && error.status === 401 ? t("xwSessionExpired") : t("xwLoadFailed")}</Status> : visible.length === 0 ?
      <EmptyState title={t("xwEmpty")} icon={<ClipboardCheck />}><p>{t("xwEmptyHelp")}</p></EmptyState> :
      <DataTable caption={t("xwQueueTitle")} headers={[t("xwColAssignment"), t("xwColSeverity"), t("xwColStatus"), t("xwColDue"), { label: "", align: "end" }]}>
        {visible.map((row) => <tr key={row.id}>
          <RowTitle meta={kindLabel(row.kind)}>{row.id.slice(0, 8)}…</RowTitle>
          <td><StatusBadge value={row.severity} /></td><td><StatusBadge value={row.status} /></td>
          <td><DueBadge due={row.due_at} closed={CLOSED.has(row.status) || LOCKED.has(row.status)} /></td>
          <td className="p-table-action"><ActionLink size="sm" variant="secondary" href={`/review/assignments/${row.id}`}>{t("xwOpenAssignment")}</ActionLink></td>
        </tr>)}
      </DataTable>}
  </div>;
}

function answerText(value: unknown) {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value, null, 2);
}

type SaveState = { kind: "idle" } | { kind: "dirty" } | { kind: "saving" } | { kind: "saved"; at: number } | { kind: "error" };
const AUTOSAVE_MS = 30_000;
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function ExpertWorkbench({ assignmentId }: { assignmentId: string }) {
  const [work, setWork] = useState<Assignment | null>(null);
  const [answer, setAnswer] = useState("");
  const [rationale, setRationale] = useState("");
  const [flags, setFlags] = useState<SubmissionDocument["flags"]>([]);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [reviewDecision, setReviewDecision] = useState<"approve" | "changes_requested" | "reject">("approve");
  const saveRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const guidelineRef = useRef<HTMLDivElement>(null);
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => { if (isMac()) setMod("⌘"); }, []);

  useEffect(() => {
    let live = true;
    evalRequest<Assignment>(`/review/assignments/${encodeURIComponent(assignmentId)}`).then((data) => {
      if (!live) return;
      setWork(data); setVersion(data.ownRevision?.version ?? 0);
      setAnswer(answerText(data.ownRevision?.document.answer));
      setRationale(data.ownRevision?.document.rationale ?? "");
      setFlags(data.ownRevision?.document.flags ?? []);
      if (data.ownRevision) setSaveState({ kind: "saved", at: 0 });
    }).catch(() => { if (live) setError(t("xwLoadOne")); });
    return () => { live = false; };
  }, [assignmentId]);

  useEffect(() => { if (conflict) continueRef.current?.focus(); }, [conflict]);

  const review = work?.kind === "independent_review" || work?.kind === "adjudication";
  const locked = work ? LOCKED.has(work.status) : true;

  async function save(submit: boolean, quiet = false) {
    if (pending || !work || !answer.trim() || !rationale.trim()) return;
    setPending(true); setError(""); if (!quiet) setNotice("");
    setSaveState({ kind: "saving" });
    try {
      const result = await evalRequest<{ conflict: boolean; version: number; lockVersion: number; revisionId: string }>(
        `/review/assignments/${encodeURIComponent(assignmentId)}`, "PATCH",
        { expectedVersion: version, document: { answer: answer.trim(), rationale: rationale.trim(), source_refs: work.ownRevision?.document.source_refs ?? [], flags }, submit },
      );
      if (result.conflict) { setConflict(true); setNotice(""); setSaveState({ kind: "dirty" }); }
      else {
        setVersion(result.lockVersion); setDirty(false); setSaveState({ kind: "saved", at: Date.now() });
        if (submit) setWork((current) => current ? { ...current, status: "submitted" } : current);
        setNotice(submit ? t("xwSubmitted") : quiet ? "" : t("xwDraftSaved"));
      }
    } catch { setError(t("xwSaveFailed")); setSaveState({ kind: "error" }); }
    finally { setPending(false); }
  }

  useEffect(() => {
    if (!dirty || pending || !answer.trim() || !rationale.trim()) return;
    const timer = window.setTimeout(() => { void save(false, true); }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  // Inputs deliberately restart the bounded idle save timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, answer, rationale, flags, version]);

  function edited() { setDirty(true); setSaveState({ kind: "dirty" }); }
  function changeFlag(flag: SubmissionDocument["flags"][number], checked: boolean) {
    setFlags((current) => checked ? [...new Set([...current, flag])] : current.filter((item) => item !== flag));
    edited();
  }
  function closeConflict() {
    setConflict(false); setNotice(t("xwConflictNotice"));
    window.setTimeout(() => saveRef.current?.focus(), 0);
  }
  async function recordDecision() {
    if (!rationale.trim() || pending) return;
    setPending(true); setError(""); setNotice("");
    try {
      await evalRequest(`/review/assignments/${encodeURIComponent(assignmentId)}/quality`, "POST", { decision: reviewDecision, rationale: rationale.trim() });
      setNotice(t("xwDecisionRecorded"));
    } catch { setError(t("xwDecisionFailed")); }
    finally { setPending(false); }
  }
  const showGuideline = useCallback(() => {
    guidelineRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    guidelineRef.current?.focus({ preventScroll: true });
  }, []);

  // Keyboard shortcuts: Ctrl/⌘+S saves the draft, Ctrl/⌘+Enter submits (or records the review decision), Alt+G shows the guideline.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (conflict || !work) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!review && !locked && dirty) void save(false);
      } else if (command && event.key === "Enter") {
        event.preventDefault();
        if (locked) return;
        if (review) void recordDecision(); else void save(true);
      } else if (event.altKey && !command && event.code === "KeyG") {
        event.preventDefault();
        showGuideline();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (error && !work) return <Status error>{error}</Status>;
  if (!work) return <Loading>{t("xwLoadingEvidence")}</Loading>;
  const saveText = saveState.kind === "saving" ? t("xwSaving")
    : saveState.kind === "dirty" ? t("xwUnsaved")
      : saveState.kind === "error" ? t("xwSaveError")
        : saveState.kind === "saved" ? (saveState.at ? tv("xwSavedAt", { time: new Date(saveState.at).toLocaleTimeString(getLocale() === "es" ? "es-ES" : "en-GB", { hour: "2-digit", minute: "2-digit" }) }) : t("xwSavedEarlier"))
          : t("xwAutosaveOn");
  return <div className="p-stack">
    <PageHeading title={review ? t("xwIndependentReview") : t("xwExpertAssignment")}
      meta={<><DueBadge due={work.dueAt} closed={locked} />{!review && !locked && <span className="eval-save-state" aria-live="polite" data-state={saveState.kind} data-save-state>{saveText}</span>}</>}
      actions={<StatusBadge value={work.status} />}>
      {tv("xwWorkOnly", { title: work.guideline.title })}{" "}
      <button type="button" className="p-text-button" onClick={showGuideline} data-guideline-link>{t("xwGuidelineLink")}</button>
    </PageHeading>
    {work.status === "guideline_changed" && <Status tone="warn">{t("xwGuidelineChanged")}</Status>}
    {notice && <Status tone="success">{notice}</Status>}{error && <Status error>{error}</Status>}
    <div className="eval-expert-grid">
      <div className="p-stack">
        <Card title={t("xwAssignedEvidence")}>
          {work.evidence.excerpts.map((excerpt) => <article className="eval-evidence" key={excerpt.anchor}><p className="p-eyebrow">{excerpt.anchor}</p><p style={{ whiteSpace: "pre-wrap" }}>{excerpt.text}</p></article>)}
          {work.evidence.transcript.length > 0 && <div className="p-transcript">{work.evidence.transcript.map((turn, index) => <p className="p-bubble" data-role={turn.role} key={`${turn.role}-${index}`}><span className="p-bubble-role">{turn.role}</span>{turn.content}</p>)}</div>}
        </Card>
        <div ref={guidelineRef} tabIndex={-1} id="assignment-guideline">
          <Card title={t("xwGuideline")}>
            <p style={{ whiteSpace: "pre-wrap" }}>{work.guideline.instructions}</p>
            <p className="p-cell-meta"><a href={methodologyUrl(getLocale())} target="_blank" rel="noopener noreferrer">{t("xwMethodologyLink")}</a></p>
          </Card>
        </div>
        {work.reviewTarget && <Card title={t("xwSubmissionUnderReview")}><p>{answerText(work.reviewTarget.answer)}</p><p>{work.reviewTarget.rationale}</p>{work.reviewTarget.sourceAnchors.length > 0 && <p>{t("xwSourceAnchors")}: {work.reviewTarget.sourceAnchors.join(", ")}</p>}</Card>}
        {work.peerDecisions && <Card title={t("xwPeerDecisions")}>{work.peerDecisions.map((item, index) => <div key={index}><StatusBadge value={item.decision} /><p>{item.rationale}</p></div>)}</Card>}
      </div>
      <Card title={review ? t("xwYourDecision") : t("xwYourContribution")}>
        <TextArea id="expert-answer" label={t("xwAnswer")} rows={8} value={answer} disabled={locked || review} onChange={(event) => { setAnswer(event.target.value); edited(); }} />
        <TextArea id="expert-rationale" label={t("xwRationale")} rows={6} value={rationale} disabled={locked} onChange={(event) => { setRationale(event.target.value); edited(); }} />
        {!review && <fieldset className="p-fieldset"><legend>{t("xwReviewFlags")}</legend>
          <div className="p-checks">
            <Check label={t("xwFlagAmbiguous")} checked={flags.includes("ambiguous")} disabled={locked} onChange={(event) => changeFlag("ambiguous", event.target.checked)} />
            <Check label={t("xwFlagMissing")} checked={flags.includes("missing_source")} disabled={locked} onChange={(event) => changeFlag("missing_source", event.target.checked)} />
            <Check label={t("xwFlagGuideline")} checked={flags.includes("guideline_question")} disabled={locked} onChange={(event) => changeFlag("guideline_question", event.target.checked)} />
          </div>
        </fieldset>}
        {review ? <>
          <SelectField id="review-decision" label={t("xwReviewDecision")} value={reviewDecision} onChange={(event) => setReviewDecision(event.target.value as typeof reviewDecision)} disabled={locked}>
            <option value="approve">{t("xwApprove")}</option><option value="changes_requested">{t("xwRequestChanges")}</option><option value="reject">{t("xwReject")}</option>
          </SelectField>
          <Action onClick={() => void recordDecision()} disabled={pending || locked || !rationale.trim()}>{t("xwRecordDecision")}</Action>
        </> : <Toolbar>
          <Action ref={saveRef} variant="secondary" onClick={() => void save(false)} disabled={pending || locked || !dirty || !answer.trim() || !rationale.trim()}>{t("xwSaveDraft")}</Action>
          <Action onClick={() => void save(true)} disabled={pending || locked || !answer.trim() || !rationale.trim()}>{t("xwSubmit")}</Action>
        </Toolbar>}
        {!locked && <p className="eval-shortcuts" data-shortcuts>
          <span>{t("xwShortcuts")}</span>{" "}
          {!review && <><kbd className="p-kbd">{mod}</kbd><kbd className="p-kbd">S</kbd> {t("xwShortcutSave")} · </>}
          <kbd className="p-kbd">{mod}</kbd><kbd className="p-kbd">Enter</kbd> {review ? t("xwShortcutDecision") : t("xwShortcutSubmit")} ·{" "}
          <kbd className="p-kbd">Alt</kbd><kbd className="p-kbd">G</kbd> {t("xwShortcutGuideline")}
        </p>}
      </Card>
    </div>
    {conflict && <div className="eval-dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="save-conflict-title" className="eval-dialog">
      <AlertTriangle aria-hidden="true" /><h2 id="save-conflict-title">{t("xwConflictTitle")}</h2>
      <p>{t("xwConflictBody")}</p>
      <Action ref={continueRef} onClick={closeConflict}>{t("xwContinue")}</Action>
    </section></div>}
  </div>;
}
