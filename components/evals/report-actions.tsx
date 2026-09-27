"use client";

/**
 * Report delivery (spec §5.2 Screen D, §5.4, §5.5 step 8, §15.3–15.4): share a
 * revision with a previewed allowlist, download copies, compare runs, manage
 * revisions and draft validated takeaways. Controls appear only for roles the
 * server also enforces.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ChevronDown, Download, Eye, GitCompare, History, Share2, Sparkles } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, ActionAnchor, Badge, Check, DataTable, Field, RowTitle, SectionHeading, SelectField, Status, StatusBadge, Time } from "./primitives";
import { ActionMenu, CopyField, Modal, SidePanel, notify } from "./overlays";
import { t } from "@/lib/evals/messages/en";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";

export type ReportRevision = { id: string; run_id: string; review_status: string; created_at: string; snapshot: ReportSnapshot };
type Share = { id: string; report_revision_id: string; audience: string; recipient: string | null; permitted_fields: string[]; expires_at: string; revoked_at: string | null; access_count: number };
type ExportJob = { id: string; status: string; download_path: string | null; reason_code: string | null };
type RunRow = { id: string; status: string; created_at: string; suite_version_id: string };
type Comparison = { status: string; improved?: number; regressed?: number; unchanged?: number; unassessed?: number; reasons?: string[] };
type Narrative = { id: string; status: string; reason_code: string | null; rejected_count: number };

const SHARE_FIELDS = ["system", "scope", "metrics", "takeaways", "findings", "improvements", "methodology", "results"] as const;
const DEFAULT_FIELDS = new Set(["system", "scope", "metrics", "takeaways", "findings", "improvements", "methodology"]);
const message = (error: unknown) => (error instanceof EvalRequestError ? error.message : error instanceof Error ? error.message : t("error"));

function project(snapshot: ReportSnapshot, fields: Set<string>) {
  return Object.fromEntries(Object.entries(snapshot).filter(([name]) => fields.has(name) || !SHARE_FIELDS.includes(name as (typeof SHARE_FIELDS)[number]))) as Partial<ReportSnapshot>;
}

export function ReportActions({
  orgId,
  reportId,
  revisions,
  revision,
  currentRevisionId,
  canWrite,
  canManage,
  operator = false,
  onChanged,
  onSelectRevision,
  renderPreview,
}: {
  orgId: string;
  reportId: string;
  revisions: ReportRevision[];
  revision: ReportRevision;
  currentRevisionId: string | null;
  canWrite: boolean;
  canManage: boolean;
  /** Caudals staff may release a reviewed report once every result has a decision. */
  operator?: boolean;
  onChanged: () => void;
  onSelectRevision: (id: string | null) => void;
  renderPreview: (snapshot: Partial<ReportSnapshot>) => ReactNode;
}) {
  const [dialog, setDialog] = useState<"" | "share" | "compare" | "revisions" | "takeaways" | "release">("");
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [error, setError] = useState("");

  // Poll a queued PDF until the document worker finishes it.
  useEffect(() => {
    if (!exportJob || !["queued", "running"].includes(exportJob.status)) return;
    const timer = window.setTimeout(
      () =>
        void evalRequest<ExportJob>(`/exports/${exportJob.id}?orgId=${encodeURIComponent(orgId)}`)
          .then((job) => {
            setExportJob(job);
            if (job.download_path) notify(t("pdfReady"));
          })
          .catch(() => undefined),
      2500,
    );
    return () => window.clearTimeout(timer);
  }, [exportJob, orgId]);

  async function exportPdf() {
    setError("");
    try {
      setExportJob(await evalRequest<ExportJob>("/exports", "POST", { orgId, reportRevisionId: revision.id, kind: "pdf" }, crypto.randomUUID()));
      notify(t("pdfPreparing"));
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function exportFile(kind: "csv" | "cef") {
    setError("");
    try {
      const artifact = await evalRequest<{ artifactId: string }>("/exports", "POST", { orgId, reportRevisionId: revision.id, kind }, crypto.randomUUID());
      window.location.assign(`/api/evals/v1/report-artifacts/${artifact.artifactId}?orgId=${encodeURIComponent(orgId)}`);
    } catch (reason) {
      setError(message(reason));
    }
  }

  if (!canWrite) return null;
  const preparing = exportJob && ["queued", "running"].includes(exportJob.status);
  return (
    <>
      {error && (
        <span className="p-inline-error" role="alert">
          {error}
        </span>
      )}
      {exportJob?.download_path ? (
        <ActionAnchor href={exportJob.download_path} title={t("downloadWarning")}>
          <Download aria-hidden="true" />
          {t("downloadPdf")}
        </ActionAnchor>
      ) : exportJob?.status === "failed" ? (
        <Badge tone="fail">{t("pdfFailed")}</Badge>
      ) : null}
      {canManage && (
        <Action variant="secondary" onClick={() => setDialog("share")}>
          <Share2 aria-hidden="true" />
          {t("share")}
        </Action>
      )}
      <ActionMenu
        label={t("download")}
        trigger={
          <button type="button" className="p-btn" data-variant="secondary" disabled={!!preparing}>
            <Download aria-hidden="true" />
            {preparing ? t("pdfPreparing") : t("download")}
            <ChevronDown aria-hidden="true" />
          </button>
        }
        items={[
          { heading: t("downloadWarning") },
          { label: t("preparePdf"), onSelect: () => void exportPdf() },
          { label: t("downloadCsv"), onSelect: () => void exportFile("csv") },
          { label: t("downloadCef"), onSelect: () => void exportFile("cef") },
        ]}
      />
      <ActionMenu
        label={t("moreActions")}
        items={[
          { label: t("compareRuns"), icon: <GitCompare />, onSelect: () => setDialog("compare") },
          { label: t("revisionsLabel"), icon: <History />, onSelect: () => setDialog("revisions") },
          { label: t("executiveTakeaways"), icon: <Sparkles />, onSelect: () => setDialog("takeaways") },
          ...(operator && revision.review_status === "preliminary"
            ? [{ separator: true as const }, { label: t("releaseReviewedReport"), icon: <BadgeCheck />, onSelect: () => setDialog("release") }]
            : []),
        ]}
      />
      {operator && (
        <ReleaseReviewedDialog open={dialog === "release"} onOpenChange={(value) => setDialog(value ? "release" : "")} orgId={orgId} revision={revision} />
      )}
      {canManage && (
        <ShareDialog
          open={dialog === "share"}
          onOpenChange={(value) => setDialog(value ? "share" : "")}
          orgId={orgId}
          reportId={reportId}
          revision={revision}
          isCurrent={revision.id === currentRevisionId}
          renderPreview={renderPreview}
        />
      )}
      <CompareDialog open={dialog === "compare"} onOpenChange={(value) => setDialog(value ? "compare" : "")} orgId={orgId} revision={revision} />
      <RevisionsPanel
        open={dialog === "revisions"}
        onOpenChange={(value) => setDialog(value ? "revisions" : "")}
        orgId={orgId}
        reportId={reportId}
        revisions={revisions}
        selectedId={revision.id}
        currentRevisionId={currentRevisionId}
        onChanged={onChanged}
        onSelect={(id) => {
          onSelectRevision(id === currentRevisionId ? null : id);
          setDialog("");
        }}
      />
      <TakeawaysDialog open={dialog === "takeaways"} onOpenChange={(value) => setDialog(value ? "takeaways" : "")} orgId={orgId} reportId={reportId} revision={revision} onChanged={onChanged} />
    </>
  );
}

/* -------------------------------------------------------------- release --- */

/**
 * Releases the reviewed tier (spec D-04): a new, published report built from
 * the latest human decisions. The server refuses while any result still lacks
 * an approval or dispute, and only Caudals staff may call it.
 */
function ReleaseReviewedDialog({ open, onOpenChange, orgId, revision }: { open: boolean; onOpenChange: (open: boolean) => void; orgId: string; revision: ReportRevision }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function release() {
    setPending(true);
    setError("");
    try {
      const title = (revision.snapshot.system?.name ?? "").trim() || t("reviewedResults");
      const created = await evalRequest<{ reportId: string; revisionId: string }>(
        "/reports",
        "POST",
        { orgId, runId: revision.run_id, title: `${title} — ${t("reviewedResults").toLowerCase()}`, reviewStatus: "reviewed", scorerVersion: revision.snapshot.methodology.scorer_version },
        `reviewed-report-${revision.id}`,
      );
      await evalRequest(`/reports/${created.reportId}/publish`, "POST", { orgId, revisionId: created.revisionId });
      notify(t("reviewedReportReleased"));
      onOpenChange(false);
      router.push(`/workspace/reports/${created.reportId}?orgId=${encodeURIComponent(orgId)}`);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("releaseReviewedReport")}
      description={t("releaseReviewedHelp")}
      size="sm"
      footer={
        <>
          <Action variant="secondary" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Action>
          <Action onClick={() => void release()} disabled={pending}>
            {pending ? t("releasing") : t("releaseReport")}
          </Action>
        </>
      }
    >
      {error && <Status error>{error}</Status>}
    </Modal>
  );
}

/* ---------------------------------------------------------------- share --- */

function ShareDialog({
  open,
  onOpenChange,
  orgId,
  reportId,
  revision,
  isCurrent,
  renderPreview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  reportId: string;
  revision: ReportRevision;
  isCurrent: boolean;
  renderPreview: (snapshot: Partial<ReportSnapshot>) => ReactNode;
}) {
  const [audience, setAudience] = useState<"bearer" | "named_recipient" | "workspace">("bearer");
  const [recipient, setRecipient] = useState("");
  const [days, setDays] = useState(14);
  const [fields, setFields] = useState<Set<string>>(new Set(DEFAULT_FIELDS));
  const [shares, setShares] = useState<Share[]>([]);
  const [link, setLink] = useState("");
  const [created, setCreated] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const loadShares = useCallback(async () => {
    setShares(await evalRequest<Share[]>(`/reports/${reportId}/shares?orgId=${encodeURIComponent(orgId)}`).catch(() => []));
  }, [orgId, reportId]);
  useEffect(() => {
    if (open) {
      setCreated(false);
      setLink("");
      setError("");
      void loadShares();
    }
  }, [open, loadShares]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      const result = await evalRequest<{ id: string; token: string | null }>(
        `/reports/${reportId}/shares`,
        "POST",
        { orgId, reportRevisionId: revision.id, audience, expiresAt, permittedFields: [...fields], ...(audience === "named_recipient" ? { recipient } : {}) },
        crypto.randomUUID(),
      );
      setLink(result.token ? `${window.location.origin}/share#token=${result.token}` : "");
      setCreated(true);
      await loadShares();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(false);
    }
  }
  async function revoke(id: string) {
    setPending(true);
    try {
      await evalRequest(`/shares/${id}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      notify(t("shareRevokedNotice"));
      await loadShares();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(false);
    }
  }
  const active = shares.filter((item) => !item.revoked_at);

  return (
    <>
      <Modal
        open={open && !preview}
        onOpenChange={onOpenChange}
        size="lg"
        title={created ? t("shareCreatedTitle") : t("shareReport")}
        description={created ? (link ? t("shareLinkOnce") : t("shareCreated")) : `${t("shareHelp")}${isCurrent ? "" : ` ${t("shareRevisionNotCurrent")}`}`}
        footer={
          created ? (
            <Action onClick={() => onOpenChange(false)}>{t("done")}</Action>
          ) : (
            <>
              <Action variant="ghost" onClick={() => setPreview(true)} disabled={!fields.size}>
                <Eye aria-hidden="true" />
                {t("openSharePreview")}
              </Action>
              <span className="p-toolbar-spacer" />
              <Action variant="secondary" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Action>
              <Action type="submit" form="share-form" disabled={pending || !fields.size || (audience === "named_recipient" && !recipient.trim())}>
                {pending ? t("working") : t("createShare")}
              </Action>
            </>
          )
        }
      >
        {error && <Status error>{error}</Status>}
        {created ? (
          link ? <CopyField label={t("shareLink")} value={link} hint={t("downloadWarning")} /> : <Status tone="success">{t("shareCreated")}</Status>
        ) : (
          <form id="share-form" className="p-stack" onSubmit={create}>
            <div className="p-grid-2 p-form-grid">
              <SelectField id="share-audience" label={t("shareAudience")} value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}>
                <option value="bearer">{t("shareBearer")}</option>
                <option value="named_recipient">{t("shareNamed")}</option>
                <option value="workspace">{t("shareWorkspace")}</option>
              </SelectField>
              <Field id="share-expiry" type="number" min={1} max={90} label={t("shareExpiryDays")} value={days} onChange={(event) => setDays(Math.min(90, Math.max(1, Number(event.target.value) || 1)))} />
            </div>
            {audience === "named_recipient" && <Field id="share-recipient" type="email" label={t("shareRecipient")} value={recipient} onChange={(event) => setRecipient(event.target.value)} required />}
            <fieldset className="p-fieldset p-checks">
              <legend>{t("shareFields")}</legend>
              {SHARE_FIELDS.map((name) => (
                <Check
                  key={name}
                  checked={fields.has(name)}
                  label={t(`shareField_${name}` as Parameters<typeof t>[0])}
                  onChange={(event) =>
                    setFields((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(name);
                      else next.delete(name);
                      return next;
                    })
                  }
                />
              ))}
            </fieldset>
            <p className="p-field-hint">{t("sharePreviewHelp")}</p>
          </form>
        )}
        {active.length > 0 && (
          <div>
            <SectionHeading title={t("activeShares")} />
            <DataTable caption={t("activeShares")} headers={[t("shareAudience"), t("expires"), { label: t("views"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
              {active.map((share) => (
                <tr key={share.id}>
                  <RowTitle meta={share.recipient ?? undefined}>{share.audience === "bearer" ? t("shareBearer") : share.audience === "named_recipient" ? t("shareNamed") : t("shareWorkspace")}</RowTitle>
                  <td className="p-cell-meta">
                    <Time value={share.expires_at} withTime={false} />
                  </td>
                  <td className="p-num">{share.access_count}</td>
                  <td className="p-table-action">
                    <Action variant="ghost" size="sm" disabled={pending} onClick={() => void revoke(share.id)}>
                      {t("revokeShare")}
                    </Action>
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </Modal>
      <SidePanel open={open && preview} onOpenChange={(value) => !value && setPreview(false)} title={t("sharePreview")} description={t("sharePreviewBanner")} wide>
        {renderPreview(project(revision.snapshot, fields))}
      </SidePanel>
    </>
  );
}

/* -------------------------------------------------------------- compare --- */

function CompareDialog({ open, onOpenChange, orgId, revision }: { open: boolean; onOpenChange: (open: boolean) => void; orgId: string; revision: ReportRevision }) {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [baseline, setBaseline] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setComparison(null);
    void evalRequest<RunRow[]>(`/runs?orgId=${encodeURIComponent(orgId)}&relatedRunId=${revision.run_id}`)
      .then((rows) => setRuns(rows.filter((row) => row.id !== revision.run_id && ["completed", "partial"].includes(row.status))))
      .catch(() => setRuns([]));
  }, [open, orgId, revision.run_id]);
  async function compare(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      setComparison(await evalRequest<Comparison>("/comparisons", "POST", { orgId, baselineRunId: baseline, candidateRunId: revision.run_id }));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("compareRuns")}
      description={t("compareHelp")}
      footer={
        runs?.length ? (
          <>
            <Action variant="secondary" onClick={() => onOpenChange(false)}>{t("close")}</Action>
            <Action type="submit" form="compare-form" disabled={!baseline || pending}>{pending ? t("working") : t("compare")}</Action>
          </>
        ) : (
          <Action variant="secondary" onClick={() => onOpenChange(false)}>{t("close")}</Action>
        )
      }
    >
      {error && <Status error>{error}</Status>}
      {runs === null ? (
        <p className="p-cell-meta">{t("loading")}</p>
      ) : runs.length ? (
        <form id="compare-form" onSubmit={compare}>
          <SelectField id="compare-baseline" label={t("compareWith")} value={baseline} onChange={(event) => setBaseline(event.target.value)} required>
            <option value="">{t("selectRun")}</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {new Date(run.created_at).toLocaleString()} · {run.status}
              </option>
            ))}
          </SelectField>
        </form>
      ) : (
        <Status>{t("noComparableRuns")}</Status>
      )}
      {comparison && (
        <div className="p-compare" aria-live="polite">
          <StatusBadge value={comparison.status} />
          {comparison.status !== "incompatible" && (
            <dl className="p-compare-grid">
              <div><dt>{t("improved")}</dt><dd>{comparison.improved ?? 0}</dd></div>
              <div><dt>{t("regressed")}</dt><dd>{comparison.regressed ?? 0}</dd></div>
              <div><dt>{t("unchanged")}</dt><dd>{comparison.unchanged ?? 0}</dd></div>
              <div><dt>{t("unassessedPairs")}</dt><dd>{comparison.unassessed ?? 0}</dd></div>
            </dl>
          )}
          {comparison.reasons?.length ? <p className="p-cell-meta">{t("comparisonIncompatible")} {comparison.reasons.join(", ").replaceAll("_", " ")}</p> : null}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------ revisions --- */

function RevisionsPanel({
  open,
  onOpenChange,
  orgId,
  reportId,
  revisions,
  selectedId,
  currentRevisionId,
  onChanged,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  reportId: string;
  revisions: ReportRevision[];
  selectedId: string;
  currentRevisionId: string | null;
  onChanged: () => void;
  onSelect: (id: string) => void;
}) {
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  async function publish(id: string) {
    setPending(id);
    setError("");
    try {
      await evalRequest(`/reports/${reportId}/publish`, "POST", { orgId, revisionId: id });
      notify(t("revisionPublished"));
      onChanged();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending("");
    }
  }
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={t("revisionsLabel")} description={t("revisionsHelp")}>
      {error && <Status error>{error}</Status>}
      <DataTable caption={t("reportRevisions")} headers={[t("revision"), t("statusLabel"), { label: t("actions"), align: "end", hidden: true }]}>
        {revisions.map((item) => (
          <tr key={item.id} data-selected={item.id === selectedId ? "true" : undefined}>
            <RowTitle meta={<Time value={item.created_at} />}>
              <span className="p-row">
                <code className="p-code">{item.id.slice(0, 8)}</code>
                {item.id === currentRevisionId && <Badge tone="strong">{t("currentRevision")}</Badge>}
              </span>
            </RowTitle>
            <td>
              <StatusBadge value={item.review_status} />
            </td>
            <td className="p-table-action">
              {item.id !== selectedId && (
                <Action variant="ghost" size="sm" onClick={() => onSelect(item.id)}>
                  {t("view")}
                </Action>
              )}
              {item.id !== currentRevisionId && (
                <Action variant="secondary" size="sm" disabled={!!pending} onClick={() => void publish(item.id)}>
                  {pending === item.id ? t("working") : t("publish")}
                </Action>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </SidePanel>
  );
}

/* ------------------------------------------------------------ takeaways --- */

function TakeawaysDialog({ open, onOpenChange, orgId, reportId, revision, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; orgId: string; reportId: string; revision: ReportRevision; onChanged: () => void }) {
  const [narratives, setNarratives] = useState<Narrative[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setNarratives(await evalRequest<Narrative[]>(`/reports/${reportId}/narrative?orgId=${encodeURIComponent(orgId)}`).catch(() => []));
  }, [orgId, reportId]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  async function draft() {
    setPending(true);
    setError("");
    try {
      await evalRequest(`/reports/${reportId}/narrative`, "POST", { orgId, revisionId: revision.id });
      notify(t("narrativeQueued"));
      await load();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("executiveTakeaways")}
      description={t("narrativeHelp")}
      footer={
        <>
          <Action variant="ghost" onClick={() => void load().then(onChanged)}>{t("refresh")}</Action>
          <span className="p-toolbar-spacer" />
          <Action onClick={() => void draft()} disabled={pending}>
            <Sparkles aria-hidden="true" />
            {t("draftTakeaways")}
          </Action>
        </>
      }
    >
      {error && <Status error>{error}</Status>}
      {narratives === null ? (
        <p className="p-cell-meta">{t("loading")}</p>
      ) : narratives.length ? (
        <ul className="p-keys">
          {narratives.map((item) => (
            <li key={item.id}>
              <span className="p-keys-main">
                <span className="p-keys-name">{t("draft")}</span>
                <span className="p-cell-meta">
                  {item.reason_code?.replaceAll("_", " ") ?? ""}
                  {item.rejected_count ? ` · ${item.rejected_count} ${t("claimsRejected")}` : ""}
                </span>
              </span>
              <StatusBadge value={item.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-cell-meta">{t("noNarratives")}</p>
      )}
    </Modal>
  );
}
