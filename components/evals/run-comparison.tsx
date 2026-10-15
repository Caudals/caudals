"use client";

/**
 * Run again → compare (launch L-18, spec v2 P-19). After a second run of the
 * same evaluation, the comparison with the run before it opens on its own:
 * on the evaluation's results and at the top of the run's report, with
 * improved / regressed / unchanged counts, the score against last time and
 * the questions that moved, each opening its answer. Runs on different test
 * sets (or rubrics, graders, conditions) are never set side by side: the
 * panel says why they are not comparable. "Re-run these questions" (L-17's
 * fixes) lists its questions first.
 *
 * Data: GET /api/evals/v1/runs/:id/comparison (lib/evals/monitoring/run-comparison.ts).
 * `CompareRunsDialog` compares with a run the person picks (and still records
 * the comparison with POST /comparisons, as before).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, ActionLink, Badge, SectionHeading, SelectField, Stat, StatGrid, Status, StatusBadge, formatDate } from "./primitives";
import { Modal } from "./overlays";
import { ResultBadge } from "./result-labels";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";

type Outcome = "pass" | "partial" | "fail" | "unscorable";
type Score = { pass: number; scored: number };
type Side = { runId: string; evaluationId?: string; status: string; createdAt: string; reportId: string | null; score: Score };
type Change = { caseRevisionId: string; title: string; severity: string; before: Outcome; after: Outcome; direction: "improved" | "regressed"; assessmentId: string | null; baselineAssessmentId: string | null };
type Focus = { caseRevisionId: string; title: string; severity: string; before: Outcome | null; after: Outcome | null; assessmentId: string | null };
/** GET /runs/:id/comparison. */
export type RunComparisonData = {
  candidate: Side;
  baseline: Side | null;
  comparable: boolean;
  reasons: string[];
  status: string | null;
  counts: { improved: number; regressed: number; unchanged: number; unassessed: number; added: number; removed: number } | null;
  changes: Change[];
  focus: Focus[];
};

const REASON: Record<string, MessageKey> = {
  suite_changed: "comparisonReasonSuite", rubric_changed: "comparisonReasonRubric", scorer_changed: "comparisonReasonScorer",
  candidate_context_changed: "comparisonReasonContext", tool_policy_changed: "comparisonReasonTools", repetition_policy_changed: "comparisonReasonRepetitions",
  execution_conditions_changed: "comparisonReasonConditions", no_baseline: "comparisonReasonNoBaseline", coverage_inadequate: "comparisonReasonCoverage",
  paired_coverage_inadequate: "comparisonReasonPairedCoverage", mixed_change: "comparisonReasonMixed", run_failed: "comparisonReasonFailed",
  run_incomplete: "comparisonReasonIncomplete",
};
/** One reason code in words ("the test set changed"). */
export function comparisonReason(code: string) {
  return t(REASON[code] ?? "comparisonReasonOther");
}
export function comparisonReasons(codes: string[]) {
  const words = [...new Set((codes.length ? codes : ["incomparable"]).map(comparisonReason))];
  return words.join("; ");
}
/** "72 %" in the interface language; "—" without scored answers. */
export function scorePercent(score: Score | null | undefined) {
  if (!score || !score.scored) return "—";
  return new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB", { style: "percent", maximumFractionDigits: 0 }).format(score.pass / score.scored);
}

/** "Score 62%, was 50%." — or, when this run has no scored answer, "No score in this run; was 50%." instead of a dash. */
function comparisonScoreText(now: Score | null | undefined, before: Score | null | undefined) {
  return now?.scored ? tv("comparisonScore", { now: scorePercent(now), before: scorePercent(before) }) : tv("comparisonScoreNone", { before: scorePercent(before) });
}

function OutcomeBadge({ outcome }: { outcome: Outcome | null }) {
  if (!outcome || outcome === "unscorable") return <Badge tone="neutral">{t("comparisonNotScored")}</Badge>;
  return <ResultBadge result={{ outcome }} />;
}

export function useRunComparison(orgId: string, runId: string | null | undefined, options: { baselineRunId?: string | null; focus?: string[]; enabled?: boolean } = {}) {
  const [state, setState] = useState<{ key: string; data: RunComparisonData | null; error: boolean } | null>(null);
  const focus = (options.focus ?? []).slice(0, 50).join(",");
  const key = `${orgId}|${runId ?? ""}|${options.baselineRunId ?? ""}|${focus}`;
  const enabled = options.enabled !== false && !!orgId && !!runId;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const query = new URLSearchParams({ orgId });
    if (options.baselineRunId) query.set("baselineRunId", options.baselineRunId);
    if (focus) query.set("focus", focus);
    void evalRequest<RunComparisonData>(`/runs/${runId}/comparison?${query.toString()}`)
      .then(data => live && setState({ key, data, error: false }))
      .catch(() => live && setState({ key, data: null, error: true }));
    return () => { live = false; };
  }, [enabled, key, orgId, runId, options.baselineRunId, focus]);
  const current = state?.key === key ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? false, loading: enabled && !current };
}

function ChangeList({ items, label, open }: { items: Array<{ caseRevisionId: string; title: string; before: Outcome | null; after: Outcome | null; assessmentId: string | null; direction?: "improved" | "regressed" }>; label: string; open: (assessmentId: string) => { href?: string; onClick?: () => void } | null }) {
  return (
    <ul className="p-findings-compact" data-wrap="true" aria-label={label}>
      {items.map(item => {
        const target = item.assessmentId ? open(item.assessmentId) : null;
        return (
          <li key={item.caseRevisionId}>
            {item.direction && <Badge tone={item.direction === "improved" ? "pass" : "fail"} dot>{t(item.direction)}</Badge>}
            {target?.href ? <Link className="p-findings-title" href={target.href}>{item.title}</Link>
              : target?.onClick ? <button type="button" className="p-findings-title p-text-button" onClick={target.onClick}>{item.title}</button>
                : <span className="p-findings-title">{item.title}</span>}
            <span className="p-row p-nowrap">
              <OutcomeBadge outcome={item.before} />
              <span aria-hidden="true">→</span>
              <OutcomeBadge outcome={item.after} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The comparison of a run with the one before it, shown on its own once a
 * second run exists. Renders nothing for a first run. `openResult` opens a
 * question's answer (a link to the report, or the report's own drawer);
 * `scrollIntoView` brings it into view once it loads (after "Run again").
 */
export function RunComparisonPanel({ orgId, runId, focus, ...view }: {
  orgId: string;
  runId: string;
  focus?: string[];
  openResult: (assessmentId: string) => { href?: string; onClick?: () => void } | null;
  baselineReportHref?: (reportId: string) => string;
  scrollIntoView?: boolean;
  compact?: boolean;
}) {
  const state = useRunComparison(orgId, runId, { focus });
  return <RunComparisonView runId={runId} {...state} {...view} />;
}

/** The comparison panel for data already loaded (the report page loads it once for the panel and its re-run). */
export function RunComparisonView({ runId, data, error, loading, openResult, baselineReportHref, scrollIntoView = false, compact = false }: {
  runId: string;
  data: RunComparisonData | null;
  error: boolean;
  loading: boolean;
  openResult: (assessmentId: string) => { href?: string; onClick?: () => void } | null;
  baselineReportHref?: (reportId: string) => string;
  scrollIntoView?: boolean;
  compact?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const region = useRef<HTMLElement | null>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!scrollIntoView || scrolled.current || !data?.baseline) return;
    scrolled.current = true;
    region.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [scrollIntoView, data]);
  if (loading) return compact ? null : <p className="p-cell-meta" role="status">{t("comparisonLoading")}</p>;
  if (error) return compact ? null : <Status tone="warn">{t("comparisonError")}</Status>;
  if (!data?.baseline) return null;
  const date = formatDate(data.baseline.createdAt, true);
  const title = tv("comparisonTitle", { date });
  const baselineHref = data.baseline.reportId && baselineReportHref ? baselineReportHref(data.baseline.reportId) : null;
  const changes = showAll ? data.changes : data.changes.slice(0, 8);
  const focusItems = data.focus.length ? data.focus : [];
  return (
    <section className="p-section p-comparison" ref={region} aria-labelledby={`comparison-${runId}`} data-comparison={data.comparable ? "comparable" : "not-comparable"}>
      <div className="p-section-head">
        <div className="p-head-text">
          <h2 id={`comparison-${runId}`} ref={heading} tabIndex={-1}>{title}</h2>
          <p>{t("comparisonHelp")}</p>
        </div>
        {baselineHref && (
          <div className="p-head-actions">
            <ActionLink variant="ghost" size="sm" href={baselineHref}>{t("comparisonOpenBaseline")}<ArrowRight aria-hidden="true" /></ActionLink>
          </div>
        )}
      </div>
      {!data.comparable ? (
        <Status tone="info">{tv("comparisonNotComparable", { reasons: comparisonReasons(data.reasons) })}</Status>
      ) : (
        <>
          <p className="p-comparison-score" data-testid="comparison-score">{comparisonScoreText(data.candidate.score, data.baseline.score)}</p>
          <StatGrid>
            <Stat label={t("improved")} value={data.counts?.improved ?? 0} />
            <Stat label={t("regressed")} value={data.counts?.regressed ?? 0} />
            <Stat label={t("unchanged")} value={data.counts?.unchanged ?? 0} />
          </StatGrid>
          {(data.counts?.unassessed ?? 0) > 0 && <p className="p-cell-meta">{t("unassessedPairs")}: {data.counts?.unassessed}</p>}
          {data.status === "inconclusive" && <p className="p-cell-meta">{comparisonReason("mixed_change")}</p>}
          {focusItems.length > 0 && (
            <div>
              <SectionHeading title={t("comparisonFocusTitle")} />
              <ChangeList items={focusItems} label={t("comparisonFocusTitle")} open={openResult} />
            </div>
          )}
          <div>
            <SectionHeading title={t("comparisonChanged")} />
            {data.changes.length ? (
              <>
                <ChangeList items={changes} label={t("comparisonChanged")} open={openResult} />
                {data.changes.length > 8 && !showAll && (
                  <Action variant="ghost" size="sm" onClick={() => setShowAll(true)}>{tv("comparisonMore", { n: 8 })}</Action>
                )}
              </>
            ) : <p className="p-cell-meta">{t("comparisonNoChanges")}</p>}
          </div>
        </>
      )}
    </section>
  );
}

type RunRow = { id: string; status: string; created_at: string; suite_version_id: string };
type StoredComparison = { status: string; improved?: number; regressed?: number; unchanged?: number; unassessed?: number; reasons?: string[] };

/** Compare a run with an earlier run the person picks (the report's and the results' "Compare"). */
export function CompareRunsDialog({ open, onOpenChange, orgId, runId, openResult }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  runId: string;
  openResult: (assessmentId: string) => { href?: string; onClick?: () => void } | null;
}) {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [baseline, setBaseline] = useState("");
  const [stored, setStored] = useState<StoredComparison | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const details = useRunComparison(orgId, runId, { baselineRunId: chosen, enabled: !!chosen });
  useEffect(() => {
    if (!open) return;
    setStored(null);
    setChosen(null);
    void evalRequest<RunRow[]>(`/runs?orgId=${encodeURIComponent(orgId)}&relatedRunId=${runId}`)
      .then(rows => setRuns(rows.filter(row => row.id !== runId && ["completed", "partial"].includes(row.status))))
      .catch(() => setRuns([]));
  }, [open, orgId, runId]);
  async function compare(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      setStored(await evalRequest<StoredComparison>("/comparisons", "POST", { orgId, baselineRunId: baseline, candidateRunId: runId }));
      setChosen(baseline);
    } catch (reason) {
      setError(reason instanceof EvalRequestError ? reason.message : reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t("compareRuns")} description={t("compareHelp")} size="lg"
      footer={runs?.length ? (
        <>
          <Action variant="secondary" onClick={() => onOpenChange(false)}>{t("close")}</Action>
          <Action type="submit" form="compare-form" disabled={!baseline || pending}>{pending ? t("working") : t("compare")}</Action>
        </>
      ) : <Action variant="secondary" onClick={() => onOpenChange(false)}>{t("close")}</Action>}>
      {error && <Status error>{error}</Status>}
      {runs === null ? <p className="p-cell-meta">{t("loading")}</p> : runs.length ? (
        <form id="compare-form" onSubmit={compare}>
          <SelectField id="compare-baseline" label={t("compareWith")} value={baseline} onChange={event => setBaseline(event.target.value)} required>
            <option value="">{t("selectRun")}</option>
            {runs.map(run => <option key={run.id} value={run.id}>{formatDate(run.created_at, true)} · {run.status}</option>)}
          </SelectField>
        </form>
      ) : <Status>{t("noComparableRuns")}</Status>}
      {stored && (
        <div className="p-compare" aria-live="polite">
          <StatusBadge value={stored.status} />
          {stored.status !== "incompatible" ? (
            <dl className="p-compare-grid">
              <div><dt>{t("improved")}</dt><dd>{stored.improved ?? 0}</dd></div>
              <div><dt>{t("regressed")}</dt><dd>{stored.regressed ?? 0}</dd></div>
              <div><dt>{t("unchanged")}</dt><dd>{stored.unchanged ?? 0}</dd></div>
              <div><dt>{t("unassessedPairs")}</dt><dd>{stored.unassessed ?? 0}</dd></div>
            </dl>
          ) : <p className="p-cell-meta">{tv("comparisonNotComparable", { reasons: comparisonReasons(stored.reasons ?? []) })}</p>}
          {details.data?.comparable && (
            <>
              <p className="p-cell-meta">{comparisonScoreText(details.data.candidate.score, details.data.baseline?.score)}</p>
              {details.data.changes.length ? <ChangeList items={details.data.changes} label={t("comparisonChanged")} open={openResult} /> : <p className="p-cell-meta">{t("comparisonNoChanges")}</p>}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
