import Link from "next/link";
import { Download } from "lucide-react";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { VerdictMark } from "@/components/demo/verdict";
import type { Verdict } from "@/lib/demo/judge";
import type { ExampleView } from "@/lib/evals/example";
import { fillCopy, sampleReportCopy, type SampleReportCopy } from "@/lib/evals/example/page-copy";
import { samplePdfHref } from "@/lib/evals/example/public";
import type { ReportSnapshot, ResultLabel } from "@/lib/evals/reports/contracts";
import type { Locale } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { splitMarked } from "@/lib/marked-text";
import "./sample-report.css";

type Result = ReportSnapshot["results"][number];
const OUTCOME_ORDER = ["fail", "partial", "unscorable", "pass"] as const;
const SEVERITY = ["critical", "high", "medium", "low"] as const;
const TAG: Record<Locale, string> = { en: "en-US", es: "es-ES" };
const VERDICT: Record<ResultLabel, Verdict> = {
  correct: "correct",
  partially_correct: "partial",
  incorrect: "incorrect",
  not_answered: "no_answer",
  test_issue: "unscored",
  capture_issue: "unscored",
  not_run: "unscored",
  pending: "unscored",
};
type ExampleLabel = keyof SampleReportCopy["verdict"];
const labelOf = (result: Result): ResultLabel => result.label ?? (result.outcome === "pass" ? "correct" : result.outcome === "partial" ? "partially_correct" : result.outcome === "fail" ? "incorrect" : "pending");

function Marked({ text }: { text: string }) {
  const { before, marked, after } = splitMarked(text);
  return (
    <>
      {before}
      {marked ? <em className="sr-serif">{marked}</em> : null}
      {after}
    </>
  );
}

function ExampleLabel({ copy, id }: { copy: SampleReportCopy; id?: string }) {
  return (
    <p className="sr-label" id={id}>
      <strong>{copy.label}</strong>
      <span>{copy.syntheticLine}</span>
    </p>
  );
}

function Verdict({ label, copy }: { label: ResultLabel; copy: SampleReportCopy }) {
  return (
    <span className="sr-verdict">
      <VerdictMark verdict={VERDICT[label]} className="sr-mark" />
      {copy.verdict[label as ExampleLabel] ?? label}
    </span>
  );
}

/** "T3, T7" links to the numbered results below (the same numbers as the PDF). */
function Refs({ ids, numbers }: { ids: string[]; numbers: Map<string, number> }) {
  const refs = ids.map((id) => numbers.get(id)).filter((value): value is number => value != null).sort((a, b) => a - b);
  return (
    <span className="sr-refs">
      {refs.map((value, index) => (
        <span key={value}>
          {index > 0 ? ", " : null}
          <a href={`#t${value}`}>T{value}</a>
        </span>
      ))}
    </span>
  );
}

/** A closed result opens when a link points at it. Plain inline script: no client bundle. */
const OPEN_ON_HASH = `(function(){function o(){var h=location.hash.slice(1);if(!/^t\\d+$/.test(h))return;var e=document.getElementById(h);if(e&&e.tagName==="DETAILS")e.open=true;}addEventListener("hashchange",o);o();})();`;

/**
 * The public sample report: the example evaluation's reviewed report in the
 * Paper language, rendered on the server from the same fixture as the in-app
 * example and the PDF. No client JavaScript beyond the shared header and footer.
 */
export function SampleReportPage({ locale, view }: { locale: Locale; view: ExampleView }) {
  const copy = sampleReportCopy(locale);
  const report = view.report, m = report.metrics;
  const tag = TAG[locale];
  const pct = (value: number | null) => (value == null ? "—" : new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 }).format(value));
  const month = (value: string) => new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value));
  const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  const topic = (value: string) => capital(value.replaceAll("_", " "));
  const ordered = [...report.results].sort((a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome) || SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  const numbers = new Map(ordered.map((result, index) => [result.assessment_id, index + 1]));
  const findings = [...report.findings].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  const improvements = [...report.improvements].sort((a, b) => a.priority - b.priority);
  const failed = ordered.filter((result) => result.outcome === "fail").length;
  const critical = report.results.filter((result) => result.severity === "critical" && (result.outcome === "fail" || result.outcome === "partial")).length;
  const segments = [
    { key: "correct", count: m.n_pass, label: copy.outcomeCorrect },
    { key: "partial", count: m.n_partial, label: copy.outcomePartial },
    { key: "failed", count: failed, label: copy.outcomeFailed },
    { key: "unscored", count: m.n_unscorable, label: copy.outcomeUnscored },
  ];
  const total = segments.reduce((sum, item) => sum + item.count, 0);
  const latest = view.trend[view.trend.length - 1], first = view.trend[0];
  const comparison = view.comparison;
  const otherLocale: Locale = locale === "en" ? "es" : "en";

  return (
    <div className="sr min-h-screen">
      <Header />
      <div className="sr-wrap">
        <main className="sr-main" id="main">
          <ExampleLabel copy={copy} id="example-label" />

          <header className="sr-head">
            <p className="sr-kicker">{copy.kicker}</p>
            <h1 className="sr-title">
              <Marked text={copy.title} />
            </h1>
            <p className="sr-standfirst">{fillCopy(copy.standfirst, { company: view.company.name })}</p>
            <div className="sr-actions">
              <a className="sr-pill" href={samplePdfHref(locale)} download hrefLang={locale} data-example-pdf={locale}>
                <Download width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
                {copy.downloadPdf}
              </a>
              <a className="sr-link" href={samplePdfHref(otherLocale)} download hrefLang={otherLocale} data-example-pdf={otherLocale}>
                {copy.otherPdf}
              </a>
            </div>
            <dl className="sr-facts">
              <div>
                <dt>{copy.factSystem}</dt>
                <dd>{report.system.name}</dd>
              </div>
              <div>
                <dt>{copy.factQuestions}</dt>
                <dd>{fillCopy(copy.factQuestionsValue, { count: report.results.length, sources: view.sources.length })}</dd>
              </div>
              <div>
                <dt>{copy.factRuns}</dt>
                <dd>{fillCopy(copy.factRunsValue, { first: month(first.started_at), last: month(latest.started_at) })}</dd>
              </div>
              <div>
                <dt>{copy.factReview}</dt>
                <dd>{copy.factReviewValue}</dd>
              </div>
            </dl>
          </header>

          <section className="sr-section" aria-labelledby="score-title">
            <h2 id="score-title">{copy.scoreTitle}</h2>
            <div className="sr-score">
              <div>
                <p className="sr-score-label">{fillCopy(copy.scoreLabel, { month: month(report.scope.started_at) })}</p>
                <p className="sr-score-figure">{pct(m.strict_pass_rate)}</p>
                <p className="sr-score-sentence">{fillCopy(copy.scoreSentence, { pass: m.n_pass, scored: m.n_scorable })}</p>
                {m.wilson_interval ? <p className="sr-score-meta">{fillCopy(copy.scoreInterval, { low: pct(m.wilson_interval.low), high: pct(m.wilson_interval.high), unscored: m.n_unscorable })}</p> : null}
              </div>
              <dl className="sr-stats">
                <div>
                  <dt>{copy.coverage}</dt>
                  <dd>{pct(m.assessed_coverage)}</dd>
                </div>
                <div>
                  <dt>{copy.criticalFailures}</dt>
                  <dd>{critical}</dd>
                </div>
                <div>
                  <dt>{copy.findingsCount}</dt>
                  <dd>{findings.length}</dd>
                </div>
              </dl>
            </div>
            <figure>
              <div className="sr-bar" role="img" aria-label={`${fillCopy(copy.outcomesLabel, { month: month(report.scope.started_at) })}: ${segments.map((item) => `${item.label} ${item.count}`).join(", ")}`}>
                {segments.filter((item) => item.count > 0).map((item) => (
                  <span key={item.key} data-v={item.key} style={{ width: `${((item.count / total) * 100).toFixed(2)}%` }} />
                ))}
              </div>
              <figcaption>
                <ul className="sr-legend">
                  {segments.map((item) => (
                    <li key={item.key}>
                      <i className="sr-swatch" data-v={item.key} aria-hidden="true" />
                      {item.label} <b>{item.count}</b>
                    </li>
                  ))}
                </ul>
              </figcaption>
            </figure>
          </section>

          <section className="sr-section" aria-labelledby="trend-title">
            <h2 id="trend-title">{copy.trendTitle}</h2>
            <p className="sr-lead">{copy.trendLead}</p>
            <ol className="sr-trend">
              {view.trend.map((point) => (
                <li key={point.run_id}>
                  <span className="sr-trend-run">{capital(month(point.started_at))}</span>
                  <span className="sr-track" aria-hidden="true">
                    <span style={{ width: `${Math.round((point.strict_pass_rate ?? 0) * 100)}%` }} />
                  </span>
                  <span className="sr-trend-value">{pct(point.strict_pass_rate)}</span>
                  <span className="sr-trend-meta">
                    {copy.trendCorrect} {point.n_pass}/{point.n_scorable} · {copy.trendCritical} {point.critical_failures}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="sr-section" aria-labelledby="comparison-title">
            <h2 id="comparison-title">{fillCopy(copy.comparisonTitle, { month: month(comparison.baseline_started_at) })}</h2>
            <p className="sr-lead">{copy.comparisonLead}</p>
            <dl className="sr-compare">
              <div>
                <dt>{copy.improved}</dt>
                <dd>{comparison.improved}</dd>
              </div>
              <div>
                <dt>{copy.regressed}</dt>
                <dd>{comparison.regressed}</dd>
              </div>
              <div>
                <dt>{copy.unchanged}</dt>
                <dd>{comparison.unchanged}</dd>
              </div>
              <div>
                <dt>{copy.notComparable}</dt>
                <dd>{comparison.unassessed}</dd>
              </div>
            </dl>
            <ul className="sr-changes">
              {comparison.changes.map((change) => (
                <li key={change.case_revision_id}>
                  <a className="sr-change-title sr-link" href={`#t${numbers.get(change.assessment_id)}`}>
                    {change.title}
                  </a>
                  <span className="sr-change-meta">
                    <span className="sr-tag" data-strong={change.direction === "regressed" ? "true" : undefined}>
                      {change.direction === "improved" ? copy.improved : copy.regressed}
                    </span>
                    {fillCopy(copy.changeFromTo, { before: copy.verdict[change.before as ExampleLabel] ?? change.before, after: copy.verdict[change.after as ExampleLabel] ?? change.after })}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="sr-section" aria-labelledby="summary-title">
            <h2 id="summary-title">{copy.summaryTitle}</h2>
            <ol className="sr-numbered">
              {report.takeaways.map((takeaway, index) => (
                <li key={index}>
                  <span className="sr-index">{index + 1}</span>
                  <div>
                    <p>{takeaway.text}</p>
                    {takeaway.assessment_ids.length ? (
                      <p className="sr-meta-line">
                        {copy.evidence}: <Refs ids={takeaway.assessment_ids} numbers={numbers} />
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="sr-section" aria-labelledby="findings-title">
            <h2 id="findings-title">{copy.findingsTitle}</h2>
            <p className="sr-lead">{copy.findingsLead}</p>
            <ol className="sr-numbered">
              {findings.map((finding, index) => (
                <li key={finding.id} id={`f${index + 1}`}>
                  <span className="sr-index">F{index + 1}</span>
                  <div>
                    <h3>{finding.title}</h3>
                    <p className="sr-meta-line">
                      <span className="sr-tag" data-strong={finding.severity === "critical" ? "true" : undefined}>
                        {copy.severity[finding.severity]}
                      </span>
                      <span>{fillCopy(copy.findingFrequency, { count: finding.frequency_n, total: finding.frequency_denominator })}</span>
                      <span>
                        {copy.evidence}: <Refs ids={finding.assessment_ids} numbers={numbers} />
                      </span>
                    </p>
                    <dl className="sr-defs">
                      <div>
                        <dt>{copy.observed}</dt>
                        <dd>{finding.observation}</dd>
                      </div>
                      {finding.cause_hypothesis ? (
                        <div>
                          <dt>{copy.likelyCause}</dt>
                          <dd>{finding.cause_hypothesis}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>{copy.whatToDo}</dt>
                        <dd>{finding.recommendation}</dd>
                      </div>
                    </dl>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="sr-section" aria-labelledby="improvements-title">
            <h2 id="improvements-title">{copy.improvementsTitle}</h2>
            <p className="sr-lead">{copy.improvementsLead}</p>
            <ol className="sr-numbered">
              {improvements.map((item) => (
                <li key={item.id}>
                  <span className="sr-index">{item.priority}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p className="sr-meta-line">
                      <span className="sr-tag">{copy.status[item.status]}</span>
                      {item.owner ? (
                        <span>
                          {copy.owner}: {item.owner}
                        </span>
                      ) : null}
                      {item.finding_ids.map((id) => {
                        const index = findings.findIndex((finding) => finding.id === id);
                        return index >= 0 ? (
                          <a key={id} className="sr-refs" href={`#f${index + 1}`}>
                            F{index + 1}
                          </a>
                        ) : null;
                      })}
                    </p>
                    <dl className="sr-defs">
                      <div>
                        <dt>{copy.howChecked}</dt>
                        <dd>{item.validation_plan}</dd>
                      </div>
                    </dl>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="sr-section" aria-labelledby="results-title">
            <h2 id="results-title">{copy.resultsTitle}</h2>
            <p className="sr-lead">{copy.resultsLead}</p>
            <div className="sr-results">
              {ordered.map((result, index) => (
                <details key={result.assessment_id} className="sr-result" id={`t${index + 1}`}>
                  <summary>
                    <span className="sr-index">T{index + 1}</span>
                    <span className="sr-result-q">{result.input}</span>
                    <span className="sr-result-meta">
                      <Verdict label={labelOf(result)} copy={copy} />
                      <span>{topic(result.topic)}</span>
                      <span>{copy.severity[result.severity]}</span>
                    </span>
                  </summary>
                  <div className="sr-result-body">
                    <div className="sr-sheet">
                      <span className="sr-sheet-label">{copy.assistantAnswer}</span>
                      <p>{result.output}</p>
                      {result.offered_actions?.length ? (
                        <p className="sr-small">
                          {copy.offeredButtons}: {result.offered_actions.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    {result.expected ? (
                      <div>
                        <span className="sr-sheet-label">{copy.expectedAnswer}</span>
                        <p>{result.expected}</p>
                      </div>
                    ) : null}
                    <div>
                      <span className="sr-sheet-label">{copy.assessment}</span>
                      <p>{result.rationale}</p>
                    </div>
                    {result.key_facts?.some((fact) => fact.status) ? (
                      <div>
                        <span className="sr-sheet-label">{copy.keyFacts}</span>
                        <ul className="sr-facts-list">
                          {result.key_facts.map((fact, factIndex) => (
                            <li key={factIndex}>
                              <span>{fact.fact}</span>
                              {fact.status ? <span>{copy[fact.status === "present" ? "factPresent" : fact.status === "missing" ? "factMissing" : "factContradicted"]}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {result.contradictions?.length ? (
                      <div>
                        <span className="sr-sheet-label">{copy.contradictions}</span>
                        <ul className="sr-facts-list">
                          {result.contradictions.map((item, itemIndex) => (
                            <li key={itemIndex}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {result.source_excerpts?.map((excerpt) => (
                      <figure key={`${excerpt.source_revision_id}-${excerpt.anchor}`}>
                        <span className="sr-sheet-label">{copy.fromDocumentation}</span>
                        <blockquote className="sr-quote">
                          {excerpt.excerpt}
                          {excerpt.title ? <cite>{excerpt.title}</cite> : null}
                        </blockquote>
                      </figure>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="sr-section" aria-labelledby="method-title">
            <h2 id="method-title">{copy.methodTitle}</h2>
            <dl className="sr-defs">
              <div>
                <dt>{copy.methodTestSet}</dt>
                <dd>{report.methodology.sampling}</dd>
              </div>
              <div>
                <dt>{copy.methodSources}</dt>
                <dd>{view.sources.map((source) => source.title).join(" · ")}</dd>
              </div>
              <div>
                <dt>{copy.methodReview}</dt>
                <dd>{report.methodology.review_coverage}</dd>
              </div>
              <div>
                <dt>{copy.methodLimitations}</dt>
                <dd>
                  <ul>
                    {report.methodology.limitations.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
            <p className="sr-small sr-mono" style={{ marginTop: 20 }}>
              {fillCopy(copy.identifiers, { revision: report.report_revision_id, hash: report.content_hash.slice(0, 16) })}
            </p>
          </section>

          <section className="sr-cta" aria-labelledby="cta-title">
            <h2 id="cta-title">
              <Marked text={copy.ctaTitle} />
            </h2>
            <p>{copy.ctaBody}</p>
            <div className="sr-actions">
              <Link className="sr-pill" href={localizePathname("/demo", locale)}>
                {copy.ctaDemo}
              </Link>
              <Link className="sr-pill sr-pill-ghost" href={`${localizePathname("/contact", locale)}?offer=pilot-evaluation`}>
                {copy.ctaContact}
              </Link>
            </div>
          </section>

          <footer className="sr-foot">
            <ExampleLabel copy={copy} />
            <p className="sr-small">{copy.disclaimer}</p>
          </footer>
        </main>
      </div>
      <MarketingFooter />
      <script dangerouslySetInnerHTML={{ __html: OPEN_ON_HASH }} />
    </div>
  );
}
