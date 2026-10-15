"use client";

import { useCallback, useEffect, useState } from "react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, ActionAnchor, Badge, SelectField, SettingsRow, Status, formatDate } from "./primitives";
import { Modal, notify } from "./overlays";
import { OBSERVATION_RETENTION_DAYS, WORKSPACE_EXPORT_LINK_DAYS, type ObservationRetentionDays } from "@/lib/evals/data-controls/flags";
import { getLocale, t, tv } from "@/lib/evals/messages/runtime";

/** `GET/PUT /workspaces/:id/retention` (lib/evals/data-controls/retention.ts). */
type RetentionPreview = { days: ObservationRetentionDays; due: number; pinned: number; purged: number };
type RetentionStatus = {
  observationDays: ObservationRetentionDays | null;
  version: number;
  updatedAt: string | null;
  canChange: boolean;
  preview: RetentionPreview | null;
};
/** `GET/POST /exports/workspace` (lib/evals/operations/workspace-export.ts). */
type WorkspaceExport = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "deleted" | "expired";
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  byteSize: number | null;
  fileName: string | null;
  reasonCode: string | null;
  counts: Record<string, number> | null;
  downloadPath: string | null;
};

const KEEP = "keep";
const LoadingLine = () => (
  <p className="p-loading" role="status">
    <span className="p-spinner" aria-hidden="true" />
    {t("loading")}
  </p>
);

function fileSize(bytes: number) {
  const locale = getLocale() === "es" ? "es-ES" : "en-GB";
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(1, bytes / 1024))} KB`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

function count(value: number | undefined) {
  return new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB").format(value ?? 0);
}

/**
 * Settings → Data (launch L-32, spec P-44): how long answers are kept and
 * "Export all workspace data". Every member sees the settings; owners act.
 * Shown only while DATA_CONTROLS_ENABLED is on (read on the server).
 */
export function WorkspaceDataControls({ orgId, owner }: { orgId: string; owner: boolean }) {
  return (
    <div className="p-settings">
      <RetentionSetting orgId={orgId} />
      <ExportSetting orgId={orgId} owner={owner} />
    </div>
  );
}

function RetentionSetting({ orgId }: { orgId: string }) {
  const [status, setStatus] = useState<RetentionStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState(KEEP);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<{ days: ObservationRetentionDays; preview: RetentionPreview | null } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await evalRequest<RetentionStatus>(`/workspaces/${orgId}/retention`);
      setStatus(data);
      setChoice(data.observationDays ? String(data.observationDays) : KEEP);
    } catch {
      setFailed(true);
    }
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(days: ObservationRetentionDays | null) {
    setPending(true);
    setError("");
    try {
      const next = await evalRequest<RetentionStatus>(`/workspaces/${orgId}/retention`, "PUT", { observationDays: days });
      setStatus(next);
      setChoice(next.observationDays ? String(next.observationDays) : KEEP);
      setConfirming(null);
      notify(t("dataRetentionSaved"));
    } catch (caught) {
      setError(caught instanceof EvalRequestError && caught.code === "OWNER_REQUIRED" ? t("dataRetentionOwnerOnly") : caught instanceof Error ? caught.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status) return;
    const days = choice === KEEP ? null : (Number(choice) as ObservationRetentionDays);
    // A shorter period removes answers: show what it means first. A longer one removes nothing.
    if (days !== null && (status.observationDays === null || days < status.observationDays)) {
      setError("");
      setConfirming({ days, preview: null });
      try {
        const data = await evalRequest<RetentionStatus>(`/workspaces/${orgId}/retention?preview=${days}`);
        setConfirming((current) => (current?.days === days ? { days, preview: data.preview } : current));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t("error"));
      }
      return;
    }
    await save(days);
  }

  const current = status?.observationDays ?? null;
  const unchanged = (choice === KEEP ? null : Number(choice)) === current;
  const description = (
    <div className="p-stack p-stack-tight">
      <p>{t("dataRetentionHelp")}</p>
      {status && (
        <p>
          <strong>{current ? tv("dataRetentionStatusDays", { days: current }) : t("dataRetentionStatusKeep")}</strong>
          {status.updatedAt ? ` ${tv("dataRetentionChangedOn", { date: formatDate(status.updatedAt) })}` : null}
        </p>
      )}
      {status && !status.canChange && <p>{t("dataRetentionOwnerOnly")}</p>}
    </div>
  );

  return (
    <SettingsRow id="retention" title={t("dataRetentionTitle")} description={description}>
      {failed ? (
        <>
          <span className="p-cell-meta">{t("dataRetentionLoadError")}</span>
          <Action variant="secondary" size="sm" onClick={() => void load()}>
            {t("retry")}
          </Action>
        </>
      ) : !status ? (
        <LoadingLine />
      ) : status.canChange ? (
        <form className="p-stack p-stack-tight" onSubmit={submit}>
          {error && !confirming && <Status error>{error}</Status>}
          <SelectField id="retention-days" label={t("dataRetentionLabel")} value={choice} onChange={(event) => setChoice(event.target.value)} disabled={pending}>
            <option value={KEEP}>{t("dataRetentionKeep")}</option>
            {OBSERVATION_RETENTION_DAYS.map((days) => (
              <option key={days} value={String(days)}>
                {tv("dataRetentionDays", { days })}
              </option>
            ))}
          </SelectField>
          <span className="p-row">
            <Action type="submit" variant="secondary" size="sm" disabled={pending || unchanged}>
              {pending ? t("saving") : t("dataRetentionSave")}
            </Action>
          </span>
        </form>
      ) : (
        <Badge dot>{current ? tv("dataRetentionDays", { days: current }) : t("dataRetentionKeep")}</Badge>
      )}
      {confirming && (
        <Modal
          open
          onOpenChange={(open) => !open && !pending && setConfirming(null)}
          title={tv("dataRetentionConfirmTitle", { days: confirming.days })}
          alert={error ? <Status error>{error}</Status> : null}
          footer={
            <>
              <Action variant="secondary" disabled={pending} onClick={() => setConfirming(null)}>
                {t("cancel")}
              </Action>
              <Action variant="danger" disabled={pending || !confirming.preview} onClick={() => void save(confirming.days)}>
                {pending ? t("saving") : tv("dataRetentionConfirmAction", { days: confirming.days })}
              </Action>
            </>
          }
        >
          <div className="p-stack p-stack-tight">
            {!confirming.preview ? (
              <p className="p-loading" role="status">
                <span className="p-spinner" aria-hidden="true" />
                {t("dataRetentionChecking")}
              </p>
            ) : (
              <>
                <p>
                  {confirming.preview.due === 0
                    ? tv("dataRetentionConfirmNone", { days: confirming.days })
                    : confirming.preview.due === 1
                      ? tv("dataRetentionConfirmDueOne", { days: confirming.days })
                      : tv("dataRetentionConfirmDueMany", { days: confirming.days, count: count(confirming.preview.due) })}
                </p>
                {confirming.preview.pinned > 0 && (
                  <p>
                    {confirming.preview.pinned === 1
                      ? t("dataRetentionConfirmPinnedOne")
                      : tv("dataRetentionConfirmPinnedMany", { count: count(confirming.preview.pinned) })}
                  </p>
                )}
                <p>{t("dataRetentionConfirmFinal")}</p>
              </>
            )}
          </div>
        </Modal>
      )}
    </SettingsRow>
  );
}

function ExportSetting({ orgId, owner }: { orgId: string; owner: boolean }) {
  const [exports, setExports] = useState<WorkspaceExport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setExports(await evalRequest<WorkspaceExport[]>(`/exports/workspace?orgId=${orgId}`));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [orgId]);
  useEffect(() => {
    if (owner) void load();
  }, [owner, load]);
  const latest = exports?.[0] ?? null;
  const working = latest?.status === "queued" || latest?.status === "running";
  // While the export is being prepared, look again every few seconds.
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [working, load]);

  async function prepare() {
    setPending(true);
    setError("");
    try {
      const created = await evalRequest<WorkspaceExport>("/exports/workspace", "POST", { orgId, locale: getLocale() });
      setExports((current) => [created, ...(current ?? []).filter((item) => item.id !== created.id)]);
      notify(t("dataExportStarted"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    setError("");
    try {
      await evalRequest(`/exports/workspace/${id}?orgId=${orgId}`, "DELETE");
      setExports((current) => (current ?? []).filter((item) => item.id !== id));
      notify(t("dataExportDeleted"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  const description = (
    <div className="p-stack p-stack-tight">
      <p>{tv("dataExportHelp", { days: WORKSPACE_EXPORT_LINK_DAYS })}</p>
      {!owner && <p>{t("dataExportOwnerOnly")}</p>}
      {owner && latest && (
        <p aria-live="polite">
          {latest.status === "queued" ? (
            t("dataExportQueued")
          ) : latest.status === "running" ? (
            t("dataExportRunning")
          ) : latest.status === "completed" && latest.downloadPath ? (
            <>
              <strong>{tv("dataExportReady", { size: fileSize(latest.byteSize ?? 0), date: formatDate(latest.expiresAt) })}</strong>{" "}
              {tv("dataExportCounts", { reports: count(latest.counts?.reports), runs: count(latest.counts?.runs), answers: count(latest.counts?.observations) })}
            </>
          ) : latest.status === "failed" ? (
            latest.reasonCode === "export_too_large" ? t("dataExportTooLarge") : t("dataExportFailed")
          ) : (
            t("dataExportExpired")
          )}
        </p>
      )}
    </div>
  );

  return (
    <SettingsRow id="export" title={t("dataExportTitle")} description={description}>
      {!owner ? null : failed ? (
        <>
          <span className="p-cell-meta">{t("dataExportLoadError")}</span>
          <Action variant="secondary" size="sm" onClick={() => void load()}>
            {t("retry")}
          </Action>
        </>
      ) : !exports ? (
        <LoadingLine />
      ) : (
        <span className="p-stack p-stack-tight">
          {error && <Status error>{error}</Status>}
          <span className="p-row">
            {working ? (
              <span className="p-loading" role="status">
                <span className="p-spinner" aria-hidden="true" />
                {latest?.status === "queued" ? t("stageQueued") : t("working")}
              </span>
            ) : latest?.status === "completed" && latest.downloadPath ? (
              <>
                <ActionAnchor variant="secondary" size="sm" href={latest.downloadPath} download={latest.fileName ?? undefined}>
                  {t("dataExportDownload")}
                </ActionAnchor>
                <Action variant="secondary" size="sm" disabled={pending} onClick={() => void remove(latest.id)}>
                  {t("dataExportDelete")}
                </Action>
              </>
            ) : (
              <Action variant="secondary" size="sm" disabled={pending} onClick={() => void prepare()}>
                {latest ? t("dataExportPrepareAgain") : t("dataExportPrepare")}
              </Action>
            )}
          </span>
        </span>
      )}
    </SettingsRow>
  );
}
