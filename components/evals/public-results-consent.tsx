"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { SECTOR_LABELS } from "@/lib/evals/sector-packs/sectors";
import { getLocale, t, tv } from "@/lib/evals/messages/en";
import { localizePathname } from "@/lib/i18n/routing";
import { CONSENT_VERSION, INDEX_SECTORS, RESULTS_PATH, type IndexSector, type PublicationConsentView, type PublicationStatus } from "@/lib/publication/contracts";
import { evalRequest, EvalRequestError } from "./api";
import { Modal } from "./overlays";
import { Action, Check, Field, SelectField, Status, TextArea, formatDate } from "./primitives";

function requestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `consent-${crypto.randomUUID()}` : `consent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Where a consent stands: waiting for Caudals' review, published, taken down or withdrawn. */
function consentState(consent: PublicationConsentView) {
  if (consent.revokedAt) return tv("prRevokedOn", { date: formatDate(consent.revokedAt) });
  if (consent.page?.unpublishedAt) return tv("prStatusDown", { date: formatDate(consent.page.unpublishedAt) });
  if (consent.page) return tv("prStatusLive", { date: formatDate(consent.page.publishedAt) });
  return consent.resultsPage ? t("prStatusPending") : t("prStatusIndexOnly");
}

/**
 * The owner's written consent for an opt-in public results page and the
 * anonymous sector index (launch L-31, spec P-23, P-53). Recording consent
 * publishes nothing: Caudals reviews the page by hand first, and the owner can
 * withdraw consent here at any time, which takes a published page down at
 * once. Shown only while PUBLIC_RESULTS_ENABLED is on (read on the server),
 * to owners and workspace operators of a published report; only owners sign.
 */
export function PublicResultsConsent({ orgId, reportId, revisionId, workspaceName, marketingOrigin }: {
  orgId: string;
  reportId: string;
  revisionId: string;
  workspaceName: string;
  marketingOrigin?: string | null;
}) {
  const [status, setStatus] = useState<PublicationStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [notice, setNotice] = useState("");
  const base = `/reports/${encodeURIComponent(reportId)}/publication`;

  const load = useCallback(() => {
    let live = true;
    evalRequest<PublicationStatus>(`${base}?orgId=${encodeURIComponent(orgId)}`)
      .then((data) => { if (live) setStatus(data); })
      .catch(() => { if (live) setStatus(null); });
    return () => { live = false; };
  }, [base, orgId]);
  useEffect(() => load(), [load]);

  if (!status) return null;
  const current = status.consents.find((item) => item.revisionId === revisionId && !item.revokedAt) ?? null;
  const pageUrl = current?.page && !current.page.unpublishedAt && marketingOrigin
    ? `${marketingOrigin}${localizePathname(`${RESULTS_PATH}/${current.page.slug}`, getLocale())}` : null;

  return (
    <>
      <Action variant="ghost" onClick={() => { setNotice(""); setOpen(true); }} title={t("prActionHelp")} data-public-results={current ? "consented" : "none"}>
        <Globe aria-hidden="true" />
        {current ? t("prActionGiven") : t("prAction")}
      </Action>
      {current ? (
        <Modal
          open={open}
          onOpenChange={setOpen}
          title={t("prTitle")}
          description={t("prIntro")}
          alert={notice ? <Status>{notice}</Status> : undefined}
          footer={
            <>
              <Action variant="secondary" onClick={() => setOpen(false)}>{t("close")}</Action>
              {status.canConsent && <Action variant="danger" onClick={() => setWithdrawing(true)}>{t("prWithdraw")}</Action>}
            </>
          }
        >
          <div className="p-stack" data-public-results-consent={current.id}>
            <p role="status">{consentState(current)}</p>
            <p className="p-field-hint">{tv("prSignedBy", { name: current.signer.name, role: current.signer.role, date: formatDate(current.signedAt) })}</p>
            {current.resultsPage && (
              <dl className="p-stack p-stack-tight">
                <div><dt className="p-field-hint">{t("prPublicName")}</dt><dd>{current.publicName}</dd></div>
                <div><dt className="p-field-hint">{t("prScope")}</dt><dd>{current.scopeSummary}</dd></div>
              </dl>
            )}
            {current.sectorIndex && current.indexSector && <p>{tv("prIndexIncluded", { sector: t(SECTOR_LABELS[current.indexSector]) })}</p>}
            {pageUrl && <a href={pageUrl} target="_blank" rel="noopener noreferrer">{t("prViewPage")}</a>}
            {!status.canConsent && <p className="p-field-hint">{t("prOwnerOnly")}</p>}
          </div>
        </Modal>
      ) : (
        <ConsentDialog
          open={open}
          onOpenChange={setOpen}
          status={status}
          orgId={orgId}
          base={base}
          revisionId={revisionId}
          workspaceName={workspaceName}
          onRecorded={(next) => { setStatus(next); setOpen(false); }}
        />
      )}
      {current && (
        <WithdrawDialog
          open={withdrawing}
          onOpenChange={setWithdrawing}
          orgId={orgId}
          base={base}
          consent={current}
          onWithdrawn={(next) => { setStatus(next); setWithdrawing(false); setOpen(false); setNotice(t("prWithdrawn")); }}
        />
      )}
      {notice && !open && <p className="p-field-hint" role="status">{notice}</p>}
    </>
  );
}

function ConsentDialog({ open, onOpenChange, status, orgId, base, revisionId, workspaceName, onRecorded }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: PublicationStatus;
  orgId: string;
  base: string;
  revisionId: string;
  workspaceName: string;
  onRecorded: (status: PublicationStatus) => void;
}) {
  const [resultsPage, setResultsPage] = useState(true);
  const [sectorIndex, setSectorIndex] = useState(false);
  const [publicName, setPublicName] = useState(workspaceName);
  const [scopeSummary, setScopeSummary] = useState("");
  const [sector, setSector] = useState<IndexSector | "">(status.workspaceSector ?? "");
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(requestId);

  const ready = (resultsPage || sectorIndex) && agreed && signerName.trim().length >= 2 && signerRole.trim().length >= 2
    && (!resultsPage || (publicName.trim().length >= 2 && scopeSummary.trim().length >= 10))
    && (!sectorIndex || sector !== "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError("");
    try {
      const next = await evalRequest<PublicationStatus>(base, "POST", {
        orgId, revisionId, resultsPage, sectorIndex,
        ...(resultsPage ? { publicName: publicName.trim(), scopeSummary: scopeSummary.trim() } : {}),
        ...(sectorIndex && sector ? { indexSector: sector } : {}),
        signerName: signerName.trim(), signerRole: signerRole.trim(), version: CONSENT_VERSION, locale: getLocale(), accepted: true, requestId: key,
      });
      onRecorded(next);
    } catch (caught) {
      setError(caught instanceof EvalRequestError && caught.code === "REPORT_NOT_PUBLISHED" ? t("prNeedsPublished")
        : caught instanceof EvalRequestError && caught.code === "OWNER_REQUIRED" ? t("prOwnerOnly") : t("prFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => { onOpenChange(value); if (!value) setError(""); }}
      title={t("prTitle")}
      description={t("prIntro")}
      size="lg"
      alert={error ? <Status error>{error}</Status> : undefined}
      footer={
        status.canConsent ? (
          <>
            <Action variant="secondary" onClick={() => onOpenChange(false)}>{t("cancel")}</Action>
            <Action type="submit" form="public-results-form" disabled={!ready || pending} aria-busy={pending}>
              {pending ? t("prSubmitting") : t("prSubmit")}
            </Action>
          </>
        ) : (
          <Action variant="secondary" onClick={() => onOpenChange(false)}>{t("close")}</Action>
        )
      }
    >
      {!status.canConsent ? (
        <div className="p-stack">
          <p>{t("prNoConsent")}</p>
          <p className="p-field-hint">{t("prOwnerOnly")}</p>
        </div>
      ) : (
        <form id="public-results-form" className="p-stack" onSubmit={(event) => void submit(event)}>
          <fieldset className="p-fieldset">
            <legend>{t("prUses")}</legend>
            <div className="p-stack p-stack-tight">
              <Check checked={resultsPage} onChange={(event) => setResultsPage(event.target.checked)} label={t("prUsePage")} description={t("prUsePageHelp")} />
              <Check checked={sectorIndex} onChange={(event) => setSectorIndex(event.target.checked)} label={t("prUseIndex")} description={t("prUseIndexHelp")} />
            </div>
          </fieldset>
          {resultsPage && (
            <>
              <Field id="public-results-name" label={t("prPublicName")} hint={t("prPublicNameHint")} maxLength={120} required value={publicName} onChange={(event) => setPublicName(event.target.value)} />
              <TextArea id="public-results-scope" label={t("prScope")} hint={t("prScopeHint")} rows={3} minLength={10} maxLength={400} required value={scopeSummary} onChange={(event) => setScopeSummary(event.target.value)} />
              <div className="p-stack p-stack-tight" data-public-results-shows>
                <p className="p-check-label">{t("prShows")}</p>
                <ul className="p-bullets">
                  <li>{t("prShowsDates")}</li>
                  <li>{t("prShowsSample")}</li>
                  <li>{t("prShowsOutcomes")}</li>
                  <li>{t("prShowsReview")}</li>
                  <li>{t("prShowsMethod")}</li>
                </ul>
                <p className="p-field-hint">{t("prNeverShows")}</p>
              </div>
            </>
          )}
          {sectorIndex && (
            <SelectField id="public-results-sector" label={t("prSector")} required value={sector} onChange={(event) => setSector(event.target.value as IndexSector)}>
              <option value="" disabled>{t("prSectorChoose")}</option>
              {INDEX_SECTORS.map((value) => <option key={value} value={value}>{t(SECTOR_LABELS[value])}</option>)}
            </SelectField>
          )}
          <section className="p-stack p-stack-tight eval-consent-text" aria-labelledby="public-results-consent-heading" data-consent-version={CONSENT_VERSION}>
            <p className="p-check-label" id="public-results-consent-heading">{t("prConsentHeading")}</p>
            {resultsPage && <p>{tv("prConsentPage", { workspace: workspaceName })}</p>}
            {sectorIndex && <p>{tv("prConsentIndex", { workspace: workspaceName })}</p>}
            <p>{t("prConsentLimits")}</p>
            <p>{t("prConsentRevoke")}</p>
            <p className="p-field-hint">{tv("prConsentVersion", { version: CONSENT_VERSION })}</p>
          </section>
          <div className="p-grid p-grid-2">
            <Field id="public-results-signer" label={t("prSignerName")} autoComplete="name" maxLength={120} required value={signerName} onChange={(event) => setSignerName(event.target.value)} />
            <Field id="public-results-role" label={t("prSignerRole")} autoComplete="organization-title" maxLength={120} required value={signerRole} onChange={(event) => setSignerRole(event.target.value)} />
          </div>
          <Check checked={agreed} onChange={(event) => setAgreed(event.target.checked)} label={tv("prAgree", { workspace: workspaceName })} />
        </form>
      )}
    </Modal>
  );
}

function WithdrawDialog({ open, onOpenChange, orgId, base, consent, onWithdrawn }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  base: string;
  consent: PublicationConsentView;
  onWithdrawn: (status: PublicationStatus) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function withdraw() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      onWithdrawn(await evalRequest<PublicationStatus>(base, "PATCH", { orgId, consentId: consent.id, ...(reason.trim() ? { reason: reason.trim() } : {}) }));
    } catch {
      setError(t("prWithdrawFailed"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("prWithdrawTitle")}
      description={t("prWithdrawIntro")}
      size="sm"
      alert={error ? <Status error>{error}</Status> : undefined}
      footer={
        <>
          <Action variant="secondary" onClick={() => onOpenChange(false)}>{t("cancel")}</Action>
          <Action variant="danger" onClick={() => void withdraw()} disabled={pending} aria-busy={pending}>{t("prWithdrawConfirm")}</Action>
        </>
      }
    >
      <TextArea id="public-results-withdraw-reason" label={t("prWithdrawReason")} rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
    </Modal>
  );
}
