"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { evalRequest, EvalRequestError } from "./api";
import { Action, Badge, DataTable, Field, RowTitle, Status, StatusBadge } from "./primitives";
import { t } from "@/lib/evals/messages/en";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";

export type ReportRevision = { id: string; run_id: string; review_status: string; created_at: string; snapshot: ReportSnapshot };
type Share = { id: string; report_revision_id: string; audience: string; recipient: string | null; permitted_fields: string[]; expires_at: string; revoked_at: string | null; access_count: number };
type ExportJob = { id: string; status: string; download_path: string | null; reason_code: string | null };
type RunRow = { id: string; status: string; created_at: string; suite_version_id: string };
type Comparison = { status: string; improved?: number; regressed?: number; unchanged?: number; unassessed?: number; reasons?: string[] };

const SHARE_FIELDS = ["system", "scope", "metrics", "takeaways", "findings", "improvements", "methodology", "results"] as const;
const DEFAULT_FIELDS = new Set(["system", "scope", "metrics", "takeaways", "findings", "improvements", "methodology"]);
const key = () => crypto.randomUUID();
const message = (error: unknown) => (error instanceof Error ? error.message : t("error"));

/**
 * Report delivery actions (spec §5.2 Screen D, §5.4, §5.5 step 8): publish a
 * revision, download copies, share with a previewed allowlist, compare runs and
 * draft validated takeaways. Visible only to roles the server also enforces.
 */
export function ReportActions({ orgId, reportId, revisions, currentRevisionId, canWrite, canManage, onChanged, onPreview }: {
  orgId: string; reportId: string; revisions: ReportRevision[]; currentRevisionId: string | null;
  canWrite: boolean; canManage: boolean; onChanged: () => void; onPreview: (snapshot: Partial<ReportSnapshot> | null) => void;
}) {
  const [selected, setSelected] = useState(currentRevisionId ?? revisions[0]?.id ?? "");
  const revision = revisions.find((item) => item.id === selected) ?? revisions[0];
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [audience, setAudience] = useState<"bearer" | "named_recipient" | "workspace">("bearer");
  const [recipient, setRecipient] = useState("");
  const [days, setDays] = useState(14);
  const [fields, setFields] = useState<Set<string>>(new Set(DEFAULT_FIELDS));
  const [link, setLink] = useState("");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [baseline, setBaseline] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [narratives, setNarratives] = useState<Array<{ id: string; status: string; reason_code: string | null; rejected_count: number }>>([]);

  const act = async (work: () => Promise<void>) => {
    setPending(true); setError(""); setNotice("");
    try { await work(); } catch (reason) { setError(reason instanceof EvalRequestError ? reason.message : message(reason)); } finally { setPending(false); }
  };
  const loadShares = useCallback(async () => {
    if (canManage) setShares(await evalRequest<Share[]>(`/reports/${reportId}/shares?orgId=${encodeURIComponent(orgId)}`).catch(() => []));
  }, [canManage, orgId, reportId]);
  const loadNarratives = useCallback(async () => {
    if (canWrite) setNarratives(await evalRequest<typeof narratives>(`/reports/${reportId}/narrative?orgId=${encodeURIComponent(orgId)}`).catch(() => []));
  }, [canWrite, orgId, reportId]);
  useEffect(() => { void loadShares(); void loadNarratives(); }, [loadShares, loadNarratives]);
  useEffect(() => {
    if (!revision) return;
    void evalRequest<RunRow[]>(`/runs?orgId=${encodeURIComponent(orgId)}&relatedRunId=${revision.run_id}`)
      .then((rows) => setRuns(rows.filter((row) => row.id !== revision.run_id && ["completed", "partial"].includes(row.status)))).catch(() => setRuns([]));
  }, [orgId, revision]);
  // Poll a queued PDF until the document worker finishes it.
  useEffect(() => {
    if (!exportJob || !["queued", "running"].includes(exportJob.status)) return;
    const timer = window.setTimeout(() => void evalRequest<ExportJob>(`/exports/${exportJob.id}?orgId=${encodeURIComponent(orgId)}`).then(setExportJob).catch(() => undefined), 3000);
    return () => window.clearTimeout(timer);
  }, [exportJob, orgId]);
  useEffect(() => {
    if (!revision) return;
    const projected = Object.fromEntries(Object.entries(revision.snapshot).filter(([name]) => fields.has(name) || !SHARE_FIELDS.includes(name as typeof SHARE_FIELDS[number])));
    onPreview(canManage ? projected as Partial<ReportSnapshot> : null);
  }, [canManage, fields, onPreview, revision]);

  if (!revision || !canWrite) return null;
  const isCurrent = revision.id === currentRevisionId;

  return (
    <section className="eval-panel" aria-label={t("reportActions")}>
      <h2>{t("reportActions")}</h2>
      {notice && <Status>{notice}</Status>}
      {error && <Status error>{error}</Status>}

      <DataTable caption={t("reportRevisions")} headers={[t("revision"), t("statusLabel"), t("createdAt"), { label: t("access"), align: "end" }]}>
        {revisions.map((item) => (
          <tr key={item.id} data-selected={item.id === revision.id}>
            <RowTitle meta={item.id === currentRevisionId ? t("currentRevision") : undefined}><code className="p-code">{item.id.slice(0, 8)}</code></RowTitle>
            <td><StatusBadge value={item.review_status} /></td>
            <td className="p-cell-meta">{new Date(item.created_at).toLocaleString()}</td>
            <td className="p-table-action">
              <Action variant="secondary" size="sm" onClick={() => setSelected(item.id)} aria-pressed={item.id === revision.id}>{t("select")}</Action>
              {item.id !== currentRevisionId && <Action size="sm" disabled={pending} onClick={() => void act(async () => {
                await evalRequest(`/reports/${reportId}/publish`, "POST", { orgId, revisionId: item.id });
                setNotice(t("revisionPublished")); onChanged();
              })}>{t("publish")}</Action>}
            </td>
          </tr>
        ))}
      </DataTable>

      <h3>{t("downloadReport")}</h3>
      <p className="p-cell-meta">{t("downloadWarning")}</p>
      <div className="eval-actions">
        <Button variant="outline" disabled={pending} onClick={() => void act(async () => {
          setExportJob(await evalRequest<ExportJob>("/exports", "POST", { orgId, reportRevisionId: revision.id, kind: "pdf" }, key()));
        })}>{t("preparePdf")}</Button>
        {(["csv", "cef"] as const).map((kind) => <Button key={kind} variant="outline" disabled={pending} onClick={() => void act(async () => {
          const artifact = await evalRequest<{ artifactId: string }>("/exports", "POST", { orgId, reportRevisionId: revision.id, kind }, key());
          window.location.assign(`/api/evals/v1/report-artifacts/${artifact.artifactId}?orgId=${encodeURIComponent(orgId)}`);
        })}>{kind === "csv" ? t("downloadCsv") : t("downloadCef")}</Button>)}
        {exportJob && (exportJob.download_path
          ? <Button asChild><a href={exportJob.download_path}>{t("downloadPdf")}</a></Button>
          : <Badge tone={exportJob.status === "failed" ? "fail" : "info"} live>{exportJob.status === "failed" ? t("pdfFailed") : t("pdfPreparing")}</Badge>)}
      </div>

      {canManage && <>
        <h3>{t("share")}</h3>
        <p className="p-cell-meta">{t("shareHelp")}{isCurrent ? "" : ` ${t("shareRevisionNotCurrent")}`}</p>
        <form className="p-stack" onSubmit={(event) => { event.preventDefault(); void act(async () => {
          const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
          const created = await evalRequest<{ id: string; token: string | null }>(`/reports/${reportId}/shares`, "POST", {
            orgId, reportRevisionId: revision.id, audience, expiresAt, permittedFields: [...fields],
            ...(audience === "named_recipient" ? { recipient } : {}),
          }, key());
          setLink(created.token ? `${window.location.origin}/share#token=${created.token}` : "");
          setNotice(created.token ? t("shareLinkCreated") : t("shareCreated"));
          await loadShares();
        }); }}>
          <label className="eval-field"><span>{t("shareAudience")}</span>
            <select value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}>
              <option value="bearer">{t("shareBearer")}</option>
              <option value="named_recipient">{t("shareNamed")}</option>
              <option value="workspace">{t("shareWorkspace")}</option>
            </select>
          </label>
          {audience === "named_recipient" && <Field id="share-recipient" type="email" label={t("shareRecipient")} value={recipient} onChange={(event) => setRecipient(event.target.value)} required />}
          <Field id="share-expiry" type="number" min={1} max={90} label={t("shareExpiryDays")} value={days} onChange={(event) => setDays(Math.min(90, Math.max(1, Number(event.target.value) || 1)))} />
          <fieldset className="eval-check-list"><legend>{t("shareFields")}</legend>
            {SHARE_FIELDS.map((name) => <label key={name}><input type="checkbox" checked={fields.has(name)} onChange={(event) => setFields((current) => {
              const next = new Set(current); if (event.target.checked) next.add(name); else next.delete(name); return next;
            })} /> {t(`shareField_${name}` as Parameters<typeof t>[0])}</label>)}
          </fieldset>
          <p className="p-cell-meta">{t("sharePreviewHelp")}</p>
          <Button className="justify-self-start" disabled={pending || !fields.size}>{t("createShare")}</Button>
        </form>
        {link && <div className="eval-flow-card" aria-live="polite"><p>{t("shareLinkOnce")}</p><code className="p-code" style={{ wordBreak: "break-all" }}>{link}</code></div>}
        {shares.length > 0 && <DataTable caption={t("activeShares")} headers={[t("shareAudience"), t("expires"), t("views"), { label: t("access"), align: "end" }]}>
          {shares.map((share) => <tr key={share.id}>
            <RowTitle meta={share.recipient ?? undefined}>{share.audience.replaceAll("_", " ")}</RowTitle>
            <td className="p-cell-meta">{share.revoked_at ? t("revokedShare") : new Date(share.expires_at).toLocaleDateString()}</td>
            <td>{share.access_count}</td>
            <td className="p-table-action">{!share.revoked_at && <Action variant="secondary" size="sm" disabled={pending} onClick={() => void act(async () => {
              await evalRequest(`/shares/${share.id}?orgId=${encodeURIComponent(orgId)}`, "DELETE"); setNotice(t("shareRevokedNotice")); await loadShares();
            })}>{t("revokeShare")}</Action>}</td>
          </tr>)}
        </DataTable>}
      </>}

      <h3>{t("compare")}</h3>
      {runs.length ? <form className="eval-toolbar" onSubmit={(event) => { event.preventDefault(); void act(async () => {
        setComparison(await evalRequest<Comparison>("/comparisons", "POST", { orgId, baselineRunId: baseline, candidateRunId: revision.run_id }));
      }); }}>
        <label htmlFor="compare-baseline">{t("compareWith")}</label>
        <select id="compare-baseline" value={baseline} onChange={(event) => setBaseline(event.target.value)} required>
          <option value="">{t("selectRun")}</option>
          {runs.map((run) => <option key={run.id} value={run.id}>{new Date(run.created_at).toLocaleString()} · {run.status}</option>)}
        </select>
        <Button variant="outline" disabled={!baseline || pending}>{t("compare")}</Button>
      </form> : <p className="p-cell-meta">{t("noComparableRuns")}</p>}
      {comparison && <div className="eval-flow-card" aria-live="polite">
        <p><StatusBadge value={comparison.status} /></p>
        {comparison.status !== "incompatible" && <p>{t("improved")}: {comparison.improved ?? 0} · {t("regressed")}: {comparison.regressed ?? 0} · {t("unchanged")}: {comparison.unchanged ?? 0} · {t("unassessedPairs")}: {comparison.unassessed ?? 0}</p>}
        {comparison.reasons?.length ? <p className="p-cell-meta">{t("comparisonIncompatible")} {comparison.reasons.join(", ").replaceAll("_", " ")}</p> : null}
      </div>}

      <h3>{t("executiveTakeaways")}</h3>
      <p className="p-cell-meta">{t("narrativeHelp")}</p>
      <div className="eval-actions">
        <Button variant="outline" disabled={pending} onClick={() => void act(async () => {
          await evalRequest(`/reports/${reportId}/narrative`, "POST", { orgId, revisionId: revision.id });
          setNotice(t("narrativeQueued")); await loadNarratives();
        })}>{t("draftTakeaways")}</Button>
        <Button variant="ghost" disabled={pending} onClick={() => void act(async () => { await loadNarratives(); onChanged(); })}>{t("refresh")}</Button>
      </div>
      {narratives.length > 0 && <ul className="p-cell-meta">{narratives.map((item) => <li key={item.id}><StatusBadge value={item.status} /> {item.reason_code?.replaceAll("_", " ") ?? ""}{item.rejected_count ? ` · ${item.rejected_count} ${t("claimsRejected")}` : ""}</li>)}</ul>}
    </section>
  );
}
