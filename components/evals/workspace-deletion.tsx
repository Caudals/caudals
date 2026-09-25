"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { evalRequest } from "./api";
import { Field, Status, StatusBadge } from "./primitives";
import { t } from "@/lib/evals/messages/en";

type Deletion = { id: string; status: string; requested_at: string; completed_at: string | null; summary: Record<string, unknown> } | null;

/** Owner-initiated workspace data deletion (spec §16.4). Access stops at once; objects follow. */
export function WorkspaceDeletion({ orgId, workspaceName }: { orgId: string; workspaceName: string }) {
  const [deletion, setDeletion] = useState<Deletion>(null);
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => { void evalRequest<Deletion>(`/workspaces/${orgId}/deletion`).then(setDeletion).catch(() => undefined); }, [orgId]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    try { setDeletion(await evalRequest<Deletion>(`/workspaces/${orgId}/deletion`, "POST", { reason, confirmName }, crypto.randomUUID())); }
    catch (reasonError) { setError(reasonError instanceof Error ? reasonError.message : t("error")); }
    finally { setPending(false); }
  }
  return (
    <section className="eval-panel" aria-label={t("deleteWorkspaceData")}>
      <h2>{t("deleteWorkspaceData")}</h2>
      <p>{t("deleteWorkspaceHelp")}</p>
      {deletion ? <Status><StatusBadge value={deletion.status} /> {t("deletionRequestedAt")} {new Date(deletion.requested_at).toLocaleString()}{deletion.completed_at ? ` · ${t("deletionCompletedAt")} ${new Date(deletion.completed_at).toLocaleString()}` : ""}</Status> : (
        <form className="p-stack" onSubmit={submit}>
          {error && <Status error>{error}</Status>}
          <Field id="delete-reason" label={t("deletionReason")} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} />
          <Field id="delete-confirm" label={`${t("typeWorkspaceName")} ${workspaceName}`} value={confirmName} onChange={(event) => setConfirmName(event.target.value)} required autoComplete="off" />
          <Button className="justify-self-start" variant="destructive" disabled={pending || confirmName !== workspaceName || reason.trim().length < 3}>{t("deleteWorkspaceData")}</Button>
        </form>
      )}
    </section>
  );
}
