"use client";

import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import { trackProductEvent } from "@/lib/analytics/funnel-events";
import { REVIEW_SCOPES, REVIEW_SECTORS, type CustomerReviewRequest, type ReviewScope, type ReviewSector } from "@/lib/evals/experts/review-contracts";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";
import { evalRequest } from "./api";
import { Modal } from "./overlays";
import { Action, Field, SelectField, Status, TextArea, formatDate } from "./primitives";

const SCOPE_LABEL: Record<ReviewScope, MessageKey> = {
  failed_answers: "erScopeFailed", whole_report: "erScopeWhole", findings: "erScopeFindings", pilot: "erScopePilot",
};
export const SECTOR_LABEL: Record<ReviewSector, MessageKey> = {
  insurance: "erSectorInsurance", industrial: "erSectorIndustrial", healthcare: "erSectorHealthcare", banking: "erSectorBanking",
  energy: "erSectorEnergy", telecom: "erSectorTelecom", legal: "erSectorLegal", travel: "erSectorTravel",
  public_sector: "erSectorPublic", retail: "erSectorRetail", other: "erSectorOther",
};

const OPEN = new Set(["requested", "quoted", "ordered"]);

/** What the customer sees once they asked: the reply promise, the quote, the due date or the delivery. */
function requestStatus(request: CustomerReviewRequest) {
  if (request.status === "requested") return t("erRequested");
  if (request.status === "quoted") return t("erQuoted");
  if (request.status === "ordered") return request.dueAt ? tv("erOrderedDue", { date: formatDate(request.dueAt) }) : t("erOrdered");
  if (request.status === "delivered") return tv("erDelivered", { date: formatDate(request.deliveredAt) });
  return null;
}

function tomorrow() {
  const date = new Date(Date.now() + 86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * "Have an expert review this" (launch L-26, spec P-10): a short form (scope,
 * deadline, sector) on the report and on the evaluation's results. Sending it
 * opens an ops task with a CRM draft and one email to the founders; the
 * customer then sees "Requested — we'll reply within one working day". The
 * quote is written by hand, so nothing is priced or charged here.
 */
export function ExpertReviewRequest({ orgId, reportId, surface }: { orgId: string; reportId: string; surface: "report" | "results" }) {
  const [request, setRequest] = useState<CustomerReviewRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [scopeKind, setScopeKind] = useState<ReviewScope>("failed_answers");
  const [note, setNote] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sector, setSector] = useState<ReviewSector | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    evalRequest<{ request: CustomerReviewRequest | null }>(`/reports/${encodeURIComponent(reportId)}/expert-review?orgId=${encodeURIComponent(orgId)}`)
      .then((data) => { if (live) setRequest(data.request); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [orgId, reportId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!sector || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await evalRequest<{ request: CustomerReviewRequest; created: boolean }>(
        `/reports/${encodeURIComponent(reportId)}/expert-review`, "POST",
        { orgId, surface, scopeKind, scopeNote: note.trim() || null, deadline: deadline || null, sector, locale: getLocale() },
      );
      setRequest(result.request);
      setOpen(false);
      if (result.created) void trackProductEvent("expert_review_requested", { surface });
    } catch {
      setError(t("erFailed"));
    } finally {
      setPending(false);
    }
  }

  const status = request ? requestStatus(request) : null;
  const waiting = request && OPEN.has(request.status);
  return (
    <>
      {status && (
        <p className="eval-review-request" role="status" data-review-request={request?.status}>
          <UserCheck aria-hidden="true" />
          <span>{status}</span>
        </p>
      )}
      {!waiting && (
        <Action variant="ghost" onClick={() => setOpen(true)} title={t("erActionHelp")} data-expert-review-action={surface}>
          <UserCheck aria-hidden="true" />
          {t("erAction")}
        </Action>
      )}
      <Modal
        open={open}
        onOpenChange={(value) => { setOpen(value); if (!value) setError(""); }}
        title={t("erTitle")}
        description={t("erIntro")}
        alert={error ? <Status error>{error}</Status> : undefined}
        footer={
          <>
            <Action variant="secondary" onClick={() => setOpen(false)}>{t("cancel")}</Action>
            <Action type="submit" form="expert-review-form" disabled={pending || !sector} aria-busy={pending}>
              {pending ? t("erSending") : t("erSubmit")}
            </Action>
          </>
        }
      >
        <form id="expert-review-form" className="p-stack" onSubmit={(event) => void submit(event)}>
          <fieldset className="p-fieldset">
            <legend>{t("erScope")}</legend>
            <div className="eval-review-scopes">
              {REVIEW_SCOPES.map((value) => (
                <label className="p-check" key={value}>
                  <input type="radio" name="expert-review-scope" value={value} checked={scopeKind === value} onChange={() => setScopeKind(value)} />
                  <span><span className="p-check-label">{t(SCOPE_LABEL[value])}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <TextArea id="expert-review-note" label={t("erNote")} hint={t("erNoteHint")} rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="p-grid p-grid-2">
            <Field id="expert-review-deadline" type="date" label={t("erDeadline")} hint={t("erDeadlineHint")} min={tomorrow()} value={deadline} onChange={(event) => setDeadline(event.target.value)} />
            <SelectField id="expert-review-sector" label={t("erSector")} required value={sector} onChange={(event) => setSector(event.target.value as ReviewSector)}>
              <option value="" disabled>{t("erSectorChoose")}</option>
              {REVIEW_SECTORS.map((value) => <option key={value} value={value}>{t(SECTOR_LABEL[value])}</option>)}
            </SelectField>
          </div>
          <p className="p-field-hint">{t("erPriceNote")}</p>
        </form>
      </Modal>
    </>
  );
}
