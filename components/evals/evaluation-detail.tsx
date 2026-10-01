"use client";

/**
 * One evaluation, end to end: connect → prepare tests → run → results.
 * Each panel is a projection of persisted state, so closing the page or
 * switching devices never loses progress (spec §5.2, §5.3).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, Download, LifeBuoy, Pencil, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";
import { evalRequest, EvalRequestError } from "./api";
import {
  Action,
  ActionAnchor,
  ActionLink,
  Badge,
  EmptyState,
  PageHeading,
  Progress,
  SectionHeading,
  Status,
  StatusBadge,
  Steps,
  Time,
  humanize,
} from "./primitives";
import { OutcomeBar, percent } from "./charts";
import { ActionMenu } from "./overlays";
import { useItemActions } from "./item-actions";
import { PrepareEvaluation } from "./workspace-preparation";
import { ManualAnswers, publishPreliminaryManualReport } from "./workspace-manual-answers";
import { NoWorkspace } from "./workspace-evaluations";
import { useWorkspace, usePageCrumb } from "./workspace-context";
import { connectionLabel, useWorkspaceSummary } from "./workspace-data";
import { WebAppConnector } from "./web-app-connector";
import { evaluationStage, stepStates } from "./evaluation-stage";
import { t } from "@/lib/evals/messages/en";

type RunView = {
  run: { id: string; status: string; phase: string; execution_mode: string; suite_version_id: string; created_at: string; reason_code: string | null };
  units: Array<{ id: string; status: string }>;
  targetUsage: { calls: number; unknown: number };
};
type ReportData = { report: { current_revision_id: string | null }; revisions: Array<{ id: string; snapshot: ReportSnapshot }> };

const FINISHED_UNIT = new Set(["succeeded", "target_error", "transport_error", "timeout", "capture_incomplete", "unsupported", "canceled", "unknown_external_outcome"]);

function useElapsed(since: string | null | undefined, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!since) return null;
  const seconds = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

export function EvaluationJourney({ evaluationId }: { evaluationId: string }) {
  const { orgId, workspace, canWrite, canManage, operator, withOrg } = useWorkspace();
  const { summary, error, reload, retry } = useWorkspaceSummary(orgId);
  const [run, setRun] = useState<RunView | null>(null);
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const [caseCount, setCaseCount] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<{ message: string; help: string } | null>(null);
  const startKey = useRef(crypto.randomUUID());
  const router = useRouter();
  const deletedRef = useRef(false);
  const items = useItemActions(orgId, async () => {
    if (deletedRef.current) router.push(withOrg("/workspace/evaluations"));
    else await reload();
  });

  const evaluation = summary?.evaluations.find((item) => item.id === evaluationId);
  const system = summary?.systems.find((item) => item.project_id === evaluation?.project_id);
  const reportRow = summary?.reports.find((item) => item.evaluation_id === evaluationId);
  const latestRunId = evaluation?.latest_run_id;
  usePageCrumb(evaluation?.title);

  // Live run progress. Polling is bounded to this page and stops on leave.
  useEffect(() => {
    if (!latestRunId || !orgId) return;
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      try {
        const value = await evalRequest<RunView>(`/runs/${latestRunId}?orgId=${encodeURIComponent(orgId)}`);
        if (stopped) return;
        setRun(value);
        const active = ["queued", "running", "pause_requested", "cancel_requested", "paused"].includes(value.run.status);
        timer = window.setTimeout(() => void poll(), active ? 4_000 : 30_000);
      } catch {
        if (!stopped) timer = window.setTimeout(() => void poll(), 10_000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [latestRunId, orgId]);

  useEffect(() => {
    if (!reportRow || !orgId) return;
    let live = true;
    void evalRequest<ReportData>(`/reports/${reportRow.id}?orgId=${encodeURIComponent(orgId)}`)
      .then((value) => {
        if (!live) return;
        const current = value.revisions.find((item) => item.id === value.report.current_revision_id) ?? value.revisions[0];
        setReport(current?.snapshot ?? null);
      })
      .catch(() => live && setReport(null));
    return () => {
      live = false;
    };
  }, [orgId, reportRow]);

  const suiteVersionId = evaluation?.selected_suite_version_id;
  useEffect(() => {
    if (!suiteVersionId || !orgId) return;
    let live = true;
    void evalRequest<Array<{ suite_version_id: string; case_count: number }>>(`/suites?orgId=${encodeURIComponent(orgId)}`)
      .then((items) => live && setCaseCount(items.find((item) => item.suite_version_id === suiteVersionId)?.case_count ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [orgId, suiteVersionId]);

  const counts = useMemo(() => {
    const units = run?.units ?? [];
    return { total: units.length, done: units.filter((unit) => FINISHED_UNIT.has(unit.status)).length, pending: units.filter((unit) => unit.status === "pending").length };
  }, [run]);

  const runStatus = run?.run.status ?? evaluation?.latest_run_status ?? null;
  const running = !!runStatus && ["queued", "running", "pause_requested", "cancel_requested"].includes(runStatus);
  const elapsed = useElapsed(run?.run.created_at, running);

  const fail = useCallback((value: unknown) => {
    if (value instanceof EvalRequestError && value.code === "BUDGET_PAUSED") setActionError({ message: t("budgetPaused"), help: t("budgetPausedHelp") });
    else if (value instanceof EvalRequestError && value.code === "CONNECTION_UNSUPPORTED") setActionError({ message: t("unsupportedConnection"), help: t("unsupportedConnectionHelp") });
    else setActionError({ message: value instanceof Error ? value.message : t("error"), help: t("actionFailedHelp") });
  }, []);

  async function start() {
    if (!evaluation) return;
    setPending(true);
    setActionError(null);
    try {
      await evalRequest(`/evaluations/${evaluationId}/start`, "POST", { orgId, ...(system ? { targetRevisionId: system.target_revision_id } : {}) }, startKey.current);
      startKey.current = crypto.randomUUID();
      await reload();
    } catch (value) {
      fail(value);
    } finally {
      setPending(false);
    }
  }
  async function cancel() {
    if (!latestRunId) return;
    setPending(true);
    setActionError(null);
    try {
      await evalRequest(`/runs/${latestRunId}/control`, "POST", { orgId, action: "cancel" });
      await reload();
    } catch (value) {
      fail(value);
    } finally {
      setPending(false);
    }
  }
  async function finishManualReport() {
    if (!latestRunId) return;
    setPending(true);
    setActionError(null);
    try {
      await publishPreliminaryManualReport(orgId, latestRunId, evaluation?.title);
      await reload();
    } catch (value) {
      fail(value);
    } finally {
      setPending(false);
    }
  }

  if (!workspace) return <NoWorkspace />;
  if (error && !summary)
    return (
      <>
        <PageHeading title={t("evaluation")} />
        <Status error action={<Action variant="secondary" size="sm" onClick={retry}>{t("retry")}</Action>}>{error}</Status>
      </>
    );
  if (!summary)
    return (
      <div className="p-skeleton-page" role="status" aria-label={t("loading")}>
        <span className="p-skeleton" style={{ width: 120, height: 14 }} />
        <span className="p-skeleton" style={{ width: 320, height: 28 }} />
        <span className="p-skeleton" style={{ width: "100%", height: 160 }} />
      </div>
    );
  if (!evaluation)
    return (
      <>
        <PageHeading title={t("evaluation")} />
        <EmptyState title={t("evaluationNotFound")}>
          <p>{t("evaluationNotFoundHelp")}</p>
        </EmptyState>
      </>
    );

  const stage = evaluationStage({ ...evaluation, latest_run_status: runStatus }, !!reportRow);
  const executionMode = system?.document.kind === "imported_responses" ? "imported_responses" : "deployed_system";
  const awaitingManualAnswers = run?.run.execution_mode === "imported_responses" && counts.pending > 0 && !["canceled", "failed"].includes(run.run.status);
  const awaitingPrivateRunner = system?.document.kind === "private_runner" && run?.run.status === "paused" && run.run.reason_code === "runner_wait";
  const terminal = !!runStatus && ["completed", "partial", "failed", "canceled"].includes(runStatus);
  const canPrepareManualReport =
    !reportRow && canWrite && terminal && (run?.run.execution_mode === "imported_responses" || system?.document.kind === "private_runner") && ["completed", "partial"].includes(runStatus ?? "");

  const primary = reportRow ? (
      <ActionLink href={withOrg(`/workspace/reports/${reportRow.id}`)}>
        {t("openReport")}
        <ArrowRight aria-hidden="true" />
      </ActionLink>
    ) : null;

  const menu = [
    ...(running && canWrite ? [{ label: t("cancelRun"), icon: <Square />, onSelect: () => void cancel(), tone: "danger" as const }] : []),
    ...(terminal && canWrite && evaluation.selected_suite_version_id ? [{ label: t("runAgain"), icon: <RotateCcw />, onSelect: () => void start() }] : []),
    ...(evaluation.selected_suite_version_id && canWrite
      ? [{ label: t("downloadQuestionSheet"), icon: <Download />, href: `/api/evals/v1/suites/${evaluation.selected_suite_version_id}/candidate-template?orgId=${encodeURIComponent(orgId)}&format=csv`, external: true }]
      : []),
    ...(operator && evaluation.latest_run_id ? [{ label: t("inspectRun"), icon: <Activity />, href: `/ops/runs/${evaluation.latest_run_id}?orgId=${encodeURIComponent(orgId)}` }] : []),
    { label: t("requestAssistance"), icon: <LifeBuoy />, href: `mailto:hello@caudals.com?subject=${encodeURIComponent(`Evaluation assistance: ${evaluation.title}`)}`, external: true },
    ...(canWrite
      ? [
          { separator: true as const },
          { label: t("rename"), icon: <Pencil />, onSelect: () => { deletedRef.current = false; items.rename("evaluations", evaluation.id, evaluation.title); } },
          { label: t("delete"), icon: <Trash2 />, tone: "danger" as const, onSelect: () => { deletedRef.current = true; items.remove("evaluations", evaluation.id, evaluation.title); } },
        ]
      : []),
  ];

  return (
    <>
      <PageHeading
        title={evaluation.title}
        meta={
          <>
            <Badge tone={stage.tone} dot live={stage.live}>
              {stage.label}
            </Badge>
            {system && (
              <span>
                {system.title} · {connectionLabel(system.document.kind)}
              </span>
            )}
            {evaluation.created_at && (
              <span>
                {t("createdOn")} <Time value={evaluation.created_at} withTime={false} />
              </span>
            )}
          </>
        }
        actions={
          <>
            {primary}
            <ActionMenu label={t("moreActions")} items={menu} />
          </>
        }
      />
      <Steps steps={stepStates(stage)} label={t("evaluationProgress")} />
      {items.dialog}

      {actionError && (
        <Status error action={<Action variant="secondary" size="sm" onClick={() => setActionError(null)}>{t("dismiss")}</Action>}>
          <strong>{actionError.message}</strong> {actionError.help}
        </Status>
      )}

      {system?.document.kind === "website" && canManage && <WebAppConnector orgId={orgId} targetId={system.id} status={system.connection_status} errorCode={system.error_code} paused={run?.run.status === "paused"} onChanged={reload} />}

      {!run && !evaluation.selected_suite_version_id ? (
        canWrite ? (
          <PrepareEvaluation orgId={orgId} evaluation={evaluation} executionMode={executionMode} onReady={reload} />
        ) : (
          <Panel title={stage.label} live={stage.live}>
            <p>{t("viewerPreparationHelp")}</p>
          </Panel>
        )
      ) : !run && evaluation.latest_run_id ? (
        <Panel title={t("loadingRun")} live>
          <p>{t("closePageHelp")}</p>
        </Panel>
      ) : !run ? (
        <Panel title={t("readyToRunTitle")}>
          <p>
            {caseCount != null ? `${caseCount} ${caseCount === 1 ? t("testApproved") : t("testsApproved")}. ` : ""}
            {executionMode === "imported_responses" ? t("readyToRunManualHelp") : t("readyToRunHelp")}
          </p>
          {canWrite ? (
            <div className="p-row">
              <Action onClick={() => void start()} disabled={pending}>
                <Play aria-hidden="true" />
                {pending ? t("starting") : t("runEvaluation")}
              </Action>
            </div>
          ) : (
            <p className="p-cell-meta">{t("viewerRunHelp")}</p>
          )}
        </Panel>
      ) : awaitingManualAnswers ? (
        canWrite ? (
          <ManualAnswers orgId={orgId} projectId={evaluation.project_id} runId={run.run.id} suiteVersionId={run.run.suite_version_id} pendingCount={counts.pending} totalCount={counts.total} onSaved={reload} evaluationTitle={evaluation.title} />
        ) : (
          <Status>{t("waitingForAnswersViewer")}</Status>
        )
      ) : awaitingPrivateRunner ? (
        <Panel title={t("waitingForRunner")} live>
          <p>
            {counts.done} {t("of")} {counts.total} {t("testsReceived")}. {t("runnerWaitHelp")}
          </p>
          <Progress value={counts.done} max={Math.max(counts.total, 1)} label={t("testsReceived")} />
          {canWrite && (
            <div className="p-row">
              <ActionAnchor variant="secondary" href={`/api/evals/v1/runs/${run.run.id}/runner-bundle?orgId=${encodeURIComponent(orgId)}`}>
                <Download aria-hidden="true" />
                {t("downloadSignedBundle")}
              </ActionAnchor>
            </div>
          )}
        </Panel>
      ) : running ? (
        <Panel title={humanize(run.run.phase)} live>
          <div className="p-run-progress">
            <p className="p-run-count">
              <strong>{counts.done}</strong> {t("of")} {counts.total} {t("testsAnswered")}
            </p>
            <Progress value={counts.done} max={Math.max(counts.total, 1)} label={t("testsAnswered")} />
            <p className="p-cell-meta">
              {elapsed ? `${t("elapsed")} ${elapsed} · ` : ""}
              {t("closePageHelp")}
            </p>
          </div>
          {run.run.status === "cancel_requested" && <Status tone="warn">{t("cancelRequested")}</Status>}
        </Panel>
      ) : terminal ? (
        report ? (
          <ResultsSummary report={report} runStatus={runStatus!} targetCalls={run.run.execution_mode === "deployed_system" ? run.targetUsage : null} />
        ) : runStatus === "failed" ? (
          <Panel title={t("runFailedTitle")}>
            <p>{run.run.reason_code ? `${humanize(run.run.reason_code)}. ` : ""}{t("runFailedHelp")}</p>
            {canWrite && (
              <div className="p-row">
                <Action variant="secondary" onClick={() => void start()} disabled={pending}>
                  <RotateCcw aria-hidden="true" />
                  {t("runAgain")}
                </Action>
              </div>
            )}
          </Panel>
        ) : runStatus === "canceled" ? (
          <Panel title={t("runCanceledTitle")}>
            <p>{t("runCanceledHelp")}</p>
          </Panel>
        ) : canPrepareManualReport ? (
          <Panel title={t("answersReceivedTitle")}>
            <p>{t("answersReceivedHelp")}</p>
            <div className="p-row">
              <Action onClick={() => void finishManualReport()} disabled={pending}>
                {pending ? t("preparing") : t("preparePreliminaryReport")}
              </Action>
            </div>
          </Panel>
        ) : (
          <Panel title={t("reviewingResults")} live>
            <p>{t("reviewingResultsHelp")}</p>
          </Panel>
        )
      ) : null}
    </>
  );
}

function Panel({ title, live = false, children }: { title: string; live?: boolean; children: React.ReactNode }) {
  return (
    <section className="p-panel-block" aria-live="polite">
      <div className="p-panel-block-head">
        {live && <span className="p-spinner" aria-hidden="true" />}
        <h2>{title}</h2>
      </div>
      <div className="p-panel-block-body">{children}</div>
    </section>
  );
}

function ResultsSummary({
  report,
  runStatus,
  targetCalls,
}: {
  report: ReportSnapshot;
  runStatus: string;
  targetCalls: { calls: number; unknown: number } | null;
}) {
  const m = report.metrics;
  const findings = [...report.findings].sort((a, b) => ["critical", "high", "medium", "low"].indexOf(a.severity) - ["critical", "high", "medium", "low"].indexOf(b.severity)).slice(0, 3);
  return (
    <section className="p-results" aria-labelledby="results-title">
      <div className="p-results-head">
        <div>
          <p className="p-eyebrow" id="results-title">
            {t("strictPassRate")}
          </p>
          <p className="p-score" data-empty={m.strict_pass_rate == null ? "true" : undefined}>{m.strict_pass_rate == null ? t("noScoreYet") : percent(m.strict_pass_rate, 1)}</p>
          <p className="p-cell-meta">
            {m.n_pass} {t("passedOf")} {m.n_scorable} {t("assessedTests")}
            {m.wilson_interval ? ` · 95% ${t("interval")} ${percent(m.wilson_interval.low)}–${percent(m.wilson_interval.high)}` : ""}
          </p>
        </div>
        <div className="p-row">
          <StatusBadge value={report.scope.review_status} />
          {m.headline_status === "incomplete" && <StatusBadge value="incomplete" />}
          {runStatus === "partial" && <StatusBadge value="partial" />}
        </div>
      </div>
      <OutcomeBar counts={{ pass: m.n_pass, partial: m.n_partial, fail: m.n_fail, unscorable: m.n_unscorable }} label={t("outcomes")} />
      {m.n_unscorable > 0 && <p className="p-field-hint">{t("awaitingReviewNote")}</p>}
      {m.headline_status === "incomplete" && <Status tone="warn">{t("incompleteReport")}</Status>}
      {findings.length > 0 && (
        <div>
          <SectionHeading title={t("topFindings")} />
          <ul className="p-findings-compact">
            {findings.map((finding) => (
              <li key={finding.id}>
                <StatusBadge value={finding.severity} />
                <span className="p-findings-title">{finding.title}</span>
                <span className="p-cell-meta">
                  {finding.frequency_n}/{finding.frequency_denominator}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {targetCalls && (
        <p className="p-cell-meta">
          {t("externalTargetCalls")}: {targetCalls.calls}. {t("externalTargetCostHelp")}
          {targetCalls.unknown > 0 && ` ${t("externalTargetUnknown")}: ${targetCalls.unknown}.`}
        </p>
      )}
    </section>
  );
}
