"use client";

/**
 * The evaluation report (spec §5.4, §15.2): Overview · Findings · Test results
 * · Improvements · Methodology. Every figure states its denominator; an
 * incomplete run shows its limitations before any score; every finding links
 * to the results that support it. The same snapshot renders the PDF.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, FileSearch, Inbox, Lightbulb, ListChecks, X } from "lucide-react";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";
import { evalRequest } from "./api";
import {
  Action,
  DataTable,
  DefinitionList,
  EmptyState,
  FilterChips,
  InlineSelect,
  PageHeading,
  SearchInput,
  SectionHeading,
  Stat,
  StatGrid,
  Status,
  StatusBadge,
  Tabs,
  Toolbar,
  formatDate,
  formatMoney,
  humanize,
} from "./primitives";
import { BarList, OutcomeBar, percent } from "./charts";
import { SidePanel } from "./overlays";
import { ReportActions, type ReportRevision } from "./report-actions";
import { useWorkspace, usePageCrumb } from "./workspace-context";
import { t } from "@/lib/evals/messages/en";

type Tab = "overview" | "findings" | "results" | "improvements" | "methodology";
type Result = ReportSnapshot["results"][number];
type Finding = ReportSnapshot["findings"][number];
const SEVERITY = ["critical", "high", "medium", "low"] as const;
const MODE: Record<string, string> = {
  deployed_system: "Deployed system",
  controlled_model: "Controlled model",
  imported_responses: "Imported answers",
};

function bySeverity<T extends { severity: string }>(items: T[]) {
  return [...items].sort((a, b) => SEVERITY.indexOf(a.severity as never) - SEVERITY.indexOf(b.severity as never));
}

/* ----------------------------------------------------------------- view --- */

export function ReportView({
  report,
  actions,
  heading = true,
  initialResult,
  onResultChange,
}: {
  report: Partial<ReportSnapshot>;
  actions?: ReactNode;
  heading?: boolean;
  initialResult?: string | null;
  onResultChange?: (assessmentId: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>(initialResult ? "results" : "overview");
  const [resultFilter, setResultFilter] = useState<{ ids: string[]; label: string } | null>(null);
  const results = report.results ?? [];
  const findings = bySeverity(report.findings ?? []);
  const improvements = [...(report.improvements ?? [])].sort((a, b) => a.priority - b.priority);
  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: "overview", label: t("overview") },
    ...(report.findings ? [{ value: "findings" as const, label: t("findings"), count: findings.length }] : []),
    ...(report.results ? [{ value: "results" as const, label: t("testResults"), count: results.length }] : []),
    ...(report.improvements ? [{ value: "improvements" as const, label: t("improvements"), count: improvements.length }] : []),
    ...(report.methodology ? [{ value: "methodology" as const, label: t("methodology") }] : []),
  ];

  function showResults(ids: string[], label: string) {
    setResultFilter({ ids, label });
    setTab("results");
  }

  return (
    <div className="p-report">
      {heading && (
        <PageHeading
          title={report.system?.name ?? t("report")}
          meta={
            <>
              {report.scope && <StatusBadge value={report.scope.review_status} />}
              {report.metrics && <StatusBadge value={report.metrics.headline_status} />}
              {report.system && <span>{MODE[report.system.execution_mode] ?? humanize(report.system.execution_mode)}</span>}
              {report.scope && (
                <span>
                  {formatDate(report.scope.started_at)}
                  {formatDate(report.scope.finished_at) !== formatDate(report.scope.started_at) ? ` – ${formatDate(report.scope.finished_at)}` : ""}
                </span>
              )}
            </>
          }
          actions={actions}
        >
          {report.system?.purpose}
        </PageHeading>
      )}
      <Tabs value={tab} onChange={setTab} label={t("reportSections")} options={tabs} />
      {tab === "overview" && <Overview report={report} findings={findings} onFinding={() => setTab("findings")} onResults={showResults} />}
      {tab === "findings" && <Findings findings={findings} onResults={showResults} />}
      {tab === "results" && (
        <Results
          results={results}
          filter={resultFilter}
          onClearFilter={() => setResultFilter(null)}
          initialResult={initialResult ?? null}
          onResultChange={onResultChange}
        />
      )}
      {tab === "improvements" && <Improvements improvements={improvements} findings={findings} />}
      {tab === "methodology" && <Methodology report={report} />}
    </div>
  );
}

/* ------------------------------------------------------------- overview --- */

function Overview({
  report,
  findings,
  onFinding,
  onResults,
}: {
  report: Partial<ReportSnapshot>;
  findings: Finding[];
  onFinding: () => void;
  onResults: (ids: string[], label: string) => void;
}) {
  const m = report.metrics;
  const results = useMemo(() => report.results ?? [], [report.results]);
  const topics = useMemo(() => {
    const map = new Map<string, { pass: number; scored: number }>();
    for (const item of results) {
      if (item.outcome === "unscorable") continue;
      const entry = map.get(item.topic) ?? { pass: 0, scored: 0 };
      entry.scored += 1;
      if (item.outcome === "pass") entry.pass += 1;
      map.set(item.topic, entry);
    }
    return [...map.entries()].map(([topic, value]) => ({ label: humanize(topic), value: value.pass, total: value.scored })).sort((a, b) => a.value / a.total - b.value / b.total);
  }, [results]);
  const severity = useMemo(
    () =>
      SEVERITY.map((level) => {
        const scoped = results.filter((item) => item.severity === level && item.outcome !== "unscorable");
        return { label: humanize(level), value: scoped.filter((item) => item.outcome === "pass").length, total: scoped.length };
      }).filter((item) => item.total > 0),
    [results],
  );
  const criticalFailed = results.filter((item) => item.severity === "critical" && (item.outcome === "fail" || item.outcome === "partial"));

  if (!m) return <Status>{t("reportMetricsHidden")}</Status>;
  return (
    <div className="p-stack-lg">
      {m.headline_status === "incomplete" && (
        <Status tone="warn">
          <strong>{t("incompleteHeadline")}</strong> {t("incompleteReport")}
          {report.methodology?.limitations.length ? (
            <ul className="p-inline-list">
              {report.methodology.limitations.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : null}
        </Status>
      )}
      <section className="p-scoreboard" aria-label={t("headlineResult")}>
        <div className="p-scoreboard-main">
          <p className="p-eyebrow">{t("strictPassRate")}</p>
          <p className="p-score" data-empty={m.strict_pass_rate == null ? "true" : undefined}>{m.strict_pass_rate == null ? t("noScoreYet") : percent(m.strict_pass_rate, 1)}</p>
          <p className="p-scoreboard-caption">
            {m.n_pass} {t("of")} {m.n_scorable} {t("assessedTestsPassed")}
            {m.wilson_interval ? (
              <>
                {" · "}
                <span title={t("wilsonHelp")}>
                  95% {t("interval")} {percent(m.wilson_interval.low)}–{percent(m.wilson_interval.high)}
                </span>
              </>
            ) : null}
          </p>
          <OutcomeBar counts={{ pass: m.n_pass, partial: m.n_partial, fail: m.n_fail, unscorable: m.n_unscorable }} label={t("outcomes")} />
      {m.n_unscorable > 0 && <p className="p-field-hint">{t("awaitingReviewNote")}</p>}
        </div>
        <StatGrid>
          <Stat label={t("assessedCoverage")} value={percent(m.assessed_coverage)} meta={`${m.n_scorable} ${t("of")} ${m.n_eligible} ${t("eligibleTestsLower")}`} />
          <Stat label={t("criticalFailures")} value={criticalFailed.length} meta={m.critical_unassessed ? `${m.critical_unassessed} ${t("criticalUnassessed")}` : t("criticalFailuresHelp")} />
          {m.rubric_score != null ? <Stat label={t("rubricScore")} value={`${Math.round(m.rubric_score)}/100`} meta={t("rubricScoreHelp")} /> : <Stat label={t("findings")} value={findings.length} meta={t("findingsHelp")} />}
        </StatGrid>
      </section>

      {report.takeaways && report.takeaways.length > 0 && (
        <section>
          <SectionHeading title={t("keyTakeaways")} />
          <ol className="p-takeaways">
            {report.takeaways.map((item, index) => (
              <li key={index}>
                <span className="p-takeaway-index">{index + 1}</span>
                <p>{item.text}</p>
                {item.assessment_ids.length > 0 && (
                  <button type="button" className="p-text-button" onClick={() => onResults(item.assessment_ids, item.text)}>
                    {t("evidence")} ({item.assessment_ids.length})
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(topics.length > 1 || severity.length > 0) && (
        <div className="p-split">
          {topics.length > 1 && (
            <section>
              <SectionHeading title={t("passRateByTopic")}>{t("passRateByTopicHelp")}</SectionHeading>
              <BarList items={topics} label={t("passRateByTopic")} />
            </section>
          )}
          {severity.length > 0 && (
            <section>
              <SectionHeading title={t("passRateBySeverity")}>{t("passRateBySeverityHelp")}</SectionHeading>
              <BarList items={severity} label={t("passRateBySeverity")} />
            </section>
          )}
        </div>
      )}

      <section>
        <SectionHeading
          title={t("topFindings")}
          actions={
            findings.length > 3 ? (
              <Action variant="ghost" size="sm" onClick={onFinding}>
                {t("allFindings")}
                <ArrowRight aria-hidden="true" />
              </Action>
            ) : undefined
          }
        />
        {findings.length ? (
          <ul className="p-findings-compact">
            {findings.slice(0, 3).map((finding) => (
              <li key={finding.id}>
                <StatusBadge value={finding.severity} />
                <button type="button" className="p-findings-title p-text-button" onClick={onFinding}>
                  {finding.title}
                </button>
                <span className="p-cell-meta">
                  {finding.frequency_n}/{finding.frequency_denominator}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-cell-meta">{t("noFindings")}</p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- findings --- */

function Findings({ findings, onResults }: { findings: Finding[]; onResults: (ids: string[], label: string) => void }) {
  if (!findings.length)
    return (
      <EmptyState title={t("noFindings")} icon={<FileSearch />}>
        <p>{t("noFindingsHelp")}</p>
      </EmptyState>
    );
  return (
    <ol className="p-findings">
      {findings.map((finding, index) => (
        <li key={finding.id} className="p-finding" id={`finding-${finding.id}`}>
          <div className="p-finding-head">
            <span className="p-finding-index">{index + 1}</span>
            <h3>{finding.title}</h3>
          </div>
          <div className="p-finding-meta">
            <StatusBadge value={finding.severity} />
            <span>
              {finding.frequency_n} {t("of")} {finding.frequency_denominator} {t("relevantResults")}
            </span>
            <span>
              {t("evidenceStrength")}: {humanize(finding.evidence_strength)}
            </span>
          </div>
          <dl className="p-finding-body">
            <div>
              <dt>{t("observed")}</dt>
              <dd>{finding.observation}</dd>
            </div>
            {finding.cause_hypothesis && (
              <div>
                <dt>{t("hypothesis")}</dt>
                <dd>{finding.cause_hypothesis}</dd>
              </div>
            )}
            <div>
              <dt>{t("recommendedAction")}</dt>
              <dd>{finding.recommendation}</dd>
            </div>
          </dl>
          {finding.assessment_ids.length > 0 && (
            <button type="button" className="p-text-button" onClick={() => onResults(finding.assessment_ids, finding.title)}>
              {t("viewSupportingResults")} ({finding.assessment_ids.length})
              <ArrowRight aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------- results --- */

type OutcomeFilter = "all" | "fail" | "partial" | "pass" | "unscorable";

function Results({
  results,
  filter,
  onClearFilter,
  initialResult,
  onResultChange,
}: {
  results: Result[];
  filter: { ids: string[]; label: string } | null;
  onClearFilter: () => void;
  initialResult: string | null;
  onResultChange?: (assessmentId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [severity, setSeverity] = useState("all");
  const [topic, setTopic] = useState("all");
  const [selected, setSelected] = useState<string | null>(initialResult);
  const topics = useMemo(() => [...new Set(results.map((item) => item.topic))].sort(), [results]);
  const count = (value: OutcomeFilter) => results.filter((item) => value === "all" || item.outcome === value).length;
  const needle = query.trim().toLowerCase();
  const visible = results
    .filter(
      (item) =>
        (!filter || filter.ids.includes(item.assessment_id)) &&
        (outcome === "all" || item.outcome === outcome) &&
        (severity === "all" || item.severity === severity) &&
        (topic === "all" || item.topic === topic) &&
        (!needle || `${item.title} ${item.input} ${item.output} ${item.topic}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => ["fail", "partial", "unscorable", "pass"].indexOf(a.outcome) - ["fail", "partial", "unscorable", "pass"].indexOf(b.outcome) || SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  const current = results.find((item) => item.assessment_id === selected) ?? null;
  // Spec §1518: the desktop inspector is nonmodal; below it, details are a modal dialog.
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);

  const [lastOpened, setLastOpened] = useState<string | null>(initialResult);
  function open(id: string | null) {
    if (id) setLastOpened(id);
    setSelected(id);
    onResultChange?.(id);
  }

  if (!results.length)
    return (
      <EmptyState title={t("noResultsShared")} icon={<ListChecks />}>
        <p>{t("noResultsSharedHelp")}</p>
      </EmptyState>
    );

  return (
    <>
      {filter && (
        <Status
          tone="info"
          action={
            <Action variant="ghost" size="sm" onClick={onClearFilter}>
              {t("showAll")}
            </Action>
          }
        >
          {t("showingEvidenceFor")} “{filter.label}”
        </Status>
      )}
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} label={t("searchResults")} />
        {topics.length > 1 && (
          <InlineSelect id="result-topic" label={t("topic")} value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option value="all">{t("all")}</option>
            {topics.map((item) => (
              <option key={item} value={item}>{humanize(item)}</option>
            ))}
          </InlineSelect>
        )}
        <InlineSelect id="result-severity" label={t("severity")} value={severity} onChange={(event) => setSeverity(event.target.value)}>
          <option value="all">{t("all")}</option>
          {SEVERITY.map((item) => (
            <option key={item} value={item}>{humanize(item)}</option>
          ))}
        </InlineSelect>
      </Toolbar>
      <div className="p-toolbar">
        <FilterChips
          value={outcome}
          onChange={setOutcome}
          label={t("filterOutcome")}
          options={[
            { value: "all", label: t("all"), count: count("all") },
            { value: "fail", label: humanize("fail"), count: count("fail") },
            { value: "partial", label: t("partialLabel"), count: count("partial") },
            { value: "pass", label: humanize("pass"), count: count("pass") },
            { value: "unscorable", label: humanize("unscorable"), count: count("unscorable") },
          ]}
        />
      </div>
      <div className={desktop && current ? "p-inspect" : undefined}>
      {visible.length ? (
        <DataTable caption={t("testResults")} headers={[t("test"), t("severity"), t("outcome"), { label: t("review"), align: "end" }]}>
          {visible.map((item) => (
            <tr key={item.assessment_id} data-selected={item.assessment_id === selected ? "true" : undefined}>
              <th scope="row">
                <span className="p-table-primary">
                  <button type="button" className="p-row-link p-row-button" data-result={item.assessment_id} onClick={() => open(item.assessment_id)}>
                    {item.title}
                  </button>
                  <span className="p-cell-meta">{humanize(item.topic)}</span>
                </span>
              </th>
              <td>
                <StatusBadge value={item.severity} />
              </td>
              <td>
                <StatusBadge value={item.outcome} />
              </td>
              <td className="p-table-action p-cell-meta">{humanize(item.review_status)}</td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState title={t("noMatchingResults")} icon={<Inbox />}>
          <p>{t("noMatchingEvaluationsHelp")}</p>
        </EmptyState>
      )}
      {desktop && current && (
        <aside className="p-inspector" aria-label={`${t("result")}: ${current.title}`}>
          <div className="p-inspector-head">
            <div>
              <h2 className="p-panel-title">{current.title}</h2>
              <p className="p-row p-cell-meta">
                <StatusBadge value={current.outcome} />
                <StatusBadge value={current.severity} />
                <span>{humanize(current.topic)}</span>
              </p>
            </div>
            <button type="button" className="p-btn" data-variant="ghost" data-shape="icon" aria-label={t("close")} onClick={() => open(null)}>
              <X aria-hidden="true" />
            </button>
          </div>
          <ResultEvidence result={current} />
        </aside>
      )}
      </div>
      <SidePanel
        open={!desktop && !!current}
        onOpenChange={(value) => !value && open(null)}
        returnFocus={() => (lastOpened ? document.querySelector<HTMLElement>(`[data-result="${CSS.escape(lastOpened)}"]`) : null)}
        title={current?.title ?? t("result")}
        description={
          current ? (
            <>
              <StatusBadge value={current.outcome} />
              <StatusBadge value={current.severity} />
              <span>{humanize(current.topic)}</span>
            </>
          ) : undefined
        }
        wide
      >
        {current && <ResultEvidence result={current} />}
      </SidePanel>
    </>
  );
}

const DESKTOP = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function ResultEvidence({ result }: { result: Result }) {
  return (
    <div className="p-evidence">
      <div className="p-transcript">
        <div className="p-bubble" data-role="user">
          <span className="p-bubble-role">{t("question")}</span>
          <p>{result.input}</p>
        </div>
        <div className="p-bubble" data-role="assistant">
          <span className="p-bubble-role">{t("systemAnswer")}</span>
          <p>{result.output || <span className="p-cell-meta">{t("emptyAnswer")}</span>}</p>
        </div>
      </div>
      <section>
        <SectionHeading title={t("assessment")} />
        <p className="p-evidence-text">{result.rationale}</p>
      </section>
      <section>
        <SectionHeading title={t("sourceEvidence")} />
        {result.source_refs.length ? (
          <ul className="p-refs">
            {result.source_refs.map((ref) => (
              <li key={`${ref.source_revision_id}-${ref.anchor}`}>
                <span>
                  {t("excerptLabel")} <code className="p-code" title={ref.anchor}>{/^[0-9a-f-]{36}$/i.test(ref.anchor) ? ref.anchor.slice(0, 8) : ref.anchor}</code>
                </span>
                <span className="p-cell-meta">{t("sourceRevision")} {ref.source_revision_id.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-cell-meta">{t("sourceExcerptNotShared")}</p>
        )}
      </section>
      <DefinitionList
        items={[
          { term: t("review"), value: humanize(result.review_status) },
          { term: t("caseRevision"), value: <code className="p-code">{result.case_revision_id.slice(0, 12)}</code> },
          { term: t("assessmentId"), value: <code className="p-code">{result.assessment_id.slice(0, 12)}</code> },
        ]}
      />
    </div>
  );
}

/* --------------------------------------------------------- improvements --- */

function Improvements({ improvements, findings }: { improvements: ReportSnapshot["improvements"]; findings: Finding[] }) {
  if (!improvements.length)
    return (
      <EmptyState title={t("noImprovements")} icon={<Lightbulb />}>
        <p>{t("noImprovementsHelp")}</p>
      </EmptyState>
    );
  const findingTitle = (id: string) => findings.find((item) => item.id === id)?.title;
  return (
    <ol className="p-findings">
      {improvements.map((item) => (
        <li key={item.id} className="p-finding">
          <div className="p-finding-head">
            <span className="p-finding-index">{item.priority}</span>
            <h3>{item.title}</h3>
          </div>
          <div className="p-finding-meta">
            <StatusBadge value={item.status} />
            {item.owner && (
              <span>
                {t("owner")}: {item.owner}
              </span>
            )}
          </div>
          <dl className="p-finding-body">
            <div>
              <dt>{t("validationPlan")}</dt>
              <dd>{item.validation_plan}</dd>
            </div>
            {item.finding_ids.length > 0 && (
              <div>
                <dt>{t("addresses")}</dt>
                <dd>{item.finding_ids.map((id) => findingTitle(id) ?? id).join("; ")}</dd>
              </div>
            )}
          </dl>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------- methodology --- */

function Methodology({ report }: { report: Partial<ReportSnapshot> }) {
  const m = report.methodology;
  const metrics = report.metrics;
  if (!m) return null;
  return (
    <div className="p-split p-split-wide">
      <section>
        <SectionHeading title={t("scopeAndMethod")} />
        <DefinitionList
          items={[
            ...(report.system ? [{ term: t("executionMode"), value: MODE[report.system.execution_mode] ?? humanize(report.system.execution_mode) }] : []),
            ...(report.scope
              ? [
                  { term: t("evidencePolicy"), value: humanize(report.scope.evidence_policy) },
                  { term: t("reviewStatus"), value: humanize(report.scope.review_status) },
                  { term: t("evaluated"), value: `${formatDate(report.scope.started_at, true)} – ${formatDate(report.scope.finished_at, true)}` },
                  { term: t("languages"), value: report.scope.languages.join(", ") || "—" },
                ]
              : []),
            { term: t("sampling"), value: m.sampling || "—" },
            { term: t("reviewCoverage"), value: m.review_coverage || "—" },
            { term: t("scorer"), value: `${m.scorer_version} · CEF ${m.cef_version}` },
            { term: t("graders"), value: m.grader_revisions.length ? m.grader_revisions.join(", ") : "—" },
            { term: t("sourcesUsed"), value: m.source_revisions.length },
            ...(m.cost ? [{ term: t("machineCost"), value: `${formatMoney(m.cost.settled, m.cost.currency)} ${t("settledLower")}` }] : []),
          ]}
        />
      </section>
      <section>
        {metrics && (
          <>
            <SectionHeading title={t("denominators")}>{t("denominatorsHelp")}</SectionHeading>
            <DefinitionList
              items={[
                { term: t("planned"), value: metrics.n_planned },
                { term: t("eligible"), value: metrics.n_eligible },
                { term: t("executed"), value: metrics.n_executed },
                { term: t("assessed"), value: metrics.n_scorable },
                { term: t("notScored"), value: metrics.n_unscorable },
                { term: t("pendingLabel"), value: metrics.n_pending },
                ...(metrics.pass_bounds ? [{ term: t("missingResultBounds"), value: `${percent(metrics.pass_bounds.low)}–${percent(metrics.pass_bounds.high)}` }] : []),
              ]}
            />
          </>
        )}
        <div className="p-section">
          <SectionHeading title={t("limitations")} />
          {m.limitations.length || m.exclusions.length ? (
            <ul className="p-bullets">
              {[...m.limitations, ...m.exclusions].map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="p-cell-meta">{t("noLimitationsRecorded")}</p>
          )}
          {report.report_revision_id && (
            <p className="p-cell-meta p-revision-id">
              {t("reportRevision")} <code className="p-code">{report.report_revision_id}</code>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------ authenticated --- */

export function AuthenticatedReport({ reportId }: { reportId: string }) {
  const { orgId, role, operator, withOrg } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<{ report: { current_revision_id: string | null; publication_status: string; title: string }; revisions: ReportRevision[] } | null>(null);
  const [error, setError] = useState("");
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!orgId) return;
    void evalRequest<NonNullable<typeof data>>(`/reports/${reportId}?orgId=${encodeURIComponent(orgId)}`)
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((value) => setError(value instanceof Error ? value.message : t("error")));
  }, [orgId, reportId]);
  useEffect(() => {
    load();
  }, [load]);
  const revision = data ? (data.revisions.find((item) => item.id === (revisionId ?? data.report.current_revision_id)) ?? data.revisions[0] ?? null) : null;
  usePageCrumb(revision?.snapshot.system.name);

  const setResult = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("result", id);
      else next.delete("result");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  if (error)
    return (
      <>
        <PageHeading title={t("report")} />
        <Status error action={<Action variant="secondary" size="sm" onClick={load}>{t("retry")}</Action>}>{error}</Status>
      </>
    );
  if (!data)
    return (
      <div className="p-skeleton-page" role="status" aria-label={t("loadingReport")}>
        <span className="p-skeleton" style={{ width: 120, height: 14 }} />
        <span className="p-skeleton" style={{ width: 360, height: 28 }} />
        <span className="p-skeleton" style={{ width: "100%", height: 220 }} />
      </div>
    );
  if (!revision)
    return (
      <>
        <PageHeading title={t("report")} />
        <EmptyState title={t("reportNotReady")}>
          <p>{t("reportNotReadyHelp")}</p>
        </EmptyState>
      </>
    );
  const canWrite = ["owner", "editor", "operator"].includes(role);
  const canManage = ["owner", "operator"].includes(role);
  const isCurrent = revision.id === data.report.current_revision_id;
  return (
    <>
      {!isCurrent && (
        <Status tone="warn" action={<Action variant="secondary" size="sm" onClick={() => setRevisionId(null)}>{t("viewCurrent")}</Action>}>
          {t("viewingOlderRevision")}
        </Status>
      )}
      <ReportView
        key={revision.id}
        report={revision.snapshot}
        initialResult={params.get("result")}
        onResultChange={setResult}
        actions={
          <ReportActions
            orgId={orgId}
            reportId={reportId}
            revisions={data.revisions}
            revision={revision}
            currentRevisionId={data.report.current_revision_id}
            canWrite={canWrite}
            canManage={canManage}
            operator={operator}
            onChanged={load}
            onSelectRevision={setRevisionId}
            renderPreview={(snapshot) => <ReportView report={snapshot} />}
            reportTitle={data.report.title}
            autoExport={params.get("export") === "pdf"}
            onDeleted={() => router.push(withOrg("/workspace/reports"))}
          />
        }
      />
    </>
  );
}

/* --------------------------------------------------------------- shared --- */

/**
 * The share token arrives in the URL fragment and is removed from the address
 * bar as soon as it is read, so it is kept here for the life of the page.
 */
let shareToken: string | null = null;
function readShareToken() {
  const fresh = new URLSearchParams(location.hash.slice(1)).get("token");
  if (fresh) shareToken = fresh;
  return shareToken;
}

export function SharedReport() {
  const token = useSyncExternalStore(
    () => () => {},
    readShareToken,
    () => null,
  );
  const [report, setReport] = useState<Partial<ReportSnapshot> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    history.replaceState(null, "", location.pathname);
    void fetch("/api/evals/v1/share/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()).data;
      })
      .then(setReport)
      .catch(() => setError(t("shareUnavailable")));
  }, [token]);
  if (!token || error)
    return (
      <EmptyState title={t("shareUnavailableTitle")}>
        <p>{t("shareUnavailable")}</p>
      </EmptyState>
    );
  if (!report)
    return (
      <p className="p-loading" role="status">
        <span className="p-spinner" aria-hidden="true" />
        {t("loadingReport")}
      </p>
    );
  return <ReportView report={report} />;
}
