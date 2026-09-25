"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { evalRequest, EvalRequestError } from "./api";
import { Action, Badge, DataTable, DefinitionList, EmptyState, Field, Loading, PageHeading, RowTitle, SectionHeading, Status, StatusBadge } from "./primitives";
import { SlidersHorizontal } from "lucide-react";
import { t } from "@/lib/evals/messages/en";

export type PlatformSection = "providers" | "inference" | "usage" | "accounts" | "audit";
type Workspace = { id: string; name: string };
const ROLES = ["target", "generator", "context_analyzer", "judge", "adjudicator", "report_writer", "embedding"] as const;
const CONNECTIONS = ["website", "openai_compatible", "provider_native", "https_json", "imported_responses", "private_runner"] as const;
const CAPABILITIES = ["text", "boundedTokens", "jsonObject", "probeApproved"] as const;
const money = (value: string | null | undefined) => value == null ? "—" : String(Number(value));
const list = (value: FormDataEntryValue | null) => String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

function usePlatformAction() {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<{ message: string; reauth: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const run = useCallback(async (work: () => Promise<unknown>, done: string) => {
    setPending(true); setError(null); setNotice("");
    try { await work(); setNotice(done); return true; }
    catch (reason) {
      setError({ message: reason instanceof Error ? reason.message : t("error"), reauth: reason instanceof EvalRequestError && reason.code === "REAUTHENTICATION_REQUIRED" });
      return false;
    } finally { setPending(false); }
  }, []);
  const messages = <>
    {notice && <Status>{notice}</Status>}
    {error && <Status error>{error.message}{error.reauth && <> <Link className="p-link" href={`/workspace/sign-in?next=${encodeURIComponent(typeof location === "undefined" ? "/ops/platform" : location.pathname)}`}>{t("signInAgain")}</Link></>}</Status>}
  </>;
  return { run, pending, messages };
}

function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [orgId, setOrgId] = useState("");
  useEffect(() => { void evalRequest<Workspace[]>("/workspaces").then((rows) => { setWorkspaces(rows); setOrgId((current) => current || rows[0]?.id || ""); }).catch(() => undefined); }, []);
  const picker = <div className="eval-toolbar"><label htmlFor="platform-workspace">{t("workspace")}</label>
    <select id="platform-workspace" value={orgId} onChange={(event) => setOrgId(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>;
  return { workspaces, orgId, picker };
}

const SECTIONS: Array<{ id: PlatformSection; href: string; label: string }> = [
  { id: "providers", href: "/ops/platform", label: "Providers & models" },
  { id: "inference", href: "/ops/platform/inference", label: "Inference" },
  { id: "usage", href: "/ops/platform/usage", label: "Usage & budgets" },
  { id: "accounts", href: "/ops/platform/accounts", label: "Accounts" },
  { id: "audit", href: "/ops/platform/audit", label: "Audit log" },
];

export function PlatformConsole({ section, admin }: { section: PlatformSection; admin: boolean }) {
  return <>
    <PageHeading title={SECTIONS.find((item) => item.id === section)!.label}>{t("platformConsoleHelp")}</PageHeading>
    <nav className="p-row" aria-label={t("platformSections")} style={{ gap: 6, marginBottom: 16 }}>
      {SECTIONS.map((item) => <Link key={item.id} href={item.href} className="p-link" aria-current={item.id === section ? "page" : undefined}><Badge tone={item.id === section ? "strong" : "neutral"}>{item.label}</Badge></Link>)}
    </nav>
    {!admin && <Status>{t("platformReadOnly")}</Status>}
    {section === "providers" ? <Providers admin={admin} /> : section === "inference" ? <Inference admin={admin} /> : section === "usage" ? <Usage admin={admin} /> : section === "accounts" ? <Accounts admin={admin} /> : <Audit />}
  </>;
}

type ProviderData = {
  accounts: Array<{ id: string; name: string; currency: string; ceiling: string; settled: string; reserved: string; enabled: boolean }>;
  revisions: Array<{ id: string; account_id: string; adapter: string; model_id: string; roles: string[]; capabilities: Record<string, boolean>; context_limit: number; output_limit: number; data_classes: string[]; regions: string[]; endpoint_host: string; health: string | null; last_probe_at: string | null; retired_at: string | null; price: { id: string; currency: string; input: string; output: string } | null }>;
  secrets: Array<{ id: string; provider_revision_id: string; created_at: string; revoked_at: string | null; versions: number }>;
};
type Route = { org_id: string; workspace: string; role: string; provider_revision_id: string; price_revision_id: string; data_class: string; region: string; internal_cost_per_second: string; updated_at: string };

function Providers({ admin }: { admin: boolean }) {
  const { orgId, workspaces, picker } = useWorkspaces();
  const [data, setData] = useState<ProviderData | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const { run, pending, messages } = usePlatformAction();
  const load = useCallback(async () => {
    if (!orgId) return;
    setData(await evalRequest<ProviderData>(`/providers?orgId=${orgId}`).catch(() => ({ accounts: [], revisions: [], secrets: [] })));
    setRoutes(await evalRequest<Route[]>("/models/routes").catch(() => []));
  }, [orgId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (!data) return <>{picker}<Loading /></>;
  const model = (id: string) => { const item = data.revisions.find((revision) => revision.id === id); return item ? `${item.model_id} · ${id.slice(0, 8)}` : id.slice(0, 8); };

  async function registerRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const adapter = String(form.get("adapter"));
    const ok = await run(() => evalRequest("/providers", "POST", { orgId, revision: {
      accountId: form.get("accountId"), adapter, endpoint: adapter === "dgx" ? "dgx" : form.get("endpoint"), modelId: form.get("modelId"),
      roles: ROLES.filter((role) => form.has(`role-${role}`)),
      capabilities: Object.fromEntries(CAPABILITIES.map((capability) => [capability, form.has(`cap-${capability}`)])),
      contextLimit: Number(form.get("contextLimit")), outputLimit: Number(form.get("outputLimit")),
      dataClasses: list(form.get("dataClasses")), regions: list(form.get("regions")),
      concurrencyLimit: Number(form.get("concurrencyLimit")), rpm: Number(form.get("rpm")), tpm: Number(form.get("tpm")),
    } }, crypto.randomUUID()), t("revisionRegistered"));
    if (ok) { event.currentTarget.reset(); await load(); }
  }
  async function registerPriceRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const ok = await run(() => evalRequest("/models/prices", "POST", { orgId, price: {
      providerRevisionId: form.get("providerRevisionId"), currency: String(form.get("currency")).toUpperCase(), effectiveAt: new Date().toISOString(),
      inputPrice: form.get("inputPrice"), outputPrice: form.get("outputPrice"), cachePrice: form.get("cachePrice"), toolPrice: form.get("toolPrice"),
      uncertaintyBps: Number(form.get("uncertaintyBps")), source: form.get("source"),
    } }, crypto.randomUUID()), t("priceRegistered"));
    if (ok) await load();
  }
  async function saveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const revision = data!.revisions.find((item) => item.id === form.get("providerRevisionId"));
    const ok = await run(() => evalRequest("/models/routes", "POST", { orgId: form.get("routeOrgId"), route: {
      role: form.get("role"), providerRevisionId: revision?.id, priceRevisionId: revision?.price?.id,
      dataClass: form.get("dataClass"), region: form.get("region"), internalCostPerSecond: form.get("internalCostPerSecond"),
    } }), t("routeSaved"));
    if (ok) await load();
  }

  return <>
    {picker}{messages}
    <SectionHeading title={t("providerAccounts")}>{t("providerAccountsHelp")}</SectionHeading>
    {data.accounts.length ? <DataTable caption={t("providerAccounts")} headers={[t("account"), t("ceiling"), t("settledSpend"), t("outstandingSpend"), t("statusLabel")]}>
      {data.accounts.map((account) => <tr key={account.id}><RowTitle meta={account.id.slice(0, 8)}>{account.name}</RowTitle><td>{money(account.ceiling)} {account.currency}</td><td>{money(account.settled)}</td><td>{money(account.reserved)}</td>
        <td>{admin ? <form className="p-row" style={{ gap: 6 }} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => evalRequest(`/budgets/${orgId}/amendments`, "POST", { targetKind: "provider_account", targetId: account.id, ceiling: form.get("ceiling"), currency: account.currency, enabled: form.has("enabled"), reason: form.get("reason") }), t("amendmentRecorded")).then((ok) => { if (ok) void load(); }); }}>
          <label className="p-row" style={{ gap: 4 }}><input type="checkbox" name="enabled" defaultChecked={account.enabled} /> {t("routingEnabled")}</label>
          <input name="ceiling" aria-label={t("ceiling")} defaultValue={money(account.ceiling)} size={6} /><input name="reason" aria-label={t("amendmentReason")} placeholder={t("amendmentReason")} required minLength={3} size={14} />
          <Button size="sm" variant="outline" disabled={pending}>{t("save")}</Button></form> : <StatusBadge value={account.enabled ? "enabled" : "disabled"} />}</td></tr>)}
    </DataTable> : <EmptyState title={t("noProviders")} icon={<SlidersHorizontal />}><p>{t("noProvidersHelp")}</p></EmptyState>}

    <div style={{ height: 24 }} /><SectionHeading title={t("modelRevisions")}>{t("modelRevisionsHelp")}</SectionHeading>
    <DataTable caption={t("modelRevisions")} headers={[t("model"), t("rolesLabel"), t("capabilitiesLabel"), t("limitsLabel"), t("health"), { label: t("access"), align: "end" }]}>
      {data.revisions.map((revision) => {
        const keys = data.secrets.filter((secret) => secret.provider_revision_id === revision.id && !secret.revoked_at);
        return <tr key={revision.id}>
          <RowTitle meta={`${revision.adapter} · ${revision.endpoint_host} · ${revision.id.slice(0, 8)}${revision.price ? ` · ${money(revision.price.input)}/${money(revision.price.output)} ${revision.price.currency} per token` : ` · ${t("noPrice")}`}`}>{revision.model_id}</RowTitle>
          <td className="p-cell-meta">{revision.roles.join(", ")}</td>
          <td className="p-cell-meta">{Object.entries(revision.capabilities).filter(([, on]) => on).map(([name]) => name).join(", ") || "—"}</td>
          <td className="p-cell-meta">{revision.context_limit.toLocaleString()} / {revision.output_limit.toLocaleString()}</td>
          <td><StatusBadge value={revision.retired_at ? "retired" : revision.health ?? "unprobed"} /></td>
          <td className="p-table-action">{admin && !revision.retired_at && <>
            {revision.adapter === "dgx" && (["text", "json_object", "tools"] as const).map((kind) => <Action key={kind} size="sm" variant="secondary" disabled={pending} onClick={() => void run(() => evalRequest("/inference/probes", "POST", { orgId, providerRevisionId: revision.id, kind }), t("probeQueued"))}>{t("probe")} {kind.replace("_object", "")}</Action>)}
            {revision.adapter !== "dgx" && <form className="p-row" style={{ gap: 4 }} autoComplete="off" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const value = String(form.get("value")); event.currentTarget.reset(); void run(() => evalRequest("/providers/keys", "POST", { orgId, providerRevisionId: revision.id, recordId: keys[0]?.id, value }), keys.length ? t("keyRotated") : t("keySaved")).then((ok) => { if (ok) void load(); }); }}>
              <input type="password" name="value" aria-label={t("providerKey")} placeholder={keys.length ? t("rotateKey") : t("providerKey")} autoComplete="new-password" required minLength={8} size={14} />
              <Button size="sm" variant="outline" disabled={pending}>{keys.length ? t("rotate") : t("save")}</Button></form>}
            {keys.map((key) => <Action key={key.id} size="sm" variant="secondary" disabled={pending} onClick={() => void run(() => evalRequest(`/providers/keys/${key.id}?orgId=${orgId}`, "DELETE"), t("keyRevoked")).then((ok) => { if (ok) void load(); })}>{t("revokeKey")} ({key.versions})</Action>)}
          </>}</td>
        </tr>;
      })}
    </DataTable>

    <div style={{ height: 24 }} /><SectionHeading title={t("modelRoutes")}>{t("modelRoutesHelp")}</SectionHeading>
    {routes.length ? <DataTable caption={t("modelRoutes")} headers={[t("workspace"), t("roleLabel"), t("model"), t("dataPolicy")]}>
      {routes.map((route) => <tr key={`${route.org_id}-${route.role}`}><RowTitle>{route.workspace}</RowTitle><td>{route.role.replaceAll("_", " ")}</td><td className="p-cell-meta">{model(route.provider_revision_id)}</td><td className="p-cell-meta">{route.data_class} · {route.region}</td></tr>)}
    </DataTable> : <p className="p-cell-meta">{t("noRoutes")}</p>}

    {admin && <div className="p-stack" style={{ marginTop: 28 }}>
      <form className="eval-panel p-stack" style={{ alignContent: "start", maxWidth: 640 }} onSubmit={saveRoute}><h3>{t("setRoute")}</h3>
        <label className="eval-field"><span>{t("workspace")}</span><select name="routeOrgId" defaultValue={orgId}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="eval-field"><span>{t("roleLabel")}</span><select name="role">{["context_analyzer", "generator", "judge", "report_writer"].map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></label>
        <label className="eval-field"><span>{t("model")}</span><select name="providerRevisionId" required>{data.revisions.filter((item) => item.adapter === "dgx" && !item.retired_at && item.price).map((item) => <option key={item.id} value={item.id}>{model(item.id)}</option>)}</select></label>
        <Field id="route-class" name="dataClass" label={t("dataClass")} defaultValue="synthetic" required />
        <Field id="route-region" name="region" label={t("region")} defaultValue="private_wireguard" required />
        <Field id="route-cost" name="internalCostPerSecond" label={t("internalCostPerSecond")} defaultValue="0.0001" required />
        <Button className="justify-self-start" disabled={pending}>{t("saveRoute")}</Button>
      </form>
      <form className="eval-panel p-stack" style={{ alignContent: "start", maxWidth: 640 }} onSubmit={registerPriceRevision}><h3>{t("registerPrice")}</h3>
        <label className="eval-field"><span>{t("model")}</span><select name="providerRevisionId" required>{data.revisions.map((item) => <option key={item.id} value={item.id}>{model(item.id)}</option>)}</select></label>
        <Field id="price-currency" name="currency" label={t("currency")} defaultValue="EUR" required pattern="[A-Za-z]{3}" />
        {(["inputPrice", "outputPrice", "cachePrice", "toolPrice"] as const).map((name) => <Field key={name} id={`price-${name}`} name={name} label={t(name)} defaultValue="0" required />)}
        <Field id="price-uncertainty" name="uncertaintyBps" type="number" min={0} max={10000} label={t("uncertaintyBps")} defaultValue="1000" />
        <Field id="price-source" name="source" label={t("priceSource")} required />
        <Button className="justify-self-start" disabled={pending}>{t("registerPrice")}</Button>
      </form>
      <form className="eval-panel p-stack" style={{ alignContent: "start", maxWidth: 640 }} onSubmit={registerRevision}><h3>{t("registerRevision")}</h3>
        <p className="p-cell-meta">{t("registerRevisionHelp")}</p>
        <label className="eval-field"><span>{t("account")}</span><select name="accountId" required>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="eval-field"><span>{t("adapter")}</span><select name="adapter"><option value="dgx">DGX (private route)</option><option value="openai_compatible">OpenAI-compatible HTTPS</option></select></label>
        <Field id="rev-endpoint" name="endpoint" type="url" label={t("endpointHttps")} placeholder="https://api.example.com/v1" />
        <Field id="rev-model" name="modelId" label={t("modelId")} required />
        <fieldset className="eval-check-list"><legend>{t("rolesLabel")}</legend>{ROLES.map((role) => <label key={role}><input type="checkbox" name={`role-${role}`} /> {role.replaceAll("_", " ")}</label>)}</fieldset>
        <fieldset className="eval-check-list"><legend>{t("verifiedCapabilities")}</legend>{CAPABILITIES.map((capability) => <label key={capability}><input type="checkbox" name={`cap-${capability}`} /> {capability}</label>)}</fieldset>
        <Field id="rev-context" name="contextLimit" type="number" label={t("contextLimit")} defaultValue="8192" required />
        <Field id="rev-output" name="outputLimit" type="number" label={t("outputLimit")} defaultValue="1024" required />
        <Field id="rev-classes" name="dataClasses" label={t("dataClasses")} defaultValue="synthetic" required />
        <Field id="rev-regions" name="regions" label={t("regions")} defaultValue="private_wireguard" required />
        <Field id="rev-concurrency" name="concurrencyLimit" type="number" min={1} max={16} label={t("concurrency")} defaultValue="1" />
        <Field id="rev-rpm" name="rpm" type="number" label="RPM" defaultValue="60" />
        <Field id="rev-tpm" name="tpm" type="number" label="TPM" defaultValue="1000000" />
        <Button className="justify-self-start" disabled={pending}>{t("registerRevision")}</Button>
      </form>
    </div>}
  </>;
}

function Inference({ admin }: { admin: boolean }) {
  const [now] = useState(() => Date.now());
  const { orgId, picker } = useWorkspaces();
  const [data, setData] = useState<{ health: Array<{ id: string; adapter: string; model_id: string; roles: string[]; state: string | null; last_probe_at: string | null; circuit_until: string | null; active_slots: number; calls_24h: number; avg_seconds_24h: number | null }>; probes: Array<{ id: string; status: string; reason_code: string | null; created_at: string; provider_revision_id: string; kind: string; evidence: { status: string } | null }> } | null>(null);
  useEffect(() => { if (orgId) void evalRequest<NonNullable<typeof data>>(`/inference?orgId=${orgId}`).then(setData).catch(() => setData({ health: [], probes: [] })); }, [orgId]);
  if (!data) return <>{picker}<Loading /></>;
  return <>
    {picker}
    <p className="p-cell-meta">{t("inferenceHelp")}</p>
    <DataTable caption={t("inferenceHealth")} headers={[t("model"), t("health"), t("lastProbe"), t("activeSlots"), t("calls24h"), t("avgSeconds")]}>
      {data.health.map((row) => <tr key={row.id}><RowTitle meta={`${row.adapter} · ${row.roles.join(", ")}`}>{row.model_id}</RowTitle><td><StatusBadge value={row.circuit_until && Date.parse(row.circuit_until) > now ? "circuit_open" : row.state ?? "unprobed"} /></td>
        <td className="p-cell-meta">{row.last_probe_at ? new Date(row.last_probe_at).toLocaleString() : "—"}</td><td>{row.active_slots}</td><td>{row.calls_24h}</td><td>{row.avg_seconds_24h ?? "—"}</td></tr>)}
    </DataTable>
    <SectionHeading title={t("recentProbes")}>{admin ? t("recentProbesHelp") : undefined}</SectionHeading>
    {data.probes.length ? <DataTable caption={t("recentProbes")} headers={[t("probe"), t("statusLabel"), t("capabilityEvidence"), t("createdAt")]}>
      {data.probes.map((probe) => <tr key={probe.id}><RowTitle meta={probe.provider_revision_id?.slice(0, 8)}>{probe.kind}</RowTitle><td><StatusBadge value={probe.status} /></td><td>{probe.evidence?.status ?? probe.reason_code?.replaceAll("_", " ") ?? "—"}</td><td className="p-cell-meta">{new Date(probe.created_at).toLocaleString()}</td></tr>)}
    </DataTable> : <p className="p-cell-meta">{t("noProbes")}</p>}
  </>;
}

type UsageData = {
  budgets: Array<{ id: string; kind: string; scope_id: string; currency: string; ceiling: string; settled: string; reserved: string }>;
  entitlement: { max_active_runs: number; monthly_spend_limit: string; currency: string; allowed_connection_types: string[]; can_schedule: boolean; can_export: boolean; review_allowance: number; version: number } | null;
  evaluations: Array<{ id: string; title: string; commercial_cap: string; currency: string }>;
  amendments: Array<{ id: string; target_kind: string; reason: string; actor_id: string; created_at: string; next: Record<string, unknown> }>;
  targetCalls: { calls: number; unknown: number };
};

function Usage({ admin }: { admin: boolean }) {
  const { orgId, picker } = useWorkspaces();
  const [data, setData] = useState<UsageData | null>(null);
  const { run, pending, messages } = usePlatformAction();
  const load = useCallback(async () => { if (orgId) setData(await evalRequest<UsageData>(`/usage?orgId=${orgId}`).catch(() => null)); }, [orgId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (!data) return <>{picker}<Loading /></>;
  const workspaceBudget = data.budgets.find((item) => item.kind === "workspace");
  const amend = (body: Record<string, unknown>) => run(() => evalRequest(`/budgets/${orgId}/amendments`, "POST", body), t("amendmentRecorded")).then((ok) => { if (ok) void load(); });
  const entitlement = data.entitlement;
  return <>
    {picker}{messages}
    <div className="eval-settings-grid">
      <section className="eval-panel"><h2>{t("workspaceBudget")}</h2>
        <DefinitionList items={[{ term: t("ceiling"), value: workspaceBudget ? `${workspaceBudget.ceiling} ${workspaceBudget.currency}` : t("notSet") }, { term: t("settledSpend"), value: workspaceBudget?.settled ?? "0" }, { term: t("outstandingSpend"), value: workspaceBudget?.reserved ?? "0" }, { term: t("externalTargetCalls"), value: `${data.targetCalls.calls} (${data.targetCalls.unknown} ${t("unknownOutcome")})` }]} />
        {admin && <form className="p-stack" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void amend({ targetKind: "workspace_budget", ceiling: form.get("ceiling"), currency: form.get("currency"), reason: form.get("reason") }); }}>
          <Field id="wb-ceiling" name="ceiling" label={t("newCeiling")} defaultValue={workspaceBudget?.ceiling ?? "500"} required />
          <Field id="wb-currency" name="currency" label={t("currency")} defaultValue={workspaceBudget?.currency ?? "EUR"} required />
          <Field id="wb-reason" name="reason" label={t("amendmentReason")} required minLength={3} />
          <Button className="justify-self-start" variant="outline" disabled={pending}>{t("amendBudget")}</Button>
        </form>}
      </section>
      {entitlement && <section className="eval-panel"><h2>{t("entitlements")}</h2>
        {admin ? <form className="p-stack" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void amend({ targetKind: "entitlement", reason: form.get("reason"), maxActiveRuns: Number(form.get("maxActiveRuns")), monthlySpendLimit: form.get("monthlySpendLimit"), allowedConnectionTypes: CONNECTIONS.filter((kind) => form.has(`conn-${kind}`)), canSchedule: form.has("canSchedule"), canExport: form.has("canExport"), reviewAllowance: Number(form.get("reviewAllowance")) }); }} key={entitlement.version}>
          <Field id="ent-runs" name="maxActiveRuns" type="number" min={0} max={100} label={t("activeRunAllowance")} defaultValue={entitlement.max_active_runs} />
          <Field id="ent-limit" name="monthlySpendLimit" label={`${t("monthlyLimit")} (${entitlement.currency})`} defaultValue={entitlement.monthly_spend_limit} />
          <Field id="ent-review" name="reviewAllowance" type="number" min={0} label={t("reviewAllowance")} defaultValue={entitlement.review_allowance} />
          <fieldset className="eval-check-list"><legend>{t("allowedConnections")}</legend>{CONNECTIONS.map((kind) => <label key={kind}><input type="checkbox" name={`conn-${kind}`} defaultChecked={entitlement.allowed_connection_types.includes(kind)} /> {kind.replaceAll("_", " ")}</label>)}
            <label><input type="checkbox" name="canSchedule" defaultChecked={entitlement.can_schedule} /> {t("canSchedule")}</label>
            <label><input type="checkbox" name="canExport" defaultChecked={entitlement.can_export} /> {t("canExport")}</label></fieldset>
          <Field id="ent-reason" name="reason" label={t("amendmentReason")} required minLength={3} />
          <Button className="justify-self-start" variant="outline" disabled={pending}>{t("amendEntitlements")}</Button>
        </form> : <DefinitionList items={[{ term: t("activeRunAllowance"), value: entitlement.max_active_runs }, { term: t("monthlyLimit"), value: `${entitlement.monthly_spend_limit} ${entitlement.currency}` }]} />}
      </section>}
    </div>
    <SectionHeading title={t("evaluationCaps")}>{t("evaluationCapsHelp")}</SectionHeading>
    <DataTable caption={t("evaluationCaps")} headers={[t("evaluation"), t("ceiling"), { label: t("access"), align: "end" }]}>
      {data.evaluations.map((evaluation) => <tr key={evaluation.id}><RowTitle>{evaluation.title}</RowTitle><td>{evaluation.commercial_cap} {evaluation.currency}</td>
        <td className="p-table-action">{admin && <form className="p-row" style={{ gap: 4 }} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void amend({ targetKind: "evaluation_cap", targetId: evaluation.id, ceiling: form.get("ceiling"), reason: form.get("reason") }); }}>
          <input name="ceiling" aria-label={t("newCeiling")} defaultValue={evaluation.commercial_cap} size={6} /><input name="reason" aria-label={t("amendmentReason")} placeholder={t("amendmentReason")} required minLength={3} size={14} /><Button size="sm" variant="outline" disabled={pending}>{t("save")}</Button></form>}</td></tr>)}
    </DataTable>
    <SectionHeading title={t("amendmentHistory")} />
    {data.amendments.length ? <DataTable caption={t("amendmentHistory")} headers={[t("change"), t("amendmentReason"), t("createdAt")]}>
      {data.amendments.map((item) => <tr key={item.id}><RowTitle meta={JSON.stringify(item.next)}>{item.target_kind.replaceAll("_", " ")}</RowTitle><td>{item.reason}</td><td className="p-cell-meta">{new Date(item.created_at).toLocaleString()}</td></tr>)}
    </DataTable> : <p className="p-cell-meta">{t("noAmendments")}</p>}
  </>;
}

function Accounts({ admin }: { admin: boolean }) {
  const [data, setData] = useState<{ platformRoles: Array<{ user_id: string; email: string; name: string; role: string }>; memberships: Array<{ org_id: string; workspace: string; user_id: string; email: string; role: string; created_at: string }> } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (admin) void evalRequest<NonNullable<typeof data>>("/accounts").then(setData).catch(() => setError(t("error"))); }, [admin]);
  if (!admin) return <Status>{t("accountsAdminOnly")}</Status>;
  if (error) return <Status error>{error}</Status>;
  if (!data) return <Loading />;
  return <>
    <SectionHeading title={t("platformRoles")}>{t("platformRolesHelp")}</SectionHeading>
    <DataTable caption={t("platformRoles")} headers={[t("account"), t("roleLabel")]}>{data.platformRoles.map((row) => <tr key={row.user_id}><RowTitle meta={row.name}>{row.email}</RowTitle><td><Badge>{row.role.replaceAll("_", " ")}</Badge></td></tr>)}</DataTable>
    <SectionHeading title={t("workspaceMembers")} />
    <DataTable caption={t("workspaceMembers")} headers={[t("workspace"), t("account"), t("roleLabel"), t("createdAt")]}>{data.memberships.map((row) => <tr key={`${row.org_id}-${row.user_id}`}><RowTitle>{row.workspace}</RowTitle><td>{row.email}</td><td>{row.role}</td><td className="p-cell-meta">{new Date(row.created_at).toLocaleDateString()}</td></tr>)}</DataTable>
  </>;
}

function Audit() {
  const { orgId, picker } = useWorkspaces();
  const [rows, setRows] = useState<Array<{ id: string; actor_id: string; action: string; subject_id: string; created_at: string }> | null>(null);
  useEffect(() => { if (orgId) void evalRequest<NonNullable<typeof rows>>(`/audit?orgId=${orgId}`).then(setRows).catch(() => setRows([])); }, [orgId]);
  async function older() {
    const last = rows?.at(-1); if (!last) return;
    const next = await evalRequest<NonNullable<typeof rows>>(`/audit?orgId=${orgId}&before=${encodeURIComponent(new Date(last.created_at).toISOString())}`).catch(() => []);
    setRows((current) => [...(current ?? []), ...next]);
  }
  const body: ReactNode = !rows ? <Loading /> : rows.length ? <>
    <DataTable caption={t("auditLog")} headers={[t("action"), t("account"), t("subject"), t("createdAt")]}>{rows.map((row) => <tr key={row.id}><RowTitle>{row.action.replaceAll("_", " ")}</RowTitle><td className="p-cell-meta"><code className="p-code">{row.actor_id}</code></td><td className="p-cell-meta"><code className="p-code">{row.subject_id.slice(0, 36)}</code></td><td className="p-cell-meta">{new Date(row.created_at).toLocaleString()}</td></tr>)}</DataTable>
    {rows.length % 100 === 0 && <Action variant="secondary" onClick={() => void older()}>{t("loadOlder")}</Action>}
  </> : <p className="p-cell-meta">{t("noAudit")}</p>;
  return <>{picker}<p className="p-cell-meta">{t("auditHelp")}</p>{body}</>;
}
