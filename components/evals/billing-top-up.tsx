"use client";

/**
 * Buying credits (launch L-12, spec §6.6, §6.12, §6.14): billing details with
 * the VIES check, packs with the VAT preview and the first top-up bonus,
 * Terms and Privacy acceptance, and the redirect to Stripe Checkout; plus the
 * return page that follows the order until Stripe confirms it. Card data
 * never reaches this page: Checkout and the Customer Portal are hosted by
 * Stripe.
 *
 * Launch L-15 reuses the parts: the Top up tab of Settings → Billing and
 * usage, and `TopUpDialog`, the one-step top-up from the run estimate dialog
 * and from a run paused for credits. Before leaving for Checkout the page
 * remembers where the buyer came from (per order, in session storage), so
 * the return page can send them back once the credits arrive.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { evalRequest } from "./api";
import { Action, ActionLink, Badge, Card, Check, EmptyState, Field, Loading, PageHeading, Section, SelectField, Status } from "./primitives";
import { Modal } from "./overlays";
import { announceBillingChanged, formatCredits, useBilling } from "./billing-state";
import { useWorkspace } from "./workspace-context";
import { getLocale, t, tv } from "@/lib/evals/messages/runtime";

type Treatment = "es_vat" | "eu_reverse_charge" | "non_eu_not_subject";
export type Profile = {
  legalName: string; country: string; taxId: string; taxIdKind: string; viesStatus: string; taxTreatment: Treatment | null;
  taxReviewReason: "vies_unavailable" | "es_special_territory" | null; addressLine1: string; addressLine2: string | null; postalCode: string;
  city: string; region: string | null; billingEmail: string;
};
export type Pack = { id: string; netCents: number; vatCents: number | null; grossCents: number | null; credits: number; bonusCredits: number; bonusKind: string | null; blocked: string | null };
export type Overview = {
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
export function countryLabel(code: string) {
  return countryName(code);
}
export function treatmentText(profile: Profile) {
  if (profile.taxReviewReason === "es_special_territory") return t("billingTreatmentReviewTerritory");
  if (!profile.taxTreatment) return t("billingTreatmentReviewVies");
  return t(profile.taxTreatment === "es_vat" ? "billingTreatmentEsVat" : profile.taxTreatment === "eu_reverse_charge" ? "billingTreatmentReverse" : "billingTreatmentNotSubject");
}

export function ProfileForm({ orgId, initial, onSaved, onCancel }: { orgId: string; initial: Profile | null; onSaved: (profile: Profile) => void; onCancel?: () => void }) {
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

/** GET /billing/packs for a workspace (owners, where payments are open). */
export function usePacks(orgId: string, enabled = true) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    if (!enabled || !orgId) return;
    let active = true;
    evalRequest<Overview>(`/billing/packs?orgId=${encodeURIComponent(orgId)}&locale=${getLocale()}`).then(data => {
      if (!active) return;
      setOverview(data);
      setError(null);
    }, (caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : t("error")); });
    return () => { active = false; };
  }, [enabled, orgId, version]);
  return { overview, error, reload };
}

const subscribeNever = () => () => undefined;
/** Where the return page sends the buyer back to, per order (session storage, best effort). */
const RETURN_KEY = (orderId: string) => `caudals.topup.return.${orderId}`;
function rememberReturn(orderId: string, path: string | null) {
  if (!path) return;
  try { window.sessionStorage.setItem(RETURN_KEY(orderId), path); } catch { /* best effort */ }
}
function rememberedReturn(orderId: string): string | null {
  try {
    const value = window.sessionStorage.getItem(RETURN_KEY(orderId));
    // Only paths inside the app.
    return value && value.startsWith("/workspace/") ? value : null;
  } catch { return null; }
}

/** The smallest pack that covers `credits` (with its bonus), or the largest. */
export function packFor(packs: Pack[], credits: number): Pack | null {
  const open = packs.filter(item => !item.blocked);
  return open.find(item => item.credits + item.bonusCredits >= credits) ?? open.at(-1) ?? null;
}

/**
 * Packs with the VAT preview and bonus, the Terms and Privacy acceptance and
 * the redirect to Stripe Checkout. `returnTo` is where the return page offers
 * to go back to once the credits arrive.
 */
export function PackPurchase({ orgId, overview, preselect = null, returnTo = null, compact = false }: {
  orgId: string; overview: Overview; preselect?: string | null; returnTo?: string | null; compact?: boolean;
}) {
  const [pack, setPack] = useState<string>(() => preselect ?? overview.packs.find(item => !item.blocked)?.id ?? "");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<{ pack: string; value: string } | null>(null);
  const selected = overview.packs.find(item => item.id === pack);
  const canPay = Boolean(overview.profile?.taxTreatment && selected && !selected.blocked && accepted && !overview.balance?.frozen && !busy);

  async function pay() {
    if (!selected) return;
    // One key per selected pack, reused on retries so a double click or a retry opens the same Checkout.
    if (key.current?.pack !== selected.id) key.current = { pack: selected.id, value: newKey() };
    setBusy(true); setError(null);
    try {
      const result = await evalRequest<{ checkoutUrl: string | null; order: { id: string } }>("/billing/top-ups", "POST",
        { orgId, pack: selected.id, acceptTerms: true, locale: getLocale() }, key.current.value);
      rememberReturn(result.order.id, returnTo);
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      else window.location.assign(`/workspace/billing/top-ups/${result.order.id}?orgId=${orgId}`);
    } catch (caught) {
      key.current = null;
      setError(caught instanceof Error ? caught.message : t("error"));
      setBusy(false);
    }
  }

  return (
    <div className="p-stack">
      <div className="p-choice-grid" role="radiogroup" aria-label={t("billingPacksTitle")} data-compact={compact ? "true" : undefined}>
        {overview.packs.map(item => (
          <label key={item.id} className="p-choice" data-disabled={item.blocked ? "true" : undefined}>
            <input type="radio" name={`pack-${orgId}`} value={item.id} checked={pack === item.id} disabled={Boolean(item.blocked)} onChange={() => setPack(item.id)} />
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
      {overview.balance?.frozen && <Status error>{t("billingFrozen")}</Status>}
      {error && <Status error>{error}</Status>}
      <div className="p-toolbar">
        <Action onClick={() => void pay()} disabled={!canPay} data-testid="billing-pay">{busy ? t("billingRedirecting") : t("billingPay")}</Action>
      </div>
      <p className="p-cell-meta">{t("billingPaymentNote")}</p>
    </div>
  );
}

/** Billing details shown as a card, or the form to add or edit them. */
export function ProfileSection({ orgId, profile, onSaved }: { orgId: string; profile: Profile | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <Section title={t("billingDetailsTitle")} description={t("billingDetailsHelp")}
      actions={profile && !editing ? <Action variant="secondary" size="sm" onClick={() => { setEditing(true); setSaved(false); }}>{t("billingEditDetails")}</Action> : undefined}>
      {saved && <Status tone="success">{t("billingDetailsSaved")}</Status>}
      {!profile || editing ? (
        <ProfileForm orgId={orgId} initial={profile} onCancel={profile ? () => setEditing(false) : undefined}
          onSaved={() => { setEditing(false); setSaved(true); onSaved(); }} />
      ) : (
        <Card>
          <div className="p-stack">
            <p><strong>{profile.legalName}</strong> · {profile.taxId} · {countryName(profile.country)}</p>
            <p className="p-cell-meta">{[profile.addressLine1, profile.addressLine2, `${profile.postalCode} ${profile.city}`, profile.region].filter(Boolean).join(", ")} · {profile.billingEmail}</p>
            {profile.taxIdKind === "eu_vat" && (
              <p className="p-cell-meta">{t("billingVies")}: <Badge tone={profile.viesStatus === "valid" ? "pass" : profile.viesStatus === "invalid" ? "fail" : "warn"} dot>
                {t(profile.viesStatus === "valid" ? "billingViesValid" : profile.viesStatus === "invalid" ? "billingViesInvalid" : "billingViesUnavailable")}
              </Badge></p>
            )}
            <Status tone={profile.taxTreatment ? "info" : "warn"}>{treatmentText(profile)}</Status>
          </div>
        </Card>
      )}
    </Section>
  );
}

/** The saved card and the Stripe Customer Portal (payment methods only). */
export function PaymentMethod({ orgId, card }: { orgId: string; card: { brand: string | null; last4: string | null } | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function portal() {
    setBusy(true); setError(null);
    try {
      const result = await evalRequest<{ url: string }>("/billing/portal", "POST", { orgId, locale: getLocale() }, newKey());
      window.location.assign(result.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("error")); setBusy(false); }
  }
  return (
    <Section title={t("billingCardTitle")}
      actions={card ? <Action variant="secondary" size="sm" onClick={() => void portal()} disabled={busy}>{t("billingManageCards")}</Action> : undefined}>
      <p className="p-cell-meta">{card?.last4 ? tv("billingCardSaved", { brand: (card.brand ?? "card").replace(/^./, c => c.toUpperCase()), last4: card.last4 }) : t("billingNoCard")}</p>
      {error && <Status error>{error}</Status>}
    </Section>
  );
}

export function BillingTopUp({ allowedOrgIds }: { allowedOrgIds: string[] }) {
  const { orgId } = useWorkspace();
  const allowed = allowedOrgIds.includes(orgId);
  const { overview, error, reload } = usePacks(orgId, allowed);

  if (!allowed) return <EmptyState title={t("billingUnavailable")} />;
  if (!overview) return error ? <Status error action={<Action variant="secondary" size="sm" onClick={() => reload()}>{t("retry")}</Action>}>{error}</Status> : <Loading>{t("billingLoading")}</Loading>;

  const profile = overview.profile;
  return (
    <>
      <PageHeading title={t("billingTopUpTitle")} meta={overview.mode === "test" ? <Badge tone="warn" dot>{t("billingTestMode")}</Badge> : undefined}>
        {t("billingTopUpIntro")}
      </PageHeading>
      {overview.balance && (
        <p className="p-cell-meta">{t("billingBalance")}: <strong>{count(overview.balance.availableCredits)}</strong></p>
      )}
      {overview.balance?.frozen && <Status error>{t("billingFrozen")}</Status>}
      <ProfileSection orgId={orgId} profile={profile} onSaved={reload} />
      {profile?.taxTreatment && (
        <Section title={t("billingPacksTitle")} actions={overview.firstTopUp ? <Badge tone="pass">{t("billingFirstTopUp")}</Badge> : undefined}>
          <PackPurchase orgId={orgId} overview={overview} />
        </Section>
      )}
      {profile && <PaymentMethod orgId={orgId} card={overview.card} />}
    </>
  );
}

/**
 * One-step top-up in a dialog (launch L-15): from the run estimate dialog
 * ("Add X credits") and from a run paused for credits. Preselects the smallest
 * pack that covers `minCredits`; asks for billing details first when missing.
 */
export function TopUpDialog({ orgId, open, onClose, minCredits = 0, returnTo = null }: {
  orgId: string; open: boolean; onClose: () => void; minCredits?: number; returnTo?: string | null;
}) {
  const { overview, error, reload } = usePacks(orgId, open);
  const preselect = overview ? packFor(overview.packs, minCredits)?.id ?? null : null;
  return (
    <Modal open={open} onOpenChange={value => { if (!value) onClose(); }} size="lg" title={t("billingTopUpTitle")}
      description={minCredits > 0 ? tv("billingDialogNeed", { credits: count(minCredits) }) : t("billingTopUpIntro")}>
      {!overview ? (
        error ? <Status error action={<Action variant="secondary" size="sm" onClick={() => reload()}>{t("retry")}</Action>}>{error}</Status> : <Loading>{t("billingLoading")}</Loading>
      ) : !overview.profile?.taxTreatment ? (
        <div className="p-stack">
          {overview.profile && <Status tone="warn">{treatmentText(overview.profile)}</Status>}
          <p className="p-cell-meta">{t("billingDetailsFirst")}</p>
          <ProfileForm orgId={orgId} initial={overview.profile} onSaved={() => reload()} />
        </div>
      ) : (
        <div className="p-stack">
          {overview.mode === "test" && <Badge tone="warn" dot>{t("billingTestMode")}</Badge>}
          {overview.firstTopUp && <Badge tone="pass">{t("billingFirstTopUp")}</Badge>}
          <PackPurchase key={preselect ?? "none"} orgId={orgId} overview={overview} preselect={preselect} returnTo={returnTo} compact />
        </div>
      )}
    </Modal>
  );
}

const TERMINAL = new Set(["paid", "failed", "canceled", "expired", "refund_pending", "refunded", "disputed", "charged_back"]);

/** The page Stripe returns to: follows the order until it is paid, or explains why not. */
export function TopUpReturn({ orderId, orgId, checkout }: { orderId: string; orgId: string; checkout: "success" | "canceled" | null }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const { summary } = useBilling();
  // Session storage is device state, absent on the server: read it as an external store.
  const back = useSyncExternalStore(subscribeNever, () => rememberedReturn(orderId), () => null);

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
        if (TERMINAL.has(next.status)) {
          // The balance everywhere in the shell (sidebar, banner, Billing) updates now.
          if (next.status === "paid") announceBillingChanged();
          return;
        }
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

  const billingHref = `/workspace/settings?orgId=${orgId}&tab=billing`;
  const again = <ActionLink href={summary ? `${billingHref}&view=top-up` : `/workspace/billing/top-up?orgId=${orgId}`} variant="secondary">{t("billingBuyAgain")}</ActionLink>;
  let body;
  if (!order) body = error ? <Status error>{error}</Status> : <Loading>{t("billingConfirming")}</Loading>;
  else if (order.status === "paid") {
    body = (
      <>
        <Status tone="success">{order.bonusCredits > 0
          ? tv("billingPaidBonus", { credits: count(order.credits), bonus: count(order.bonusCredits) })
          : tv("billingPaid", { credits: count(order.credits) })}</Status>
        <p>{t("billingTotalPaid")}: <strong>{euros(order.grossCents)}</strong>{order.taxMention ? ` · ${order.taxMention}` : ""}</p>
        {summary && <p data-testid="top-up-balance">{t("billingBalance")}: <strong>{formatCredits(summary.balance.availableUcr)}</strong></p>}
        {back && <p className="p-cell-meta">{t("billingResumeNote")}</p>}
        <p className="p-cell-meta">{t("billingReceiptNote")}</p>
        <div className="p-toolbar">
          {back && <ActionLink href={back}>{t("billingContinue")}</ActionLink>}
          <ActionLink variant={back ? "secondary" : "primary"} href={summary ? billingHref : `/workspace/evaluations?orgId=${orgId}`}>{summary ? t("billingOpenBilling") : t("billingOpenEvaluations")}</ActionLink>
        </div>
      </>
    );
  } else if (order.status === "pending" && checkout !== "canceled") {
    body = <>{slow ? <Status tone="info">{t("billingSlow")}</Status> : <Loading>{t("billingConfirming")}</Loading>}{error && <Status error>{error}</Status>}</>;
  } else {
    const message = order.status === "canceled" || order.status === "pending" ? "billingCanceled" : order.status === "expired" ? "billingExpired"
      : order.status === "failed" ? "billingFailedPayment" : order.status === "disputed" || order.status === "charged_back" ? "billingDisputed" : "billingRefunded";
    body = <><Status tone={order.status === "disputed" || order.status === "charged_back" ? "error" : "info"}>{t(message)}</Status><div className="p-toolbar">{back && <ActionLink href={back} variant="secondary">{t("billingGoBack")}</ActionLink>}{again}</div></>;
  }
  return (
    <>
      <PageHeading title={t("billingReturnTitle")} />
      <div role="region" aria-live="polite" aria-label={t("billingReturnTitle")} data-testid="top-up-status">{body}</div>
    </>
  );
}
