"use client";

/**
 * Everyday item actions shared by every list and detail page: rename and
 * delete. Delete archives the item for the workspace (it disappears from every
 * list) while its evidence stays immutable for audit, as the retention policy
 * requires. Both confirm in a dialog and report errors inside it.
 */
import { useState } from "react";
import { evalRequest } from "./api";
import { Action, Field, Status } from "./primitives";
import { Modal, notify } from "./overlays";
import { t } from "@/lib/evals/messages/en";

export type ItemKind = "evaluations" | "systems" | "test-sets" | "reports" | "sources";
type DialogKind = ItemKind | "cases";

const DELETE_COPY: Record<DialogKind, { title: string; help: string; done: string }> = {
  evaluations: { title: t("deleteEvaluation"), help: t("deleteEvaluationHelp"), done: t("evaluationDeleted") },
  systems: { title: t("deleteSystem"), help: t("deleteSystemHelp"), done: t("systemDeleted") },
  "test-sets": { title: t("deleteTestSet"), help: t("deleteTestSetHelp"), done: t("testSetDeleted") },
  reports: { title: t("deleteReport"), help: t("deleteReportHelp"), done: t("reportDeleted") },
  sources: { title: t("removeSource"), help: t("removeSourceHelp"), done: t("sourceRemoved") },
  cases: { title: t("removeQuestion"), help: t("removeQuestionHelp"), done: t("questionRemoved") },
};

/** PATCH/DELETE one item through the shared lifecycle endpoint. */
export function itemRequest(kind: ItemKind, id: string, orgId: string, method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
  return method === "DELETE"
    ? evalRequest(`/items/${kind}/${id}?orgId=${encodeURIComponent(orgId)}`, "DELETE")
    : evalRequest(`/items/${kind}/${id}`, "PATCH", { orgId, ...body });
}

export function RenameDialog({
  title,
  label,
  initial,
  onClose,
  onSave,
  maxLength = 200,
}: {
  title: string;
  label: string;
  initial: string;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
  maxLength?: number;
}) {
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await onSave(value.trim());
      notify(t("renamed"));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      size="sm"
      alert={error ? <Status error>{error}</Status> : null}
      footer={
        <>
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action type="submit" form="rename-item" disabled={pending || !value.trim() || value.trim() === initial}>
            {pending ? t("saving") : t("save")}
          </Action>
        </>
      }
    >
      <form id="rename-item" onSubmit={submit}>
        <Field id="rename-value" label={label} value={value} onChange={(event) => setValue(event.target.value)} required maxLength={maxLength} autoFocus />
      </form>
    </Modal>
  );
}

export function DeleteDialog({
  kind,
  name,
  onClose,
  onConfirm,
}: {
  kind: DialogKind;
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const copy = DELETE_COPY[kind];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setPending(true);
    setError("");
    try {
      await onConfirm();
      notify(copy.done);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={copy.title}
      description={<><strong>{name}</strong>. {copy.help}</>}
      size="sm"
      alert={error ? <Status error>{error}</Status> : null}
      footer={
        <>
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action variant="danger" onClick={() => void confirm()} disabled={pending}>
            {pending ? t("working") : kind === "sources" || kind === "cases" ? t("remove") : t("delete")}
          </Action>
        </>
      }
    />
  );
}

/**
 * State for one pending rename or delete on a list, plus the dialog to render.
 * `onDone` runs after a successful change (usually a reload or navigation).
 */
export function useItemActions(orgId: string, onDone: () => void | Promise<void>) {
  const [target, setTarget] = useState<{ mode: "rename" | "delete"; kind: ItemKind; id: string; name: string } | null>(null);
  const dialog = target ? (
    target.mode === "rename" ? (
      <RenameDialog
        title={t("rename")}
        label={t("name")}
        initial={target.name}
        onClose={() => setTarget(null)}
        onSave={async (title) => {
          await itemRequest(target.kind, target.id, orgId, "PATCH", { title });
          await onDone();
        }}
      />
    ) : (
      <DeleteDialog
        kind={target.kind}
        name={target.name}
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          await itemRequest(target.kind, target.id, orgId, "DELETE");
          await onDone();
        }}
      />
    )
  ) : null;
  return {
    rename: (kind: ItemKind, id: string, name: string) => setTarget({ mode: "rename", kind, id, name }),
    remove: (kind: ItemKind, id: string, name: string) => setTarget({ mode: "delete", kind, id, name }),
    dialog,
  };
}
