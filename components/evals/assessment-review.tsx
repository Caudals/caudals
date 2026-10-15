"use client";

/**
 * Exception-first review across every client (spec §5.5 steps 5 and 8,
 * §11.3–11.4). Test sets waiting for approval link to their evaluation;
 * results needing a decision open with the question, captured answer,
 * expectation and source anchors. Decisions append attributed records; an
 * override creates a new assessment and never deletes the model judgment.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, Check, DataTable, DefinitionList, EmptyState, Field, FilterChips, PageHeading, RowTitle, SectionHeading, SelectField, Status, StatusBadge, TableSkeleton, TextArea, humanize, type Tone } from "./primitives";
import { SidePanel, notify } from "./overlays";
import { useClientSummaries } from "./operator-overview";
import { useWorkspace } from "./workspace-context";
import { t, tv } from "@/lib/evals/messages/runtime";
import { engineText } from "@/lib/evals/messages/phrases";
import type { ResultLabel } from "@/lib/evals/reports/contracts";
import { ResultBadge, labelOf } from "./result-labels";

type Item = {
  assessment_id: string;
  created_at?: string;
  outcome: string;
  review_status: string;
  rationale: string;
  criteria: Array<{ criterion_id: string; score: number | null; rationale: string }>;
  case_title: string;
  severity: string;
  question: string | null;
  answer: string | null;
  expected: unknown;
  source_refs: Array<{ source_revision_id: string; anchor: string }>;
  evaluation_title: string;
  judge_reason: string | null;
  judge_calibration: { examples: number; agreement: number | null; adequate: boolean } | null;
  verdict?: { verdict: string | null; failure_category: string | null; reference_issue: string | null; capture_issue: string | null; key_facts?: Array<{ fact: string; status: string }>; confidence?: string } | null;
  offered_actions?: string[] | null;
  execution_status?: string;
};
/** The customer label for a queued result, from its stored v2 verdict. */
function queuedLabel(item: Item): ResultLabel {
  const verdict = item.verdict;
  if (item.outcome === "unscorable") return verdict?.reference_issue ? "test_issue" : verdict?.capture_issue ? "capture_issue" : item.execution_status && item.execution_status !== "succeeded" ? "not_run" : "pending";
  return labelOf({ outcome: item.outcome as "pass" | "partial" | "fail", label: item.outcome === "fail" && (verdict?.verdict === "not_answered" || verdict?.failure_category === "no_answer") ? "not_answered" : undefined });
}
/** Why a person must look: the test defect, capture problem, low confidence or judge failure. */
function reviewReason(item: Item) {
  if (item.verdict?.reference_issue) return humanize(item.verdict.reference_issue);
  if (item.verdict?.capture_issue) return t("labelCaptureIssue");
  if (item.verdict?.confidence === "low") return t("lowConfidence");
  return item.judge_reason ? humanize(item.judge_reason) : humanize(item.review_status);
}
type Queued = Item & { orgId: string; client: string };
/**
 * Review SLA (launch L-21, spec v2 §5.3): how long an item has waited. Within
 * a working day it is fine, after 24 hours it is due, after 48 hours overdue.
 */
export function slaFor(since: string | null | undefined, now = Date.now()): { label: string; tone: Tone } | null {
  if (!since) return null;
  const hours = Math.max(0, (now - new Date(since).getTime()) / 3_600_000);
  if (!Number.isFinite(hours)) return null;
  const label = hours < 1 ? tv("slaMinutes", { n: Math.max(1, Math.round(hours * 60)) }) : hours < 48 ? tv("slaHours", { n: Math.floor(hours) }) : tv("slaDays", { n: Math.floor(hours / 24) });
  return { label, tone: hours >= 48 ? "fail" : hours >= 24 ? "warn" : "neutral" };
}
function Sla({ since }: { since: string | null | undefined }) {
  const sla = slaFor(since);
  return sla ? <Badge tone={sla.tone} dot={sla.tone !== "neutral"}>{sla.label}</Badge> : <span className="p-cell-meta">—</span>;
}
/**
 * "Assign to me" (launch G1, spec v2 §5.3): a member of staff claims a test
 * set awaiting approval or a result needing review, so two people do not
 * work the same item. The server (migration 113) serialises claims and
 * audits each one; taking over someone else's item is explicit.
 */
type Assignment = { orgId: string; subjectKind: "evaluation" | "assessment"; subjectId: string; assigneeId: string; assigneeName: string | null; assignedAt: string; mine: boolean };
type AssignFilter = "all" | "mine" | "unassigned";
const assignmentKey = (orgId: string, kind: Assignment["subjectKind"], id: string) => `${orgId}:${kind}:${id}`;
function Assignee({ assignment, title, busy, onChange }: { assignment: Assignment | undefined; title: string; busy: boolean; onChange: (action: "assign" | "release", takeOver?: boolean) => void }) {
  if (!assignment) {
    return <Action variant="secondary" size="sm" disabled={busy} aria-label={`${t("reviewAssignToMe")}: ${title}`} onClick={() => onChange("assign")}>{t("reviewAssignToMe")}</Action>;
  }
  const held = slaFor(assignment.assignedAt)?.label;
  return (
    <span className="p-row p-nowrap">
      {assignment.mine ? <Badge tone="pass" dot>{t("reviewAssignedYou")}</Badge> : <span>{assignment.assigneeName ?? t("reviewAssignedSomeone")}</span>}
      {held && <span className="p-cell-meta">{held}</span>}
      {assignment.mine ? (
        <Action variant="ghost" size="sm" disabled={busy} aria-label={`${t("reviewUnassign")}: ${title}`} onClick={() => onChange("release")}>{t("reviewUnassign")}</Action>
      ) : (
        <Action variant="ghost" size="sm" disabled={busy} aria-label={`${t("reviewTakeOver")}: ${title}`} onClick={() => onChange("assign", true)}>{t("reviewTakeOver")}</Action>
      )}
    </span>
  );
}
const scoreFor = { pass: 1, partial: 0.5, fail: 0, unscorable: null } as const;
const SEVERITY = ["critical", "high", "medium", "low"];

export function ReviewQueue() {
  const { workspaces } = useWorkspace();
  const { clients } = useClientSummaries();
  const [items, setItems] = useState<Queued[] | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "dispute" | "override">("approve");
  const [outcome, setOutcome] = useState<keyof typeof scoreFor>("pass");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [assignFilter, setAssignFilter] = useState<AssignFilter>("all");
  const [assigning, setAssigning] = useState("");

  const loadAssignments = useCallback(async () => {
    const rows = await Promise.all(
      workspaces.map(async (workspace) =>
        (await evalRequest<Omit<Assignment, "orgId">[]>(`/review-assignments?orgId=${encodeURIComponent(workspace.id)}`).catch(() => [])).map((row) => ({ ...row, orgId: workspace.id })),
      ),
    );
    setAssignments(Object.fromEntries(rows.flat().map((row) => [assignmentKey(row.orgId, row.subjectKind, row.subjectId), row])));
  }, [workspaces]);
  const load = useCallback(async () => {
    try {
      const [rows] = await Promise.all([
        Promise.all(
          workspaces.map(async (workspace) =>
            (await evalRequest<Item[]>(`/reviews?orgId=${encodeURIComponent(workspace.id)}`).catch(() => [] as Item[])).map((item) => ({ ...item, orgId: workspace.id, client: workspace.name })),
          ),
        ),
        loadAssignments(),
      ]);
      setItems(rows.flat().sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity)));
      setError("");
    } catch (value) {
      setItems([]);
      setError(value instanceof Error ? value.message : t("error"));
    }
  }, [workspaces, loadAssignments]);

  async function changeAssignment(orgId: string, subjectKind: Assignment["subjectKind"], subjectId: string, action: "assign" | "release", takeOver = false) {
    const key = assignmentKey(orgId, subjectKind, subjectId);
    setAssigning(key);
    try {
      const result = await evalRequest<{ assignment: Omit<Assignment, "orgId"> | null }>("/review-assignments", "POST", { orgId, subjectKind, subjectId, action, ...(takeOver ? { takeOver: true } : {}) });
      setAssignments((current) => {
        const next = { ...current };
        if (result.assignment) next[key] = { ...result.assignment, orgId };
        else delete next[key];
        return next;
      });
      notify(t(action === "release" ? "reviewUnassigned" : takeOver ? "reviewTakenOver" : "reviewAssigned"));
    } catch (value) {
      notify(value instanceof Error ? value.message : t("error"));
      await loadAssignments();
    } finally {
      setAssigning("");
    }
  }
  const assignee = (orgId: string, kind: Assignment["subjectKind"], id: string) => assignments[assignmentKey(orgId, kind, id)];
  const shown = (assignment: Assignment | undefined) => assignFilter === "all" || (assignFilter === "mine" ? !!assignment?.mine : !assignment);
  useEffect(() => {
    void load();
  }, [load]);

  const approvals = useMemo(
    () =>
      (clients ?? []).flatMap((client) =>
        (client.summary?.evaluations ?? []).filter((item) => ["needs_review", "validating"].includes(item.preparation_status)).map((evaluation) => ({ client, evaluation })),
      ),
    [clients],
  );
  const current = items?.find((item) => item.assessment_id === openId) ?? null;
  const visibleApprovals = approvals.filter(({ client, evaluation }) => shown(assignee(client.id, "evaluation", evaluation.id)));
  const visibleItems = (items ?? []).filter((item) => shown(assignee(item.orgId, "assessment", item.assessment_id)));
  const queued = [
    ...approvals.map(({ client, evaluation }) => assignee(client.id, "evaluation", evaluation.id)),
    ...(items ?? []).map((item) => assignee(item.orgId, "assessment", item.assessment_id)),
  ];

  function open(item: Queued) {
    setOpenId(item.assessment_id);
    setDecision("approve");
    setOutcome((item.outcome as keyof typeof scoreFor) ?? "pass");
    setReason("");
    setError("");
  }

  async function decide(event: React.FormEvent) {
    event.preventDefault();
    if (!current || !reason.trim()) return;
    setPending(true);
    setError("");
    try {
      await evalRequest("/reviews", "POST", {
        orgId: current.orgId,
        assessmentId: current.assessment_id,
        decision,
        reason: reason.trim(),
        ...(decision === "override" ? { outcome, criteria: current.criteria.map((criterion) => ({ criterion_id: criterion.criterion_id, score: scoreFor[outcome], rationale: reason.trim() })) } : {}),
      });
      notify(t("reviewRecorded"));
      setOpenId(null);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  /** Bulk approve (launch L-21): one attributed decision per result, with the same reason. */
  async function approveSelected(event: React.FormEvent) {
    event.preventDefault();
    const reasonText = bulkReason.trim();
    if (!reasonText || !selected.length || !items) return;
    setBulkPending(true);
    setError("");
    let done = 0;
    try {
      for (const item of items.filter((row) => selected.includes(`${row.orgId}:${row.assessment_id}`))) {
        await evalRequest("/reviews", "POST", { orgId: item.orgId, assessmentId: item.assessment_id, decision: "approve", reason: reasonText });
        done++;
      }
      notify(tv("bulkApproved", { count: done }));
      setSelected([]);
      setBulkReason("");
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
      if (done) notify(tv("bulkApproved", { count: done }));
    } finally {
      setBulkPending(false);
      await load();
    }
  }
  const keyOf = (item: Queued) => `${item.orgId}:${item.assessment_id}`;
  const toggle = (key: string) => setSelected((current) => (current.includes(key) ? current.filter((value) => value !== key) : [...current, key]));
  const allSelected = !!visibleItems.length && visibleItems.every((item) => selected.includes(keyOf(item)));

  return (
    <>
      <PageHeading title={t("reviewQueue")}>{t("reviewQueueHelp")}</PageHeading>
      {error && !current && <Status error>{error}</Status>}
      <div className="p-toolbar">
        <FilterChips value={assignFilter} onChange={setAssignFilter} label={t("reviewFilterAssignee")} options={[
          { value: "all", label: t("all"), count: queued.length },
          { value: "mine", label: t("reviewFilterMine"), count: queued.filter((row) => row?.mine).length },
          { value: "unassigned", label: t("reviewFilterUnassigned"), count: queued.filter((row) => !row).length },
        ]} />
      </div>

      <section>
        <SectionHeading title={t("testSetsAwaitingApproval")}>{t("testSetsAwaitingApprovalHelp")}</SectionHeading>
        {clients === null ? (
          <TableSkeleton rows={2} columns={3} />
        ) : visibleApprovals.length ? (
          <DataTable caption={t("testSetsAwaitingApproval")} headers={[t("evaluation"), t("client"), t("slaWaiting"), t("reviewAssignee"), { label: t("statusLabel"), align: "end" }]}>
            {visibleApprovals.map(({ client, evaluation }) => (
              <tr key={`${client.id}-${evaluation.id}`}>
                <RowTitle href={`/workspace/evaluations/${evaluation.id}?orgId=${client.id}`} meta={evaluation.project_title}>
                  {evaluation.title}
                </RowTitle>
                <td>{client.name}</td>
                <td><Sla since={evaluation.updated_at} /></td>
                <td>
                  <Assignee assignment={assignee(client.id, "evaluation", evaluation.id)} title={evaluation.title} busy={assigning === assignmentKey(client.id, "evaluation", evaluation.id)}
                    onChange={(action, takeOver) => void changeAssignment(client.id, "evaluation", evaluation.id, action, takeOver)} />
                </td>
                <td className="p-table-action">
                  <StatusBadge value={evaluation.preparation_status} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState compact icon={<ClipboardCheck />} title={approvals.length ? t("reviewFilterNone") : t("noTestSetsAwaiting")} />
        )}
      </section>

      <section className="p-section">
        <SectionHeading title={t("resultReview")}>{t("resultReviewHelp")}</SectionHeading>
        {items === null ? (
          <TableSkeleton columns={4} />
        ) : visibleItems.length ? (
          <>
          {selected.length > 0 && (
            <form className="p-row" onSubmit={approveSelected} aria-label={t("bulkApprove")}>
              <Field id="bulk-reason" label={tv("bulkReason", { count: selected.length })} value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} maxLength={4000} required />
              <Action type="submit" disabled={bulkPending || !bulkReason.trim()}>{bulkPending ? t("working") : tv("bulkApproveCount", { count: selected.length })}</Action>
              <Action variant="ghost" onClick={() => setSelected([])}>{t("cancel")}</Action>
            </form>
          )}
          <div className="p-toolbar"><Check label={t("bulkSelectAll")} checked={allSelected} onChange={() => setSelected(allSelected ? [] : visibleItems.map(keyOf))} /></div>
          <DataTable caption={t("resultReview")} headers={[{ label: t("bulkSelect"), hidden: true }, t("test"), t("severity"), t("outcome"), t("slaWaiting"), t("reviewAssignee"), t("reason")]}>
            {visibleItems.map((item) => (
              <tr key={`${item.orgId}-${item.assessment_id}`}>
                <td><input type="checkbox" aria-label={`${t("bulkSelect")}: ${item.question ?? item.case_title}`} checked={selected.includes(keyOf(item))} onChange={() => toggle(keyOf(item))} /></td>
                <th scope="row" className="p-cell-wide">
                  <span className="p-table-primary">
                    <button type="button" className="p-row-link p-row-button p-clamp-2" onClick={() => open(item)}>
                      {item.question ?? item.case_title}
                    </button>
                    <span className="p-cell-meta">
                      {item.client} · {item.evaluation_title}
                    </span>
                  </span>
                </th>
                <td>
                  <StatusBadge value={item.severity} />
                </td>
                <td>
                  <ResultBadge result={{ outcome: item.outcome as "pass", label: queuedLabel(item) }} />
                </td>
                <td><Sla since={item.created_at} /></td>
                <td>
                  <Assignee assignment={assignee(item.orgId, "assessment", item.assessment_id)} title={item.question ?? item.case_title} busy={assigning === assignmentKey(item.orgId, "assessment", item.assessment_id)}
                    onChange={(action, takeOver) => void changeAssignment(item.orgId, "assessment", item.assessment_id, action, takeOver)} />
                </td>
                <td className="p-cell-meta p-cell-wide">{reviewReason(item)}</td>
              </tr>
            ))}
          </DataTable>
          </>
        ) : items.length ? (
          <EmptyState compact icon={<ClipboardCheck />} title={t("reviewFilterNone")} />
        ) : (
          <EmptyState title={t("noResultsToReview")} icon={<ClipboardCheck />}>
            <p>{t("noResultsToReviewHelp")}</p>
          </EmptyState>
        )}
      </section>

      <SidePanel
        open={!!current}
        onOpenChange={(value) => !value && setOpenId(null)}
        title={current?.case_title ?? t("result")}
        description={
          current && (
            <>
              <StatusBadge value={current.severity} />
              <ResultBadge result={{ outcome: current.outcome as "pass", label: queuedLabel(current) }} />
              <span>
                {current.client} · {current.evaluation_title}
              </span>
            </>
          )
        }
        wide
        footer={
          current && (
            <>
              <Action variant="secondary" onClick={() => setOpenId(null)}>
                {t("cancel")}
              </Action>
              <Action type="submit" form="review-form" disabled={pending || !reason.trim()}>
                {pending ? t("working") : t("recordDecision")}
              </Action>
            </>
          )
        }
      >
        {current && (
          <>
            {error && <Status error>{error}</Status>}
            <div className="p-transcript">
              <div className="p-bubble" data-role="user">
                <span className="p-bubble-role">{t("question")}</span>
                <p>{current.question ?? "—"}</p>
              </div>
              <div className="p-bubble" data-role="assistant">
                <span className="p-bubble-role">{t("systemAnswer")}</span>
                <p>{current.answer ?? "—"}</p>
                {current.offered_actions?.length ? (
                  <>
                    <span className="p-kicker">{t("offeredOptions")}</span>
                    <span className="p-chips">{current.offered_actions.map((action) => <span key={action} className="p-chip-static">{action}</span>)}</span>
                  </>
                ) : null}
              </div>
            </div>
            <section className="p-ground-truth" aria-label={t("expectedAnswer")}>
              <span className="p-kicker">{t("expectedAnswer")}</span>
              <p>{typeof current.expected === "string" ? current.expected : JSON.stringify(current.expected, null, 2)}</p>
              {current.verdict?.key_facts?.length ? (
                <ul className="p-facts">
                  {current.verdict.key_facts.map((fact, index) => (
                    <li key={index} data-status={fact.status}><span>{fact.fact}</span><span className="p-facts-status">{humanize(fact.status)}</span></li>
                  ))}
                </ul>
              ) : null}
            </section>
            {(current.verdict?.reference_issue || current.verdict?.capture_issue) && (
              <Status tone="warn">{t("reviewWhy")}: {reviewReason(current)}</Status>
            )}
            <section>
              <SectionHeading title={t("judgeRationale")} />
              <p className="p-evidence-text">{engineText(current.rationale)}</p>
              {current.criteria.length > 0 && (
                <DefinitionList
                  items={current.criteria.map((criterion) => ({
                    term: humanize(criterion.criterion_id),
                    value: (
                      <>
                        <strong>{criterion.score == null ? t("notScored") : criterion.score}</strong>
                        {criterion.rationale && <span className="p-cell-meta"> · {engineText(criterion.rationale)}</span>}
                      </>
                    ),
                  }))}
                />
              )}
              {current.judge_calibration && (
                <p className="p-cell-meta">
                  {t("judgeCalibration")}: {current.judge_calibration.examples} {t("calibrationExamples")}
                  {current.judge_calibration.agreement != null ? ` · ${Math.round(current.judge_calibration.agreement * 100)}% ${t("agreement")}` : ""}
                  {current.judge_calibration.adequate ? "" : ` · ${t("calibrationExperimental")}`}
                </p>
              )}
              {current.source_refs.length > 0 && (
                <p className="p-row p-cell-meta">
                  {t("sourceExcerpts")}
                  {current.source_refs.map((ref) => (
                    <code key={`${ref.source_revision_id}-${ref.anchor}`} className="p-code" title={ref.anchor}>
                      {ref.anchor.length > 12 ? ref.anchor.slice(0, 8) : ref.anchor}
                    </code>
                  ))}
                </p>
              )}
            </section>
            <form id="review-form" className="p-stack p-decision" onSubmit={decide}>
              <fieldset className="p-fieldset">
                <legend>{t("reviewDecision")}</legend>
                <div className="p-segmented" role="radiogroup" aria-label={t("reviewDecision")}>
                  {(["approve", "dispute", "override"] as const).map((value) => (
                    <label key={value} className="p-segment">
                      <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />
                      <span>{value === "approve" ? t("reviewApprove") : value === "dispute" ? t("reviewDispute") : t("reviewOverride")}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {decision === "override" && (
                <SelectField id="review-outcome" label={t("reviewOverrideOutcome")} value={outcome} onChange={(event) => setOutcome(event.target.value as keyof typeof scoreFor)}>
                  {Object.keys(scoreFor).map((value) => (
                    <option key={value} value={value}>
                      {humanize(value)}
                    </option>
                  ))}
                </SelectField>
              )}
              <TextArea id="review-reason" label={t("reviewReason")} value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={4000} rows={3} hint={t("reviewReasonHint")} />
              <p className="p-field-hint">{t("decisionsAreAppended")}</p>
            </form>
          </>
        )}
      </SidePanel>
    </>
  );
}
