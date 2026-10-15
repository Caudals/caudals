"use client";

/**
 * Manual tax reviews in the ops billing console (launch G2, spec v2 §6.13,
 * §6.14): billing details that wait for a person (VIES could not confirm an
 * EU VAT number; a Spanish address in the Canary Islands, Ceuta or Melilla),
 * the purchases refused meanwhile and their open orders. A platform admin
 * with a recent sign-in sets the treatment after the review, within the IVA
 * rules the server enforces, and the buyer can then complete Checkout.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { evalRequest } from "./api";
import { Action, Badge, DataTable, EmptyState, Field, RowTitle, SectionHeading, Status, TableSkeleton, Time } from "./primitives";
import { Modal } from "./overlays";
import { accountHref, euros, newKey, treatmentLabel, useOpsAction } from "./ops-billing-shared";
import { t, tv, type MessageKey } from "@/lib/evals/messages/runtime";

type Treatment = "es_vat" | "eu_reverse_charge" | "non_eu_not_subject";
type Review = {
  orgId: string; workspace: string; legalName: string; country: string; taxId: string; taxIdKind: string; viesStatus: string; viesCheckedAt: string | null;
  reviewReason: "vies_unavailable" | "es_special_territory"; postalCode: string; city: string; region: string | null; billingEmail: string;
  version: number; since: string; allowed: Treatment[];
  blocked: Array<{ source: "checkout" | "auto_recharge"; netCents: number | null; at: string }>;
  openOrders: Array<{ orderId: string; kind: string; netCents: number; taxTreatment: string; createdAt: string }>;
};

const REASON: Record<Review["reviewReason"], MessageKey> = { vies_unavailable: "billingOpsTaxReasonVies", es_special_territory: "billingOpsTaxReasonTerritory" };
/** What each choice means for the invoice, per review (§6.14). */
const CHOICE: Record<Review["reviewReason"], Partial<Record<Treatment, MessageKey>>> = {
  es_special_territory: { non_eu_not_subject: "billingOpsTaxChoiceTerritoryNotSubject", es_vat: "billingOpsTaxChoiceTerritoryVat" },
  vies_unavailable: { eu_reverse_charge: "billingOpsTaxChoiceViesReverse", es_vat: "billingOpsTaxChoiceViesVat" },
};

export function TaxReviews() {
  const [rows, setRows] = useState<Review[] | null>(null);
  const [failure, setFailure] = useState("");
  const [selected, setSelected] = useState<Review | null>(null);
  const load = useCallback(async () => {
    try { setRows((await evalRequest<{ reviews: Review[] }>("/billing/admin/tax-reviews")).reviews); setFailure(""); }
    catch (reason) { setFailure(reason instanceof Error ? reason.message : t("error")); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return (
    <section>
      <SectionHeading title={t("billingOpsTaxReviews")}>{t("billingOpsTaxReviewsHelp")}</SectionHeading>
      {failure && <Status error>{failure}</Status>}
      {!rows ? <TableSkeleton columns={5} /> : !rows.length ? <EmptyState title={t("billingOpsNoTaxReviews")}><p>{t("billingOpsNoTaxReviewsHelp")}</p></EmptyState> : (
        <DataTable caption={t("billingOpsTaxReviews")} headers={[t("workspace"), t("billingOpsTaxReason"), t("billingOpsTaxAddress"), t("billingOpsTaxBlocked"), { label: t("billingOpsTaxWaiting"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
          {rows.map(row => (
            <tr key={row.orgId}>
              <RowTitle meta={`${row.legalName} · ${row.taxId}`} href={accountHref(row.orgId)}>{row.workspace}</RowTitle>
              <td><Badge tone="warn" dot>{t(REASON[row.reviewReason])}</Badge></td>
              <td className="p-cell-meta">{[row.postalCode, row.city, row.region, row.country].filter(Boolean).join(" · ")}</td>
              <td className="p-cell-meta">{row.blocked.length ? tv("billingOpsTaxBlockedCount", { count: row.blocked.length, pack: euros(row.blocked[0].netCents) }) : "—"}</td>
              <td className="p-table-action p-cell-meta"><Time value={row.since} /></td>
              <td className="p-table-action"><Action size="sm" onClick={() => setSelected(row)}>{t("billingOpsTaxReview")}</Action></td>
            </tr>
          ))}
        </DataTable>
      )}
      <ReviewDialog review={selected} onClose={() => setSelected(null)} onDone={load} />
    </section>
  );
}

function ReviewDialog({ review, onClose, onDone }: { review: Review | null; onClose: () => void; onDone: () => Promise<void> }) {
  const { run, pending, messages, clear } = useOpsAction();
  const [choice, setChoice] = useState<Treatment | null>(null);
  const close = () => { setChoice(null); clear(); onClose(); };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review || !choice) return;
    const form = new FormData(event.currentTarget);
    const key = newKey();
    const body = { version: review.version, treatment: choice, viesConsultation: choice === "eu_reverse_charge" ? String(form.get("viesConsultation") ?? "").trim() : null, reason: form.get("reason") };
    void run(async () => {
      await evalRequest(`/billing/admin/tax-reviews/${review.orgId}`, "POST", body, key);
      return tv("billingOpsTaxResolved", { treatment: treatmentLabel(choice) });
    }).then(async ok => { if (ok) { close(); await onDone(); } });
  }
  return (
    <Modal alert={messages} open={!!review} onOpenChange={value => !value && close()} title={review ? `${t("billingOpsTaxReview")} · ${review.workspace}` : t("billingOpsTaxReview")}
      description={review ? t(review.reviewReason === "vies_unavailable" ? "billingOpsTaxViesHelp" : "billingOpsTaxTerritoryHelp") : undefined}
      footer={<><Action variant="secondary" onClick={close}>{t("cancel")}</Action><Action type="submit" form="ob-tax-review" disabled={pending || !choice}>{t("billingOpsTaxSet")}</Action></>}>
      {review && (
        <form id="ob-tax-review" className="p-stack" onSubmit={submit}>
          <dl className="p-defs">
            <div><dt>{t("billingOpsTaxLegalName")}</dt><dd>{review.legalName}</dd></div>
            <div><dt>{t("billingOpsTaxId")}</dt><dd><code className="p-code">{review.taxId}</code></dd></div>
            <div><dt>{t("billingOpsTaxAddress")}</dt><dd>{[review.postalCode, review.city, review.region, review.country].filter(Boolean).join(" · ")}</dd></div>
            {review.reviewReason === "vies_unavailable" && <div><dt>{t("billingOpsTaxViesLast")}</dt><dd>{review.viesCheckedAt ? <Time value={review.viesCheckedAt} /> : "—"}</dd></div>}
            <div><dt>{t("billingOpsTaxBillingEmail")}</dt><dd>{review.billingEmail}</dd></div>
            <div><dt>{t("billingOpsTaxBlocked")}</dt>
              <dd>{review.blocked.length ? review.blocked.slice(0, 5).map(item => `${euros(item.netCents)} · ${item.source === "auto_recharge" ? t("billingOpsTaxAutoRecharge") : t("billingOpsTaxCheckout")}`).join(", ") : "—"}</dd></div>
            {review.openOrders.length > 0 && <div><dt>{t("billingOpsTaxOpenOrders")}</dt><dd>{review.openOrders.map(order => `${euros(order.netCents)} · ${treatmentLabel(order.taxTreatment)}`).join(", ")}</dd></div>}
          </dl>
          <fieldset className="p-fieldset">
            <legend>{t("billingOpsTaxTreatment")}</legend>
            {review.allowed.map(treatment => (
              <label key={treatment} className="p-check">
                <input type="radio" name="treatment" value={treatment} checked={choice === treatment} onChange={() => setChoice(treatment)} required />
                <span><span className="p-check-label">{treatmentLabel(treatment)}</span><span className="p-check-desc">{t(CHOICE[review.reviewReason][treatment]!)}</span></span>
              </label>
            ))}
          </fieldset>
          {choice === "eu_reverse_charge" && <Field id="ob-tax-vies" name="viesConsultation" label={t("billingOpsTaxViesConsultation")} hint={t("billingOpsTaxViesConsultationHint")} required minLength={3} maxLength={100} />}
          <Field id="ob-tax-reason" name="reason" label={t("billingOpsReason")} required minLength={3} maxLength={2000} />
        </form>
      )}
    </Modal>
  );
}
