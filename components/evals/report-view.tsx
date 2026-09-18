"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { evalRequest } from "./api";
import { PageHeading, Status } from "./primitives";
import { t } from "@/lib/evals/messages/en";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";

type Tab = "overview" | "findings" | "results" | "improvements" | "methodology";
type Result = ReportSnapshot["results"][number];

function ResultEvidence({ result }: { result: Result }) {
  return <div className="eval-result-evidence">
    <p className="eval-eyebrow">{result.severity} · {result.outcome}</p>
    <h3>{result.title}</h3>
    <h4>{t("input")}</h4><pre>{result.input}</pre>
    <h4>{t("output")}</h4><pre>{result.output}</pre>
    <p>{result.rationale}</p>
    <div className="eval-source-refs">{result.source_refs.map((ref) => <code key={`${ref.source_revision_id}-${ref.anchor}`}>{ref.source_revision_id}#{ref.anchor}</code>)}</div>
  </div>;
}

function ResultInspector({ results }: { results: Result[] }) {
  const mobile = useSyncExternalStore(
    (change) => { const query = matchMedia("(max-width: 767px)"); query.addEventListener("change", change); return () => query.removeEventListener("change", change); },
    () => matchMedia("(max-width: 767px)").matches,
    () => false,
  );
  const [selected, setSelected] = useState<Result | null>(null);
  return <section className="eval-results-layout">
    <div className="eval-results-list" aria-label={t("results")}>
      {results.map((item) => <button type="button" className="eval-result-row" data-selected={selected?.assessment_id === item.assessment_id} key={item.assessment_id} onClick={() => setSelected(item)}><span>{item.title}</span><small>{item.outcome} · {item.review_status}</small></button>)}
    </div>
    {selected && <aside className="eval-result-desktop" aria-live="polite"><ResultEvidence result={selected} /></aside>}
    <Dialog open={mobile && !!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      {selected && <DialogContent className="eval-result-mobile"><DialogHeader><DialogTitle>{selected.title}</DialogTitle><DialogDescription>{selected.outcome} · {selected.review_status}</DialogDescription></DialogHeader><ResultEvidence result={selected} /></DialogContent>}
    </Dialog>
  </section>;
}

export function ReportView({ report }: { report: Partial<ReportSnapshot> }) {
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: Tab[] = ["overview", "findings", "results", "improvements", "methodology"];
  return <>
    <PageHeading title={report.system?.name ?? t("report")}>{report.scope ? `${report.scope.review_status} · ${report.metrics?.n_scorable ?? 0} of ${report.metrics?.n_eligible ?? 0} assessed` : t("privateReport")}</PageHeading>
    <div role="tablist" aria-label={t("reportSections")} className="eval-tabs">{tabs.map((item) => <Button key={item} role="tab" aria-selected={tab === item} variant={tab === item ? "secondary" : "ghost"} onClick={() => setTab(item)}>{t(item)}</Button>)}</div>
    {tab === "overview" && <section className="eval-panel"><h2>{t("overview")}</h2><p className="eval-score">{report.metrics?.strict_pass_rate == null ? t("notAvailable") : `${(report.metrics.strict_pass_rate * 100).toFixed(1)}%`}</p><p>{report.metrics?.n_pass ?? 0} {t("passedOf")} {report.metrics?.n_scorable ?? 0}. {report.metrics?.headline_status === "incomplete" && t("incompleteReport")}</p>{report.takeaways?.map((item, index) => <p key={index}>{item.text}</p>)}</section>}
    {tab === "findings" && <section>{report.findings?.map((item) => <article className="eval-panel" key={item.id}><p className="eval-eyebrow">{item.severity} · {item.frequency_n}/{item.frequency_denominator}</p><h2>{item.title}</h2><p>{item.observation}</p><p><strong>{t("recommendedAction")}:</strong> {item.recommendation}</p>{item.cause_hypothesis && <p><strong>{t("hypothesis")}:</strong> {item.cause_hypothesis}</p>}</article>)}</section>}
    {tab === "results" && <ResultInspector results={report.results ?? []} />}
    {tab === "improvements" && <section>{report.improvements?.map((item) => <article className="eval-panel" key={item.id}><h2>{item.priority}. {item.title}</h2><p>{item.validation_plan}</p></article>)}</section>}
    {tab === "methodology" && <section className="eval-panel"><h2>{t("methodology")}</h2><p>CEF {report.methodology?.cef_version} · {report.methodology?.scorer_version}</p><ul>{report.methodology?.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul><p><code>{report.report_revision_id}</code></p></section>}
  </>;
}

export function AuthenticatedReport({ reportId }: { reportId: string }) {
  const orgId = useSearchParams().get("orgId") ?? "";
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!orgId) return; void evalRequest<{ report: { current_revision_id: string }; revisions: Array<{ id: string; snapshot: ReportSnapshot }> }>(`/reports/${reportId}?orgId=${orgId}`).then((data) => setReport(data.revisions.find((item) => item.id === data.report.current_revision_id)?.snapshot ?? data.revisions[0]?.snapshot ?? null)).catch(() => setError(t("error"))); }, [orgId, reportId]);
  if (error) return <Status error>{error}</Status>;
  if (!report) return <Status>{t("loading")}</Status>;
  return <ReportView report={report} />;
}

export function SharedReport() {
  const token = useSyncExternalStore(() => () => {}, () => new URLSearchParams(location.hash.slice(1)).get("token"), () => null);
  const [report, setReport] = useState<Partial<ReportSnapshot> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!token) return; history.replaceState(null, "", location.pathname); void fetch("/api/evals/v1/share/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).then(async (response) => { if (!response.ok) throw new Error(); return (await response.json()).data; }).then(setReport).catch(() => setError(t("shareUnavailable"))); }, [token]);
  if (!token || error) return <Status error>{t("shareUnavailable")}</Status>;
  if (!report) return <Status>{t("loadingReport")}</Status>;
  return <ReportView report={report} />;
}
