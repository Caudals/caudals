"use client";

import { useEffect, useState } from "react";
import { evalRequest } from "./api";
import { Action, Field, SettingsRow, Status, StatusBadge, Time } from "./primitives";
import { Modal } from "./overlays";
import { t } from "@/lib/evals/messages/en";

type Deletion = { id: string; status: string; requested_at: string; completed_at: string | null; summary: Record<string, unknown> } | null;

/** Owner-initiated workspace data deletion (spec §16.4). Access stops at once; objects follow. */
export function WorkspaceDeletion({ orgId, workspaceName }: { orgId: string; workspaceName: string }) {
  const [deletion, setDeletion] = useState<Deletion>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void evalRequest<Deletion>(`/workspaces/${orgId}/deletion`).then(setDeletion).catch(() => undefined);
  }, [orgId]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      setDeletion(await evalRequest<Deletion>(`/workspaces/${orgId}/deletion`, "POST", { reason, confirmName }, crypto.randomUUID()));
      setOpen(false);
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <SettingsRow title={t("deleteWorkspaceData")} description={t("deleteWorkspaceHelp")}>
        {deletion ? (
          <span className="p-row">
            <StatusBadge value={deletion.status} />
            <span className="p-cell-meta">
              {t("deletionRequestedAt")} <Time value={deletion.requested_at} />
            </span>
          </span>
        ) : (
          <Action variant="danger" onClick={() => setOpen(true)}>
            {t("deleteWorkspaceData")}
          </Action>
        )}
      </SettingsRow>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("deleteWorkspaceData")}
        description={t("deleteWorkspaceConfirm")}
        footer={
          <>
            <Action variant="secondary" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Action>
            <Action variant="danger" type="submit" form="delete-workspace" disabled={pending || confirmName !== workspaceName || reason.trim().length < 3}>
              {pending ? t("working") : t("deleteWorkspaceData")}
            </Action>
          </>
        }
      >
        <form id="delete-workspace" className="p-stack" onSubmit={submit}>
          {error && <Status error>{error}</Status>}
          <Field id="delete-reason" label={t("deletionReason")} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} />
          <Field id="delete-confirm" label={`${t("typeWorkspaceName")} ${workspaceName}`} value={confirmName} onChange={(event) => setConfirmName(event.target.value)} required autoComplete="off" />
        </form>
      </Modal>
    </>
  );
}
