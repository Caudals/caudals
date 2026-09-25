"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { evalRequest } from "./api";
import { Badge, Loading, PageHeading, Stat, StatGrid, Status, StatusBadge, Tabs } from "./primitives";
import { t } from "@/lib/evals/messages/en";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { Button } from "@/components/ui/button";
import { ReportActions, type ReportRevision } from "./report-actions";

type Tab = "overview" | "findings" | "results" | "improvements" | "methodology";
type Result = ReportSnapshot["results"][number];

function ResultEvidence({ result }: { result: Result }) {
  return <div className="eval-result-evidence">
    <p className="p-row" style={{ gap: 6 }}><StatusBadge value={result.severity} /><StatusBadge value={result.outcome} /></p>
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
  const resultTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!selected && restoreFocus.current) {
      restoreFocus.current = false;
      resultTrigger.current?.focus();
    }
  }, [selected]);
  return <section className="eval-results-layout">
    <div className="eval-results-list" aria-label={t("results")}>
      {results.map((item) => <button type="button" className="eval-result-row" data-selected={selected?.assessment_id === item.assessment_id} key={item.assessment_id} onClick={(event) => { resultTrigger.current = event.currentTarget; setSelected(item); }}><span>{item.title}</span><span className="p-row" style={{ gap: 6, marginTop: 4 }}><StatusBadge value={item.outcome} /><small>{item.review_status.replaceAll("_", " ")}</small></span></button>)}
    </div>
    {selected && <aside className="eval-result-desktop" aria-live="polite"><ResultEvidence result={selected} /></aside>}
    <Dialog open={mobile && !!selected} onOpenChange={(open) => { if (!open) { restoreFocus.current = true; setSelected(null); } }}>
      {selected && <DialogContent className="p-dialog eval-result-mobile"><DialogHeader><DialogTitle>{selected.title}</DialogTitle><DialogDescription>{selected.outcome} · {selected.review_status}</DialogDescription></DialogHeader><ResultEvidence result={selected} /></DialogContent>}
    </Dialog>
  </section>;
}

export function ReportView({ report }: { report: Partial<ReportSnapshot> }) {
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: Tab[] = ["overview", "findings", "results", "improvements", "methodology"];
  return <>
    <PageHeading title={report.system?.name ?? t("report")}>{report.scope ? `${report.scope.review_status.replaceAll("_", " ")} · ${report.metrics?.n_scorable ?? 0} of ${report.metrics?.n_eligible ?? 0} assessed` : t("privateReport")}</PageHeading>
    <Tabs value={tab} onChange={setTab} label={t("reportSections")} options={tabs.map((item) => ({ value: item, label: t(item) }))} />
    {tab === "overview" && <section className="p-stack"><div className="p-card"><p className="p-stat-label">{t("strictPassRate")}</p>{report.metrics?.strict_pass_rate == null ? <p>{t("notAvailable")}</p> : <p className="eval-score">{(report.metrics.strict_pass_rate * 100).toFixed(1)}%</p>}<p>{report.metrics?.n_pass ?? 0} {t("passedOf")} {report.metrics?.n_scorable ?? 0}.{report.metrics?.headline_status === "incomplete" ? ` ${t("incompleteReport")}` : ""}</p></div><StatGrid><Stat label={t("passed")} value={`${report.metrics?.n_pass ?? 0} / ${report.metrics?.n_scorable ?? 0}`} meta={t("scorableTests")} /><Stat label={t("eligible")} value={report.metrics?.n_eligible ?? 0} meta={t("eligibleTests")} /><Stat label={t("statusLabel")} value={<StatusBadge value={report.metrics?.headline_status} />} /></StatGrid>{report.takeaways?.length ? <div className="p-card"><h3>{t("takeaways")}</h3>{report.takeaways.map((item, index) => <p key={index}>{item.text}</p>)}</div> : null}</section>}
    {tab === "findings" && <section>{report.findings?.map((item) => <article className="eval-panel" key={item.id}><p className="p-row" style={{ gap: 6 }}><StatusBadge value={item.severity} /><Badge>{item.frequency_n}/{item.frequency_denominator}</Badge></p><h2>{item.title}</h2><p>{item.observation}</p><p><strong>{t("recommendedAction")}:</strong> {item.recommendation}</p>{item.cause_hypothesis && <p><strong>{t("hypothesis")}:</strong> {item.cause_hypothesis}</p>}</article>)}</section>}
    {tab === "results" && <ResultInspector results={report.results ?? []} />}
    {tab === "improvements" && <section>{report.improvements?.map((item) => <article className="eval-panel" key={item.id}><h2>{item.priority}. {item.title}</h2><p>{item.validation_plan}</p></article>)}</section>}
    {tab === "methodology" && <section className="eval-panel"><h2>{t("methodology")}</h2><p>CEF {report.methodology?.cef_version} · {report.methodology?.scorer_version}</p><ul>{report.methodology?.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul><p><code className="p-code">{report.report_revision_id}</code></p></section>}
  </>;
}

export function AuthenticatedReport({ reportId, workspaces = [] }: { reportId: string; workspaces?: EvalIdentity["workspaces"] }) {
  const orgId = useSearchParams().get("orgId") ?? "";
  const [data, setData] = useState<{ report: { current_revision_id: string | null; publication_status: string }; revisions: ReportRevision[] } | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Partial<ReportSnapshot> | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const role = workspaces.find((item) => item.id === orgId)?.role ?? "";
  const load = useCallback(() => { if (orgId) void evalRequest<NonNullable<typeof data>>(`/reports/${reportId}?orgId=${orgId}`).then(setData).catch(() => setError(t("error"))); }, [orgId, reportId]);
  useEffect(() => { load(); }, [load]);
  if (error) return <Status error>{error}</Status>;
  if (!data) return <Loading />;
  const report = data.revisions.find((item) => item.id === data.report.current_revision_id)?.snapshot ?? data.revisions[0]?.snapshot ?? null;
  if (!report) return <Status>{t("reportNotReady")}</Status>;
  const canWrite = ["owner", "editor", "operator"].includes(role);
  const canManage = ["owner", "operator"].includes(role);
  return <>
    {showPreview && preview ? <section aria-label={t("sharePreview")}><Status>{t("sharePreviewBanner")}</Status><ReportView report={preview} /></section> : <ReportView report={report} />}
    {canManage && preview && <div className="eval-actions"><Button variant="outline" onClick={() => setShowPreview((value) => !value)} aria-pressed={showPreview}>{showPreview ? t("closeSharePreview") : t("openSharePreview")}</Button></div>}
    <ReportActions orgId={orgId} reportId={reportId} revisions={data.revisions} currentRevisionId={data.report.current_revision_id} canWrite={canWrite} canManage={canManage} onChanged={load} onPreview={setPreview} />
  </>;
}

export function SharedReport() {
  const token = useSyncExternalStore(() => () => {}, () => new URLSearchParams(location.hash.slice(1)).get("token"), () => null);
  const [report, setReport] = useState<Partial<ReportSnapshot> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!token) return; history.replaceState(null, "", location.pathname); void fetch("/api/evals/v1/share/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).then(async (response) => { if (!response.ok) throw new Error(); return (await response.json()).data; }).then(setReport).catch(() => setError(t("shareUnavailable"))); }, [token]);
  if (!token || error) return <Status error>{t("shareUnavailable")}</Status>;
  if (!report) return <Loading>{t("loadingReport")}</Loading>;
  return <ReportView report={report} />;
}
