"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ClipboardCheck, FileText } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import {
  Action, ActionLink, Card, DataTable, EmptyState, Loading, PageHeading,
  RowTitle, SelectField, Status, StatusBadge, Tabs, TextArea, Toolbar,
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
  peerDecisions?: Array<{ decision: string; rationale: string }>;
};

export function ExpertAssignmentQueue() {
  const [rows, setRows] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tab, setTab] = useState<"open" | "all">("open");
  useEffect(() => {
    let live = true;
    evalRequest<WorkSummary[]>("/review/assignments").then((data) => { if (live) setRows(data); })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason : new Error("Unable to load assigned work.")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  const closed = new Set(["approved", "rejected", "adjudicated", "canceled"]);
  const visible = tab === "all" ? rows : rows.filter((row) => !closed.has(row.status));
  return <div className="p-stack">
    <PageHeading title="Assigned expert work">Open only the evidence assigned to you. Other client, model and author identities remain hidden.</PageHeading>
    <Tabs value={tab} onChange={setTab} label="Assignment view" options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} />
    {loading ? <Loading>Loading assigned work…</Loading> : error ? <Status error>{error instanceof EvalRequestError && error.status === 401 ? "Your session has expired." : "Assigned work could not be loaded."}</Status> : visible.length === 0 ?
      <EmptyState title="No assigned work" icon={<ClipboardCheck />}><p>New work will appear here after an operator assigns it.</p></EmptyState> :
      <DataTable caption="Assigned expert work" headers={["Assignment", "Severity", "Status", "Due", { label: "", align: "end" }]}>
        {visible.map((row) => <tr key={row.id}>
          <RowTitle meta={row.kind.replaceAll("_", " ")}>{row.id.slice(0, 8)}…</RowTitle>
          <td><StatusBadge value={row.severity} /></td><td><StatusBadge value={row.status} /></td>
          <td>{row.due_at ? new Date(row.due_at).toLocaleDateString() : "No due date"}</td>
          <td className="p-table-action"><ActionLink size="sm" variant="secondary" href={`/review/assignments/${row.id}`}>Open assignment</ActionLink></td>
        </tr>)}
      </DataTable>}
  </div>;
}

function answerText(value: unknown) {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value, null, 2);
}

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
  const [reviewDecision, setReviewDecision] = useState<"approve" | "changes_requested" | "reject">("approve");
  const saveRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    evalRequest<Assignment>(`/review/assignments/${encodeURIComponent(assignmentId)}`).then((data) => {
      if (!live) return;
      setWork(data); setVersion(data.ownRevision?.version ?? 0);
      setAnswer(answerText(data.ownRevision?.document.answer));
      setRationale(data.ownRevision?.document.rationale ?? "");
      setFlags(data.ownRevision?.document.flags ?? []);
    }).catch(() => { if (live) setError("This assignment could not be loaded."); });
    return () => { live = false; };
  }, [assignmentId]);

  useEffect(() => { if (conflict) continueRef.current?.focus(); }, [conflict]);

  async function save(submit: boolean, quiet = false) {
    if (pending || !work || !answer.trim() || !rationale.trim()) return;
    setPending(true); setError(""); if (!quiet) setNotice("");
    try {
      const result = await evalRequest<{ conflict: boolean; version: number; lockVersion: number; revisionId: string }>(
        `/review/assignments/${encodeURIComponent(assignmentId)}`, "PATCH",
        { expectedVersion: version, document: { answer: answer.trim(), rationale: rationale.trim(), source_refs: work.ownRevision?.document.source_refs ?? [], flags }, submit },
      );
      if (result.conflict) { setConflict(true); setNotice(""); }
      else { setVersion(result.lockVersion); setDirty(false); setNotice(submit ? "Work submitted for independent review." : "Draft saved."); }
    } catch { setError("Your work could not be saved. Your text remains on this page."); }
    finally { setPending(false); }
  }

  useEffect(() => {
    if (!dirty || pending || !answer.trim() || !rationale.trim()) return;
    const timer = window.setTimeout(() => { void save(false, true); }, 30_000);
    return () => window.clearTimeout(timer);
  // Inputs deliberately restart the bounded idle save timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, answer, rationale, flags, version]);

  function changeFlag(flag: SubmissionDocument["flags"][number], checked: boolean) {
    setFlags((current) => checked ? [...new Set([...current, flag])] : current.filter((item) => item !== flag));
    setDirty(true);
  }
  function closeConflict() {
    setConflict(false); setNotice("Both versions were preserved. An operator can resolve the competing revisions.");
    window.setTimeout(() => saveRef.current?.focus(), 0);
  }
  async function recordDecision() {
    if (!rationale.trim()) return;
    setPending(true); setError(""); setNotice("");
    try {
      await evalRequest(`/review/assignments/${encodeURIComponent(assignmentId)}/quality`, "POST", { decision: reviewDecision, rationale: rationale.trim() });
      setNotice("Independent review recorded.");
    } catch { setError("The quality decision could not be recorded."); }
    finally { setPending(false); }
  }

  if (error && !work) return <Status error>{error}</Status>;
  if (!work) return <Loading>Loading assigned evidence…</Loading>;
  const review = work.kind === "independent_review" || work.kind === "adjudication";
  const locked = ["guideline_changed", "submitted", "approved", "rejected", "adjudicated", "canceled"].includes(work.status);
  return <div className="p-stack">
    <PageHeading title={review ? "Independent review" : "Expert assignment"} actions={<StatusBadge value={work.status} />}>
      {work.guideline.title}. Work only from the redacted material shown below.
    </PageHeading>
    {work.status === "guideline_changed" && <Status tone="warn">The guideline changed. This assignment is locked until an operator reissues it.</Status>}
    {notice && <Status tone="success">{notice}</Status>}{error && <Status error>{error}</Status>}
    <div className="eval-expert-grid">
      <div className="p-stack">
        <Card title="Assigned evidence">
          {work.evidence.excerpts.map((excerpt) => <article className="eval-evidence" key={excerpt.anchor}><p className="p-eyebrow">{excerpt.anchor}</p><p>{excerpt.text}</p></article>)}
          {work.evidence.transcript.map((turn, index) => <article className="eval-transcript" key={`${turn.role}-${index}`}><p className="p-eyebrow">{turn.role}</p><p>{turn.content}</p></article>)}
        </Card>
        <Card title="Guideline"><p>{work.guideline.instructions}</p></Card>
        {work.peerDecisions && <Card title="Revealed peer decisions">{work.peerDecisions.map((item, index) => <div key={index}><StatusBadge value={item.decision} /><p>{item.rationale}</p></div>)}</Card>}
      </div>
      <Card title={review ? "Your independent decision" : "Your contribution"}>
        <TextArea id="expert-answer" label="Answer" rows={8} value={answer} disabled={locked || review} onChange={(event) => { setAnswer(event.target.value); setDirty(true); }} />
        <TextArea id="expert-rationale" label="Rationale" rows={6} value={rationale} disabled={locked} onChange={(event) => { setRationale(event.target.value); setDirty(true); }} />
        {!review && <fieldset className="eval-flag-list"><legend>Review flags</legend>
          <label><input type="checkbox" checked={flags.includes("ambiguous")} onChange={(event) => changeFlag("ambiguous", event.target.checked)} /> Flag ambiguity</label>
          <label><input type="checkbox" checked={flags.includes("missing_source")} onChange={(event) => changeFlag("missing_source", event.target.checked)} /> Flag missing source</label>
          <label><input type="checkbox" checked={flags.includes("guideline_question")} onChange={(event) => changeFlag("guideline_question", event.target.checked)} /> Flag guideline question</label>
        </fieldset>}
        {review ? <>
          <SelectField id="review-decision" label="Review decision" value={reviewDecision} onChange={(event) => setReviewDecision(event.target.value as typeof reviewDecision)} disabled={locked}>
            <option value="approve">Approve</option><option value="changes_requested">Request changes</option><option value="reject">Reject</option>
          </SelectField>
          <Action onClick={() => void recordDecision()} disabled={pending || locked || !rationale.trim()}>Record decision</Action>
        </> : <Toolbar>
          <Action ref={saveRef} variant="secondary" onClick={() => void save(false)} disabled={pending || locked || !dirty || !answer.trim() || !rationale.trim()}>Save draft</Action>
          <Action onClick={() => void save(true)} disabled={pending || locked || !answer.trim() || !rationale.trim()}>Submit work</Action>
        </Toolbar>}
      </Card>
    </div>
    {conflict && <div className="eval-dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="save-conflict-title" className="eval-dialog">
      <AlertTriangle aria-hidden="true" /><h2 id="save-conflict-title">Both versions were preserved</h2>
      <p>Your draft arrived after another save. Nothing was overwritten. Continue editing while an operator resolves the competing revisions.</p>
      <Action ref={continueRef} onClick={closeConflict}>Continue editing</Action>
    </section></div>}
  </div>;
}
