"use client";

import { useCallback, useEffect, useState } from "react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, Badge, Check, SettingsRow, Status } from "./primitives";
import { Modal, notify } from "./overlays";
import { localizePathname } from "@/lib/i18n/routing";
import { LEGAL_DOCUMENT_PATHS, dpaTemplateFileName } from "@/lib/legal/versions";
import { getLocale, t, tv } from "@/lib/evals/messages/en";

/** `GET/POST /workspaces/:id/dpa` (lib/legal/dpa.ts). */
export type DpaStatus = {
  document: "dpa";
  currentVersion: string;
  canAccept: boolean;
  you: { name: string; email: string };
  acceptance: {
    id: string;
    version: string;
    acceptedAt: string;
    locale: "en" | "es" | null;
    current: boolean;
    signer: { name: string; email: string } | null;
  } | null;
};

function isDpaStatus(value: unknown): value is DpaStatus {
  const status = value as DpaStatus | null;
  return Boolean(
    status &&
      status.document === "dpa" &&
      typeof status.currentVersion === "string" &&
      typeof status.canAccept === "boolean" &&
      status.you &&
      (status.acceptance === null || typeof status.acceptance?.acceptedAt === "string"),
  );
}

/** The acceptance date as the person reads it, in their interface language. */
function acceptedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(getLocale() === "es" ? "es-ES" : "en-US", { dateStyle: "long" }).format(date);
}

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dpa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** What the record says, in one sentence. */
function statusLine(status: DpaStatus) {
  const acceptance = status.acceptance;
  if (!acceptance) return tv("dpaNotAcceptedHelp", { version: status.currentVersion });
  const date = acceptedDate(acceptance.acceptedAt);
  if (!acceptance.current) return tv("dpaOlderAccepted", { version: acceptance.version, date, current: status.currentVersion });
  return acceptance.signer
    ? tv("dpaAcceptedBy", { version: acceptance.version, name: acceptance.signer.name, email: acceptance.signer.email, date })
    : tv("dpaAcceptedOn", { version: acceptance.version, date });
}

/**
 * Settings → General: the workspace's Data Processing Agreement (launch L-30,
 * spec P-42). Everyone sees the status; an owner accepts the published
 * version in one click, recorded through L-01's acceptance function with the
 * version, the date and the signer. The public page and the Word template
 * stay one link away for a review or a countersigned copy.
 */
export function DpaSetting({
  orgId,
  workspaceName,
  marketingOrigin = "https://caudals.com",
}: {
  orgId: string;
  workspaceName: string;
  /** The public site, where the DPA and its template are published. */
  marketingOrigin?: string;
}) {
  const [status, setStatus] = useState<DpaStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const locale = getLocale();
  const documentUrl = `${marketingOrigin}${localizePathname(LEGAL_DOCUMENT_PATHS.dpa, locale)}`;
  const templateUrl = `${marketingOrigin}/legal/${dpaTemplateFileName(locale)}`;

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await evalRequest<unknown>(`/workspaces/${orgId}/dpa`);
      if (!isDpaStatus(data)) throw new Error("unexpected DPA status");
      setStatus(data);
    } catch {
      setFailed(true);
    }
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  const acceptance = status?.acceptance ?? null;
  const description = (
    <span className="p-stack p-stack-tight">
      <span>{t("dpaHelp")}</span>
      {status && (
        <span>
          <strong>{statusLine(status)}</strong>
          {!status.canAccept && !acceptance?.current ? ` ${t("dpaOwnerCanAccept")}` : null}
        </span>
      )}
      <span>
        <a className="p-link" href={documentUrl} target="_blank" rel="noopener noreferrer">
          {t("dpaRead")}
        </a>
        {" · "}
        <a className="p-link" href={templateUrl} download>
          {t("dpaDownload")}
        </a>
      </span>
      <span>{t("dpaCountersign")}</span>
    </span>
  );

  return (
    <SettingsRow id="dpa" title={t("dpaTitle")} description={description}>
      {failed ? (
        <>
          <span className="p-cell-meta">{t("dpaLoadError")}</span>
          <Action variant="secondary" size="sm" onClick={() => void load()}>
            {t("retry")}
          </Action>
        </>
      ) : !status ? (
        <p className="p-loading" role="status">
          <span className="p-spinner" aria-hidden="true" />
          {t("loading")}
        </p>
      ) : (
        <>
          {acceptance?.current ? (
            <Badge tone="pass" dot>
              {t("dpaAccepted")}
            </Badge>
          ) : acceptance ? (
            <Badge tone="warn" dot>
              {t("dpaNewVersion")}
            </Badge>
          ) : (
            <Badge dot>{t("dpaNotAccepted")}</Badge>
          )}
          {status.canAccept && !acceptance?.current && (
            <Action variant="secondary" size="sm" onClick={() => setReviewing(true)}>
              {t("dpaReview")}
            </Action>
          )}
        </>
      )}
      {reviewing && status && (
        <DpaAcceptDialog
          orgId={orgId}
          version={status.currentVersion}
          workspaceName={workspaceName}
          signer={status.you}
          documentUrl={documentUrl}
          onClose={() => setReviewing(false)}
          onAccepted={(next) => {
            setStatus(next);
            setReviewing(false);
            notify(t("dpaAcceptedToast"));
          }}
        />
      )}
    </SettingsRow>
  );
}

function DpaAcceptDialog({
  orgId,
  version,
  workspaceName,
  signer,
  documentUrl,
  onClose,
  onAccepted,
}: {
  orgId: string;
  version: string;
  workspaceName: string;
  signer: { name: string; email: string };
  documentUrl: string;
  onClose: () => void;
  onAccepted: (status: DpaStatus) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // One id per dialog: retrying after a network failure records one acceptance.
  const [requestId] = useState(newRequestId);

  async function accept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || pending) return;
    setPending(true);
    setError("");
    try {
      const next = await evalRequest<unknown>(`/workspaces/${orgId}/dpa`, "POST", { version, locale: getLocale(), requestId });
      if (!isDpaStatus(next)) throw new Error(t("error"));
      onAccepted(next);
    } catch (caught) {
      const code = caught instanceof EvalRequestError ? caught.code : null;
      setError(
        code === "OWNER_REQUIRED" || code === "SCOPE_DENIED"
          ? t("dpaOwnerRequired")
          : code === "VERSION_CHANGED"
            ? t("dpaVersionChanged")
            : t("error"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !pending && onClose()}
      title={t("dpaDialogTitle")}
      description={tv("dpaDialogDescription", { version, workspace: workspaceName })}
      alert={error ? <Status error>{error}</Status> : null}
      footer={
        <>
          <Action variant="secondary" disabled={pending} onClick={onClose}>
            {t("cancel")}
          </Action>
          <Action type="submit" form="dpa-accept-form" disabled={!confirmed || pending}>
            {pending ? t("dpaAccepting") : t("dpaAccept")}
          </Action>
        </>
      }
    >
      <form id="dpa-accept-form" className="p-stack" onSubmit={accept}>
        <p>{tv("dpaDialogIntro", { workspace: workspaceName })}</p>
        <p>
          <a className="p-link" href={documentUrl} target="_blank" rel="noopener noreferrer">
            {t("dpaRead")}
          </a>
        </p>
        <p className="p-cell-meta">{tv("dpaSigningAs", { name: signer.name, email: signer.email })}</p>
        <Check
          name="dpa-confirm"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
          label={tv("dpaConfirm", { workspace: workspaceName })}
        />
      </form>
    </Modal>
  );
}
