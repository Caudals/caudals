"use client";

/**
 * Partner dashboard (launch L-28, spec P-52): one page for an agency or
 * integrator. Its client workspaces with their activity (each opens as an
 * ordinary workspace), referral links, referred accounts and their
 * first-year revenue (empty until they pay, never an invented zero), the
 * agreement's allowance, the monthly statement and the report logo. Partner
 * admins create clients, links and the logo; members read. Everything is
 * checked again by the API and the database.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Copy, Download, ImageUp, Link2, Plus, Trash2, Users } from "lucide-react";
import { getLocale } from "@/lib/evals/messages/runtime";
import { partnerCopy } from "@/lib/evals/partners/copy";
import type { PartnerOverview } from "@/lib/evals/partners/repository";
import { evalRequest, EvalRequestError } from "./api";
import { Modal, notify } from "./overlays";
import {
  Action, ActionAnchor, ActionLink, Badge, DataTable, DefinitionList, EmptyState, Field, Loading, PageHeading, Section,
  SelectField, Stat, StatGrid, Status, Time, formatDate,
} from "./primitives";

type Overview = PartnerOverview;
type Copy = ReturnType<typeof partnerCopy>;

function useMoney(locale: "en" | "es") {
  const euro = new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", { style: "currency", currency: "EUR" });
  const number = new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", { maximumFractionDigits: 2 });
  return {
    euros: (cents: number | null | undefined) => (cents == null ? null : euro.format(cents / 100)),
    credits: (value: number | null | undefined) => (value == null ? null : number.format(value)),
    percent: (value: number | null | undefined) => (value == null ? null : `${Math.round(value * 100)} %`),
  };
}

function errorText(error: unknown, copy: Copy) {
  if (error instanceof EvalRequestError) {
    if (error.code === "PARTNER_CLIENT_LIMIT") return copy.t("errorClientLimit");
    if (error.code === "PARTNER_CODE_LIMIT") return copy.t("errorCodeLimit");
    if (error.code === "PARTNER_INACTIVE" || error.code === "PARTNER_CLOSED") return copy.t("errorInactive");
    if (error.code === "REASON_REQUIRED") return copy.t("errorReason");
    if (error.code === "LOGO_TOO_LARGE") return copy.t("logoTooLarge");
    if (error.code === "LOGO_TYPE" || error.code === "LOGO_EMPTY") return copy.t("logoType");
    if (error.code === "LOGO_DIMENSIONS") return copy.t("logoDimensions");
  }
  return error instanceof Error ? error.message : copy.t("loadFailed");
}

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export function PartnerDashboard({ partnerId, partners }: { partnerId: string; partners: Array<{ id: string; name: string }> }) {
  const locale = getLocale();
  const copy = partnerCopy(locale);
  const { t, tv } = copy;
  const money = useMoney(locale);
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    try {
      setData(await evalRequest<Overview>(`/partners/${partnerId}`));
      setFailure(null);
    } catch (error) {
      setFailure(errorText(error, copy));
    }
    // copy depends only on the page's locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);
  useEffect(() => { void load(); }, [load]);

  if (failure && !data) return <Status error action={<Action variant="secondary" size="sm" onClick={() => void load()}>{t("retry")}</Action>}>{failure}</Status>;
  if (!data) return <Loading />;

  const admin = data.role === "admin" || data.platformAdmin;
  const paying = data.referrals.filter((row) => row.revenueNetCents != null).length;
  const shareCredits = data.revenue.shareCents == null ? null : Math.round(data.revenue.shareCents);
  const statusLabel = data.partner.status === "active" ? t("statusActive") : data.partner.status === "suspended" ? t("statusSuspended") : t("statusClosed");

  return (
    <>
      <PageHeading
        title={data.partner.name}
        meta={<>
          <Badge>{t("title")}</Badge>
          {data.role && <Badge>{data.role === "admin" ? t("roleAdmin") : t("roleMember")}</Badge>}
          {data.partner.status !== "active" && <Badge tone="warn">{statusLabel}</Badge>}
        </>}
        actions={partners.length > 1 ? (
          <SelectField id="partner-switch" label={t("switchPartner")} value={partnerId} onChange={(event) => router.push(`/partner?id=${encodeURIComponent(event.target.value)}`)}>
            {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
          </SelectField>
        ) : undefined}
      >
        {t("intro")}
      </PageHeading>
      {failure && <Status error>{failure}</Status>}
      {!data.livemode && <Status tone="info">{t("testMode")}</Status>}

      <StatGrid>
        <Stat label={t("statClients")} value={data.clients.length} meta={tv("statClientsMeta", { max: data.partner.maxClients })} />
        <Stat label={t("statReferred")} value={data.referrals.length} meta={tv("statReferredMeta", { paid: paying })} />
        <Stat label={t("statRevenue")} value={money.euros(data.revenue.netCents) ?? t("none")} meta={t("statRevenueMeta")} />
        <Stat label={t("statShare")} value={money.euros(data.revenue.shareCents) ?? t("none")}
          meta={tv("statShareMeta", { rate: data.partner.revenueShareBps / 100, credits: shareCredits == null ? t("none") : money.credits(shareCredits) ?? t("none") })} />
        <Stat label={t("statAllowance")} value={data.allowance ? money.credits(data.allowance.remainingCredits) : t("none")}
          meta={data.allowance ? tv("statAllowanceMeta", { granted: money.credits(data.allowance.grantedCredits) ?? "0", monthly: money.credits(data.allowance.monthlyCredits) ?? "0" }) : undefined} />
      </StatGrid>

      <Clients data={data} admin={admin} copy={copy} money={money} onCreated={async () => { router.refresh(); await load(); }} partnerId={partnerId} />
      <ReferralLinks data={data} admin={admin} copy={copy} partnerId={partnerId} onChange={load} />
      <Referred data={data} copy={copy} money={money} />
      <Allowance data={data} copy={copy} money={money} />

      <Section title={t("statementTitle")} description={t("statementIntro")}>
        <div className="p-row p-partner-statement">
          <Field id="statement-month" type="month" label={t("statementMonth")} value={month} max={new Date().toISOString().slice(0, 7)} onChange={(event) => setMonth(event.target.value)} />
          <ActionAnchor variant="secondary" href={`/api/evals/v1/partners/${partnerId}/statement?month=${encodeURIComponent(month)}&mode=${data.livemode ? "live" : "test"}`} download>
            <Download aria-hidden="true" />
            {t("download")}
          </ActionAnchor>
        </div>
      </Section>

      <Branding data={data} admin={admin} copy={copy} partnerId={partnerId} onChange={load} />

      <Section title={t("peopleTitle")} description={t("peopleIntro")}>
        <DataTable caption={t("peopleTitle")} headers={[t("colName"), t("colEmail"), t("colRole")]}>
          {data.members.map((member) => (
            <tr key={member.userId}>
              <th scope="row">{member.name}</th>
              <td className="p-cell-meta">{member.email}</td>
              <td>{member.role === "admin" ? t("roleAdmin") : t("roleMember")}</td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </>
  );
}

type Money = ReturnType<typeof useMoney>;

function Clients({ data, admin, copy, money, onCreated, partnerId }: { data: Overview; admin: boolean; copy: Copy; money: Money; onCreated: () => Promise<void>; partnerId: string }) {
  const { t, tv } = copy;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const keys = useRef(new Map<string, string>());
  async function create(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    let key = keys.current.get(value);
    if (!key) { key = crypto.randomUUID(); keys.current.set(value, key); }
    setPending(true);
    setError("");
    try {
      const created = await evalRequest<{ orgId: string; name: string }>(`/partners/${partnerId}/clients`, "POST", { name: value }, key);
      keys.current.delete(value);
      setName("");
      setOpen(false);
      notify(`${t("clientCreated")} ${created.name}`);
      await onCreated();
    } catch (reason) {
      setError(errorText(reason, copy));
    } finally {
      setPending(false);
    }
  }
  const atLimit = data.clients.length >= data.partner.maxClients;
  return (
    <Section
      title={t("clientsTitle")}
      description={t("clientsIntro")}
      actions={admin && data.clients.length > 0 ? (
        <Action onClick={() => { setError(""); setOpen(true); }} disabled={atLimit || data.partner.status !== "active"}>
          <Plus aria-hidden="true" />
          {t("newClient")}
        </Action>
      ) : undefined}
    >
      {data.clients.length === 0 ? (
        <EmptyState title={t("noClients")} icon={<Users />} action={admin ? <Action onClick={() => setOpen(true)} disabled={data.partner.status !== "active"}><Plus aria-hidden="true" />{t("newClient")}</Action> : undefined}>
          <p>{admin ? t("noClientsBody") : t("noClientsMember")}</p>
        </EmptyState>
      ) : (
        <DataTable caption={t("clientsTitle")} headers={[t("colClient"), t("colAccess"), { label: t("colActivity"), align: "end" }, { label: t("colEvaluations"), align: "end" }, { label: t("colRuns"), align: "end" }, { label: t("colScore"), align: "end" }, { label: t("colCredits"), align: "end" }, { label: t("open"), align: "end", hidden: true }]}>
          {data.clients.map((client) => (
            <tr key={client.orgId}>
              <th scope="row">
                <span className="p-table-primary">
                  <span>{client.name}</span>
                </span>
              </th>
              <td className="p-cell-nowrap">{client.access === "manage" ? t("accessManage") : t("accessWork")}</td>
              <td className="p-table-action p-cell-meta"><Time value={client.lastActivity} /></td>
              <td className="p-num">{client.evaluations}</td>
              <td className="p-num">{client.runsThisMonth}</td>
              <td className="p-num">{money.percent(client.latestScore) ?? t("none")}</td>
              <td className="p-num">{money.credits(client.availableCredits) ?? t("none")}{client.usedThisMonthCredits > 0 && <span className="p-cell-meta"> · {money.credits(client.usedThisMonthCredits)} {t("colUsed").toLowerCase()}</span>}</td>
              <td className="p-table-action">
                {client.myRole ? (
                  <ActionLink variant="ghost" size="sm" href={`/workspace/evaluations?orgId=${encodeURIComponent(client.orgId)}`} aria-label={tv("openClient", { name: client.name })}>
                    {t("open")}
                    <ArrowRight aria-hidden="true" />
                  </ActionLink>
                ) : <span className="p-cell-meta">{t("none")}</span>}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      <Modal open={open} onOpenChange={setOpen} title={t("newClient")} description={t("newClientHelp")} size="sm"
        footer={<>
          <Action variant="secondary" onClick={() => setOpen(false)}>{t("cancel")}</Action>
          <Action type="submit" form="partner-client-form" disabled={pending || !name.trim()}>{pending ? t("creating") : t("create")}</Action>
        </>}
      >
        <form id="partner-client-form" onSubmit={create} className="p-stack">
          {error && <Status error>{error}</Status>}
          <Field id="partner-client-name" label={t("clientName")} value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required autoFocus />
        </form>
      </Modal>
    </Section>
  );
}

function ReferralLinks({ data, admin, copy, partnerId, onChange }: { data: Overview; admin: boolean; copy: Copy; partnerId: string; onChange: () => Promise<void> }) {
  const { t } = copy;
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [revoking, setRevoking] = useState<{ id: string; code: string } | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const createKey = useRef<string | null>(null);
  async function create(event: FormEvent) {
    event.preventDefault();
    createKey.current ??= crypto.randomUUID();
    setPending(true);
    setError("");
    try {
      await evalRequest(`/partners/${partnerId}/codes`, "POST", label.trim() ? { label: label.trim() } : {}, createKey.current);
      createKey.current = null;
      setLabel("");
      setCreating(false);
      notify(t("codeCreated"));
      await onChange();
    } catch (reason) {
      setError(errorText(reason, copy));
    } finally {
      setPending(false);
    }
  }
  async function revoke(event: FormEvent) {
    event.preventDefault();
    if (!revoking) return;
    setPending(true);
    setError("");
    try {
      await evalRequest(`/partners/${partnerId}/codes`, "DELETE", { codeId: revoking.id, reason: reason.trim() });
      setRevoking(null);
      setReason("");
      notify(t("codeRevoked"));
      await onChange();
    } catch (reason) {
      setError(errorText(reason, copy));
    } finally {
      setPending(false);
    }
  }
  const copyLink = async (value: string) => {
    try { await navigator.clipboard.writeText(value); notify(t("copied")); } catch { /* clipboard unavailable: the link is visible to copy by hand */ }
  };
  const live = data.codes.filter((code) => !code.revokedAt);
  return (
    <Section title={t("referralTitle")} description={t("referralIntro")}
      actions={admin && data.codes.length > 0 ? <Action variant="secondary" onClick={() => { setError(""); setCreating(true); }} disabled={live.length >= 20 || data.partner.status !== "active"}><Link2 aria-hidden="true" />{t("newCode")}</Action> : undefined}>
      {data.codes.length === 0 ? (
        <EmptyState title={t("noCodes")} icon={<Link2 />} action={admin ? <Action onClick={() => setCreating(true)} disabled={data.partner.status !== "active"}><Plus aria-hidden="true" />{t("newCode")}</Action> : undefined}>
          {!admin && <p>{t("noCodesMember")}</p>}
        </EmptyState>
      ) : (
        <DataTable caption={t("referralTitle")} headers={[t("colCode"), t("colLinks"), { label: t("colCreated"), align: "end" }, { label: t("colStatus"), align: "end" }]}>
          {data.codes.map((code) => (
            <tr key={code.id}>
              <th scope="row">
                <span className="p-table-primary">
                  <span className="p-mono-cell">{code.code}</span>
                  {code.label && <span className="p-cell-meta">{code.label}</span>}
                </span>
              </th>
              <td>
                {code.revokedAt ? <span className="p-cell-meta">{t("none")}</span> : (
                  <span className="p-partner-links">
                    {([["linkDemoEn", code.links.demo.en], ["linkDemoEs", code.links.demo.es], ["linkSignup", code.links.signup]] as const).map(([key, href]) => (
                      <Action key={key} variant="ghost" size="sm" onClick={() => void copyLink(href)} title={href} aria-label={`${t("copy")}: ${t(key)} · ${href}`}>
                        <Copy aria-hidden="true" />
                        {t(key)}
                      </Action>
                    ))}
                  </span>
                )}
              </td>
              <td className="p-table-action p-cell-meta"><Time value={code.createdAt} withTime={false} /></td>
              <td className="p-table-action">
                {code.revokedAt ? <Badge>{t("revoked")}</Badge> : admin ? (
                  <Action variant="ghost" size="sm" onClick={() => { setError(""); setReason(""); setRevoking({ id: code.id, code: code.code }); }}>
                    <Trash2 aria-hidden="true" />
                    {t("revoke")}
                  </Action>
                ) : <Badge tone="pass">{t("live")}</Badge>}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      <Modal open={creating} onOpenChange={setCreating} title={t("newCode")} description={t("newCodeHelp")} size="sm"
        footer={<>
          <Action variant="secondary" onClick={() => setCreating(false)}>{t("cancel")}</Action>
          <Action type="submit" form="partner-code-form" disabled={pending}>{t("createCode")}</Action>
        </>}>
        <form id="partner-code-form" onSubmit={create} className="p-stack">
          {error && <Status error>{error}</Status>}
          <Field id="partner-code-label" label={t("codeLabel")} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} />
        </form>
      </Modal>
      <Modal open={!!revoking} onOpenChange={(value) => !value && setRevoking(null)} title={t("revokeTitle")} description={t("revokeHelp")} size="sm"
        footer={<>
          <Action variant="secondary" onClick={() => setRevoking(null)}>{t("cancel")}</Action>
          <Action type="submit" form="partner-revoke-form" variant="danger" disabled={pending || reason.trim().length < 3}>{t("revoke")}</Action>
        </>}>
        <form id="partner-revoke-form" onSubmit={revoke} className="p-stack">
          {error && <Status error>{error}</Status>}
          {revoking && <p className="p-mono-cell">{revoking.code}</p>}
          <Field id="partner-revoke-reason" label={t("revokeReason")} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} required />
        </form>
      </Modal>
    </Section>
  );
}

function Referred({ data, copy, money }: { data: Overview; copy: Copy; money: Money }) {
  const { t } = copy;
  return (
    <Section title={t("referredTitle")} description={t("referredIntro")}>
      {data.referrals.length === 0 ? <p className="p-cell-meta">{t("noReferred")}</p> : (
        <DataTable caption={t("referredTitle")} headers={[t("colAccount"), { label: t("colSignedUp"), align: "end" }, { label: t("colFirstPayment"), align: "end" }, { label: t("colRevenue"), align: "end" }, { label: t("colShare"), align: "end" }]}>
          {data.referrals.map((row) => (
            <tr key={row.orgId}>
              <th scope="row"><span className="p-table-primary"><span>{row.workspace}</span><span className="p-cell-meta p-mono-cell">{row.code}</span></span></th>
              <td className="p-table-action p-cell-meta"><Time value={row.attributedAt} withTime={false} /></td>
              <td className="p-table-action p-cell-meta">{row.firstPaidAt ? <Time value={row.firstPaidAt} withTime={false} /> : t("notYet")}</td>
              <td className="p-num">{money.euros(row.revenueNetCents) ?? t("none")}</td>
              <td className="p-num">{money.euros(row.revenueShareCents) ?? t("none")}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </Section>
  );
}

function Allowance({ data, copy, money }: { data: Overview; copy: Copy; money: Money }) {
  const { t, tv } = copy;
  const allowance = data.allowance;
  return (
    <Section title={t("allowanceTitle")} description={t("allowanceIntro")}>
      {!allowance ? <p className="p-cell-meta">{t("noAllowance")}</p> : (
        <>
          <DefinitionList items={[
            { term: t("allowanceMonthly"), value: tv("credits", { n: money.credits(allowance.monthlyCredits) ?? "0" }) },
            { term: t("allowanceGranted"), value: tv("credits", { n: money.credits(allowance.grantedCredits) ?? "0" }) },
            { term: t("allowanceLeft"), value: tv("credits", { n: money.credits(allowance.remainingCredits) ?? "0" }) },
            { term: t("allowanceValidity"), value: allowance.validUntil ? tv("allowanceUntil", { from: formatDate(allowance.validFrom), until: formatDate(allowance.validUntil) }) : tv("allowanceFrom", { from: formatDate(allowance.validFrom) }) },
          ]} />
          {allowance.grants.length > 0 && (<>
            <h3 className="p-partner-subhead">{t("recentGrants")}</h3>
            <DataTable caption={t("recentGrants")} headers={[t("colClient"), { label: t("colCredits"), align: "end" }, { label: t("colCreated"), align: "end" }]}>
              {allowance.grants.map((grant) => (
                <tr key={grant.id}>
                  <th scope="row">{grant.workspace}</th>
                  <td className="p-num">{money.credits(grant.credits)}</td>
                  <td className="p-table-action p-cell-meta"><Time value={grant.at} withTime={false} /></td>
                </tr>
              ))}
            </DataTable>
          </>)}
        </>
      )}
    </Section>
  );
}

function Branding({ data, admin, copy, partnerId, onChange }: { data: Overview; admin: boolean; copy: Copy; partnerId: string; onChange: () => Promise<void> }) {
  const { t } = copy;
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > 512 * 1024) return setError(t("logoTooLarge"));
    if (!["image/png", "image/jpeg"].includes(file.type)) return setError(t("logoType"));
    setPending(true);
    try {
      await evalRequest(`/partners/${partnerId}/logo`, "PUT", { imageBase64: await toBase64(file) });
      notify(t("logoSaved"));
      await onChange();
    } catch (reason) {
      setError(errorText(reason, copy));
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    setPending(true);
    setError("");
    try {
      await evalRequest(`/partners/${partnerId}/logo`, "DELETE");
      notify(t("logoRemoved"));
      await onChange();
    } catch (reason) {
      setError(errorText(reason, copy));
    } finally {
      setPending(false);
    }
  }
  const logo = data.partner.logo;
  return (
    <Section title={t("brandingTitle")} description={t("brandingIntro")}>
      {error && <Status error>{error}</Status>}
      <div className="p-partner-brand">
        <div className="p-partner-logo" aria-label={t("currentLogo")} role="img">
          {logo
            // eslint-disable-next-line @next/next/no-img-element -- a private, authenticated image; next/image cannot fetch it.
            ? <img src={`/api/evals/v1/partners/${partnerId}/logo?v=${logo.sha256.slice(0, 12)}`} alt={data.partner.name} />
            : <span className="p-cell-meta">{t("noLogo")}</span>}
        </div>
        {admin ? (
          <div className="p-row">
            <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => void upload(event)} data-testid="partner-logo-input" />
            <Action variant="secondary" onClick={() => input.current?.click()} disabled={pending || data.partner.status !== "active"}>
              <ImageUp aria-hidden="true" />
              {logo ? t("replaceLogo") : t("uploadLogo")}
            </Action>
            {logo && <Action variant="ghost" onClick={() => void remove()} disabled={pending}>{t("removeLogo")}</Action>}
          </div>
        ) : <p className="p-cell-meta">{t("brandingMember")}</p>}
      </div>
      {admin && <p className="p-field-hint">{t("logoHint")}</p>}
    </Section>
  );
}
