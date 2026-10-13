"use client";

/**
 * Buying credits (launch L-12, spec §6.6, §6.12, §6.14): billing details with
 * the VIES check, packs with the VAT preview and the first top-up bonus,
 * Terms and Privacy acceptance, and the redirect to Stripe Checkout; plus the
 * return page that follows the order until Stripe confirms it. Card data
 * never reaches this page: Checkout and the Customer Portal are hosted by
 * Stripe. The full billing screens arrive with L-15.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { evalRequest } from "./api";
import { Action, ActionLink, Badge, Card, Check, EmptyState, Field, Loading, PageHeading, Section, SelectField, Status } from "./primitives";
import { useWorkspace } from "./workspace-context";
import { getLocale, t, tv } from "@/lib/evals/messages/en";

type Treatment = "es_vat" | "eu_reverse_charge" | "non_eu_not_subject";
type Profile = {
  legalName: string; country: string; taxId: string; taxIdKind: string; viesStatus: string; taxTreatment: Treatment | null;
  taxReviewReason: "vies_unavailable" | "es_special_territory" | null; addressLine1: string; addressLine2: string | null; postalCode: string;
  city: string; region: string | null; billingEmail: string;
};
type Pack = { id: string; netCents: number; vatCents: number | null; grossCents: number | null; credits: number; bonusCredits: number; bonusKind: string | null; blocked: string | null };
type Overview = {
  access: string; mode: "test" | "live"; profile: Profile | null; firstTopUp: boolean; packs: Pack[];
  balance: { availableCredits: number; frozen: boolean } | null; card: { brand: string | null; last4: string | null } | null;
  legal: { termsUrl: string; privacyUrl: string };
};
type Order = {
  id: string; status: string; netCents: number; vatCents: number; grossCents: number; credits: number; bonusCredits: number;
  bonusKind: string | null; taxMention: string | null;
};

const COUNTRIES = ("ES AD AE AR AT AU BE BG BR CA CH CL CN CO CR CY CZ DE DK DO EC EE EG FI FR GB GR GT HK HR HU IE IL IN IS IT JP KR LI LT LU LV MA MC MT MX MY NL NO NZ PA PE PH PL PR PT PY RO RS SA SE SG SI SK TH TR TW UA US UY VE ZA").split(" ");

function euros(cents: number) {
  return new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}
function count(value: number) {
  return new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB").format(value);
}
function countryName(code: string) {
  try { return new Intl.DisplayNames([getLocale()], { type: "region" }).of(code) ?? code; } catch { return code; }
}
function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function treatmentText(profile: Profile) {
  if (profile.taxReviewReason === "es_special_territory") return t("billingTreatmentReviewTerritory");
  if (!profile.taxTreatment) return t("billingTreatmentReviewVies");
  return t(profile.taxTreatment === "es_vat" ? "billingTreatmentEsVat" : profile.taxTreatment === "eu_reverse_charge" ? "billingTreatmentReverse" : "billingTreatmentNotSubject");
}

function ProfileForm({ orgId, initial, onSaved, onCancel }: { orgId: string; initial: Profile | null; onSaved: (profile: Profile) => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countries = useMemo(() => COUNTRIES.map(code => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name)), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    setBusy(true); setError(null);
    try {
      const saved = await evalRequest<Profile>("/billing/profile", "PUT", {
        orgId, legalName: text("legalName"), country: text("country"), taxId: text("taxId"), addressLine1: text("addressLine1"),
        addressLine2: text("addressLine2") || null, postalCode: text("postalCode"), city: text("city"), region: text("region") || null,
        billingEmail: text("billingEmail"), businessDeclaration: form.get("business") === "on",
      });
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error"));
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="p-stack" aria-label={t("billingDetailsTitle")}>
      <div className="p-form-grid">
        <Field id="billing-legal-name" name="legalName" label={t("billingLegalName")} defaultValue={initial?.legalName} required minLength={2} maxLength={200} autoComplete="organization" />
        <SelectField id="billing-country" name="country" label={t("billingCountry")} defaultValue={initial?.country ?? "ES"} required>
          {countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
        </SelectField>
        <Field id="billing-tax-id" name="taxId" label={t("billingTaxId")} hint={t("billingTaxIdHint")} defaultValue={initial?.taxId} required minLength={3} maxLength={40} />
        <Field id="billing-email" name="billingEmail" type="email" label={t("billingEmail")} defaultValue={initial?.billingEmail} required maxLength={254} autoComplete="email" />
        <Field id="billing-address-1" name="addressLine1" label={t("billingAddress1")} defaultValue={initial?.addressLine1} required minLength={2} maxLength={200} autoComplete="address-line1" />
        <Field id="billing-address-2" name="addressLine2" label={t("billingAddress2")} defaultValue={initial?.addressLine2 ?? ""} maxLength={200} autoComplete="address-line2" />
        <Field id="billing-postal-code" name="postalCode" label={t("billingPostalCode")} defaultValue={initial?.postalCode} required minLength={2} maxLength={20} autoComplete="postal-code" />
        <Field id="billing-city" name="city" label={t("billingCity")} defaultValue={initial?.city} required maxLength={100} autoComplete="address-level2" />
        <Field id="billing-region" name="region" label={t("billingRegion")} defaultValue={initial?.region ?? ""} maxLength={100} autoComplete="address-level1" />
      </div>
      <Check name="business" required label={t("billingBusinessDeclaration")} defaultChecked={Boolean(initial)} />
      {error && <Status error>{error}</Status>}
      <div className="p-toolbar">
        <Action type="submit" disabled={busy}>{busy ? t("billingSaving") : t("billingSaveDetails")}</Action>
        {onCancel && <Action variant="ghost" onClick={onCancel} disabled={busy}>{t("cancel")}</Action>}
      </div>
    </form>
  );
}

export function BillingTopUp({ allowedOrgIds }: { allowedOrgIds: string[] }) {
  const { orgId } = useWorkspace();
  const allowed = allowedOrgIds.includes(orgId);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pack, setPack] = useState<string>("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<"" | "pay" | "portal">("");
  const key = useRef<{ pack: string; value: string } | null>(null);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    evalRequest<Overview>(`/billing/packs?orgId=${orgId}&locale=${getLocale()}`).then(data => {
      if (!active) return;
      setOverview(data);
      setPack(current => current || data.packs.find(item => !item.blocked)?.id || "");
      setError(null);
    }, (caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : t("error")); });
    return () => { active = false; };
  }, [allowed, orgId, version]);

  if (!allowed) return <EmptyState title={t("billingUnavailable")} />;
  if (!overview) return error ? <Status error action={<Action variant="secondary" size="sm" onClick={() => void load()}>{t("retry")}</Action>}>{error}</Status> : <Loading>{t("billingLoading")}</Loading>;

  const profile = overview.profile;
  const selected = overview.packs.find(item => item.id === pack);
  const canPay = Boolean(profile?.taxTreatment && selected && !selected.blocked && accepted && !overview.balance?.frozen && !busy);

  async function pay() {
    if (!selected) return;
    // One key per selected pack, reused on retries so a double click or a retry opens the same Checkout.
    if (key.current?.pack !== selected.id) key.current = { pack: selected.id, value: newKey() };
    setBusy("pay"); setError(null);
    try {
      const result = await evalRequest<{ checkoutUrl: string | null; order: { id: string } }>("/billing/top-ups", "POST",
        { orgId, pack: selected.id, acceptTerms: true, locale: getLocale() }, key.current.value);
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      else window.location.assign(`/workspace/billing/top-ups/${result.order.id}?orgId=${orgId}`);
    } catch (caught) {
      key.current = null;
      setError(caught instanceof Error ? caught.message : t("error"));
      setBusy("");
    }
  }
  async function portal() {
    setBusy("portal"); setError(null);
    try {
      const result = await evalRequest<{ url: string }>("/billing/portal", "POST", { orgId, locale: getLocale() }, newKey());
      window.location.assign(result.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("error")); setBusy(""); }
  }

  return (
    <>
      <PageHeading title={t("billingTopUpTitle")} meta={overview.mode === "test" ? <Badge tone="warn" dot>{t("billingTestMode")}</Badge> : undefined}>
        {t("billingTopUpIntro")}
      </PageHeading>
      {overview.balance && (
        <p className="p-cell-meta">{t("billingBalance")}: <strong>{count(overview.balance.availableCredits)}</strong></p>
      )}
      {overview.balance?.frozen && <Status error>{t("billingFrozen")}</Status>}
      {saved && <Status tone="success">{t("billingDetailsSaved")}</Status>}
      <Section title={t("billingDetailsTitle")} description={t("billingDetailsHelp")}
        actions={profile && !editing ? <Action variant="secondary" size="sm" onClick={() => { setEditing(true); setSaved(false); }}>{t("billingEditDetails")}</Action> : undefined}>
        {!profile || editing ? (
          <ProfileForm orgId={orgId} initial={profile} onCancel={profile ? () => setEditing(false) : undefined}
            onSaved={() => { setEditing(false); setSaved(true); void load(); }} />
        ) : (
          <Card>
            <div className="p-stack">
            <p><strong>{profile.legalName}</strong> · {profile.taxId} · {countryName(profile.country)}</p>
            <p className="p-cell-meta">{[profile.addressLine1, profile.addressLine2, `${profile.postalCode} ${profile.city}`, profile.region].filter(Boolean).join(", ")} · {profile.billingEmail}</p>
            <Status tone={profile.taxTreatment ? "info" : "warn"}>{treatmentText(profile)}</Status>
            </div>
          </Card>
        )}
      </Section>
      {profile?.taxTreatment && (
        <Section title={t("billingPacksTitle")} actions={overview.firstTopUp ? <Badge tone="pass">{t("billingFirstTopUp")}</Badge> : undefined}>
          <div className="p-stack">
          <div className="p-choice-grid" role="radiogroup" aria-label={t("billingPacksTitle")}>
            {overview.packs.map(item => (
              <label key={item.id} className="p-choice" data-disabled={item.blocked ? "true" : undefined}>
                <input type="radio" name="pack" value={item.id} checked={pack === item.id} disabled={Boolean(item.blocked)} onChange={() => setPack(item.id)} />
                <span className="p-choice-title">{tv("billingPackCredits", { credits: count(item.credits) })}</span>
                {item.bonusCredits > 0 && <span className="p-choice-desc">{tv("billingPackBonus", { bonus: count(item.bonusCredits) })}</span>}
                <span className="p-choice-desc">{tv("billingPackNet", { net: euros(item.netCents) })}</span>
                {item.grossCents !== null && <span className="p-choice-desc">{tv("billingPackTotal", { gross: euros(item.grossCents) })}</span>}
                {item.blocked && <span className="p-choice-desc">{t(item.blocked === "PURCHASE_LIMIT" ? "billingPackLimit" : "billingPackRate")}</span>}
              </label>
            ))}
          </div>
          <Check checked={accepted} onChange={event => setAccepted(event.currentTarget.checked)}
            label={<>{t("billingAcceptPrefix")} <a className="p-link" href={overview.legal.termsUrl} target="_blank" rel="noreferrer">{t("billingTermsLink")}</a> {t("billingAnd")} <a className="p-link" href={overview.legal.privacyUrl} target="_blank" rel="noreferrer">{t("billingPrivacyLink")}</a>.</>} />
          {error && <Status error>{error}</Status>}
          <div className="p-toolbar">
            <Action onClick={() => void pay()} disabled={!canPay} data-testid="billing-pay">{busy === "pay" ? t("billingRedirecting") : t("billingPay")}</Action>
          </div>
          <p className="p-cell-meta">{t("billingPaymentNote")}</p>
          </div>
        </Section>
      )}
      {profile && (
        <Section title={t("billingCardTitle")}
          actions={overview.card ? <Action variant="secondary" size="sm" onClick={() => void portal()} disabled={Boolean(busy)}>{t("billingManageCards")}</Action> : undefined}>
          <p className="p-cell-meta">{overview.card?.last4 ? tv("billingCardSaved", { brand: (overview.card.brand ?? "card").replace(/^./, c => c.toUpperCase()), last4: overview.card.last4 }) : t("billingNoCard")}</p>
        </Section>
      )}
    </>
  );
}

const TERMINAL = new Set(["paid", "failed", "canceled", "expired", "refund_pending", "refunded", "disputed", "charged_back"]);

/** The page Stripe returns to: follows the order until it is paid, or explains why not. */
export function TopUpReturn({ orderId, orgId, checkout }: { orderId: string; orgId: string; checkout: "success" | "canceled" | null }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const started = Date.now();
    async function tick() {
      try {
        const next = checkout === "canceled"
          ? await evalRequest<Order>(`/billing/top-ups/${orderId}`, "POST", { orgId, action: "cancel" }, `cancel:${orderId}`)
          : await evalRequest<Order>(`/billing/top-ups/${orderId}?orgId=${orgId}`);
        if (stopped) return;
        setOrder(next);
        setError(null);
        if (TERMINAL.has(next.status)) return;
      } catch (caught) {
        if (stopped) return;
        setError(caught instanceof Error ? caught.message : t("error"));
      }
      if (Date.now() - started > 60_000) setSlow(true);
      if (Date.now() - started < 10 * 60_000) timer = window.setTimeout(() => void tick(), Date.now() - started > 60_000 ? 10_000 : 2_000);
    }
    void tick();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [orderId, orgId, checkout]);

  const back = <ActionLink href={`/workspace/billing/top-up?orgId=${orgId}`} variant="secondary">{t("billingBuyAgain")}</ActionLink>;
  let body;
  if (!order) body = error ? <Status error>{error}</Status> : <Loading>{t("billingConfirming")}</Loading>;
  else if (order.status === "paid") {
    body = (
      <>
        <Status tone="success">{order.bonusCredits > 0
          ? tv("billingPaidBonus", { credits: count(order.credits), bonus: count(order.bonusCredits) })
          : tv("billingPaid", { credits: count(order.credits) })}</Status>
        <p>{t("billingTotalPaid")}: <strong>{euros(order.grossCents)}</strong>{order.taxMention ? ` · ${order.taxMention}` : ""}</p>
        <p className="p-cell-meta">{t("billingReceiptNote")}</p>
        <div className="p-toolbar"><ActionLink href={`/workspace/evaluations?orgId=${orgId}`}>{t("billingOpenEvaluations")}</ActionLink></div>
      </>
    );
  } else if (order.status === "pending" && checkout !== "canceled") {
    body = <>{slow ? <Status tone="info">{t("billingSlow")}</Status> : <Loading>{t("billingConfirming")}</Loading>}{error && <Status error>{error}</Status>}</>;
  } else {
    const message = order.status === "canceled" || order.status === "pending" ? "billingCanceled" : order.status === "expired" ? "billingExpired"
      : order.status === "failed" ? "billingFailedPayment" : order.status === "disputed" || order.status === "charged_back" ? "billingDisputed" : "billingRefunded";
    body = <><Status tone={order.status === "disputed" || order.status === "charged_back" ? "error" : "info"}>{t(message)}</Status><div className="p-toolbar">{back}</div></>;
  }
  return (
    <>
      <PageHeading title={t("billingReturnTitle")} />
      <div role="region" aria-live="polite" data-testid="top-up-status">{body}</div>
    </>
  );
}
