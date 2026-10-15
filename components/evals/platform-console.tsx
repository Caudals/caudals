"use client";

/**
 * Platform administration (spec §5.1 Platform, §14): providers and models,
 * inference health, usage and budgets, accounts and the audit log. Provider
 * keys are write-only: they can be added, rotated and revoked, never read.
 * Sensitive changes require a platform admin, a recent sign-in and a reason.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { KeyRound, Plus, SlidersHorizontal } from "lucide-react";
import { evalRequest } from "./api";
import {
  Action,
  Badge,
  Check,
  DataTable,
  EmptyState,
  Field,
  PageHeading,
  RowTitle,
  SectionHeading,
  SelectField,
  Stat,
  StatGrid,
  Status,
  StatusBadge,
  TabLinks,
  TableSkeleton,
  Time,
  Toolbar,
  InlineSelect,
  SearchInput,
  formatDate,
  formatMoney,
  humanize,
} from "./primitives";
import { ActionMenu, Modal } from "./overlays";
import { useWorkspace } from "./workspace-context";
import { usePlatformAction } from "./platform-action";
import { EntitlementForm } from "./entitlement-form";
import { OpsBilling, type BillingView } from "./ops-billing";
import { accountHref, credits as fmtCredits, euros, planLabel } from "./ops-billing-shared";
import { adapterLabel, amendmentText, countOf, perMillion, roleName } from "./ops-labels";
import { t, tv } from "@/lib/evals/messages/runtime";

export type PlatformSection = "providers" | "inference" | "usage" | "accounts" | "audit" | "billing";
const ROLES = ["target", "generator", "context_analyzer", "judge", "adjudicator", "report_writer", "embedding"] as const;
const CAPABILITIES = ["text", "boundedTokens", "jsonObject", "probeApproved"] as const;
const money = (value: string | null | undefined) => (value == null ? "—" : String(Number(value)));
const list = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const SECTIONS = (): Array<{ id: PlatformSection; href: string; label: string }> => [
  { id: "providers", href: "/ops/platform", label: t("providersModels") },
  { id: "inference", href: "/ops/platform/inference", label: t("inference") },
  { id: "usage", href: "/ops/platform/usage", label: t("usageBudgets") },
  { id: "accounts", href: "/ops/platform/accounts", label: t("accounts") },
  { id: "audit", href: "/ops/platform/audit", label: t("auditLog") },
  { id: "billing", href: "/ops/platform/billing", label: t("billingOpsTitle") },
];

export function PlatformConsole({ section, admin, billingView = "accounts", userId = "", initialOrgId = null }: {
  section: PlatformSection; admin: boolean;
  /** Billing console (L-16): the sub-view, the signed-in admin (to tell their own approval requests apart) and an account to open. */
  billingView?: BillingView; userId?: string; initialOrgId?: string | null;
}) {
  const { workspace } = useWorkspace();
  const scoped = section === "usage" || section === "audit";
  return (
    <>
      <PageHeading title={t("platform")} meta={scoped && workspace ? <span>{t("clientContext")} <strong>{workspace.name}</strong></span> : undefined}>
        {t("platformConsoleHelp")}
      </PageHeading>
      <TabLinks label={t("platformSections")} current={section} options={SECTIONS()} />
      {!admin && section !== "billing" && <Status>{t("platformReadOnly")}</Status>}
      {section === "providers" ? <Providers admin={admin} /> : section === "inference" ? <Inference /> : section === "usage" ? <Usage admin={admin} />
        : section === "accounts" ? <Accounts admin={admin} /> : section === "billing" ? <OpsBilling view={billingView} admin={admin} userId={userId} initialOrgId={initialOrgId} /> : <Audit />}
    </>
  );
}

/* ------------------------------------------------------------ providers --- */

type ProviderData = {
  accounts: Array<{ id: string; name: string; currency: string; ceiling: string; settled: string; reserved: string; enabled: boolean }>;
  revisions: Array<{
    id: string;
    account_id: string;
    adapter: string;
    model_id: string;
    roles: string[];
    capabilities: Record<string, boolean>;
    context_limit: number;
    output_limit: number;
    data_classes: string[];
    regions: string[];
    endpoint_host: string;
    health: string | null;
    last_probe_at: string | null;
    retired_at: string | null;
    price: { id: string; currency: string; input: string; output: string } | null;
    /** Price-book status (migration 088): explicit free model, €0 guard issue, credit rate in effect (µcr per 1M). */
    free_model?: boolean;
    price_issue?: "MODEL_PRICE_ZERO" | "MODEL_RATE_MISSING" | null;
    credit_rate?: { input: string; output: string; label: string } | null;
  }>;
  secrets: Array<{ id: string; provider_revision_id: string; created_at: string; revoked_at: string | null; versions: number }>;
};
type Route = { org_id: string; workspace: string; role: string; provider_revision_id: string; price_revision_id: string; data_class: string; region: string; internal_cost_per_second: string; updated_at: string };
type Dialog = "" | "account" | "model" | "price" | "route" | { key: string } | { ceiling: string };

function Providers({ admin }: { admin: boolean }) {
  const { orgId, workspaces } = useWorkspace();
  const [data, setData] = useState<ProviderData | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [dialog, setDialog] = useState<Dialog>("");
  const [adapter, setAdapter] = useState("dgx");
  const { run, pending, messages } = usePlatformAction();
  const load = useCallback(async () => {
    if (!orgId) return;
    setData(await evalRequest<ProviderData>(`/providers?orgId=${orgId}`).catch(() => ({ accounts: [], revisions: [], secrets: [] })));
    setRoutes(await evalRequest<Route[]>("/models/routes").catch(() => []));
  }, [orgId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (!orgId) return <EmptyState title={t("noClients")}><p>{t("platformNeedsClient")}</p></EmptyState>;
  if (!data) return <TableSkeleton columns={5} />;
  const model = (id: string) => {
    const item = data.revisions.find((revision) => revision.id === id);
    return item ? `${item.model_id} · ${id.slice(0, 8)}` : id.slice(0, 8);
  };
  const keyFor = (revisionId: string) => data.secrets.filter((secret) => secret.provider_revision_id === revisionId && !secret.revoked_at);
  const close = () => setDialog("");

  async function registerAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await run(
      () =>
        evalRequest(
          "/providers",
          "POST",
          { orgId, account: { name: String(form.get("name")), currency: String(form.get("currency")).toUpperCase(), ceiling: String(form.get("ceiling")), enabled: form.has("enabled") } },
          crypto.randomUUID(),
        ),
      t("providerAccountCreated"),
    );
    if (ok) {
      close();
      await load();
    }
  }
  async function registerRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("adapter"));
    const ok = await run(
      () =>
        evalRequest(
          "/providers",
          "POST",
          {
            orgId,
            revision: {
              accountId: form.get("accountId"),
              adapter: kind,
              endpoint: kind === "dgx" ? "dgx" : form.get("endpoint"),
              modelId: form.get("modelId"),
              roles: ROLES.filter((role) => form.has(`role-${role}`)),
              capabilities: Object.fromEntries(CAPABILITIES.map((capability) => [capability, form.has(`cap-${capability}`)])),
              contextLimit: Number(form.get("contextLimit")),
              outputLimit: Number(form.get("outputLimit")),
              dataClasses: list(form.get("dataClasses")),
              regions: list(form.get("regions")),
              concurrencyLimit: Number(form.get("concurrencyLimit")),
              rpm: Number(form.get("rpm")),
              tpm: Number(form.get("tpm")),
            },
          },
          crypto.randomUUID(),
        ),
      t("revisionRegistered"),
    );
    if (ok) {
      close();
      await load();
    }
  }
  async function registerPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await run(
      () =>
        evalRequest(
          "/models/prices",
          "POST",
          {
            orgId,
            price: {
              providerRevisionId: form.get("providerRevisionId"),
              currency: String(form.get("currency")).toUpperCase(),
              effectiveAt: new Date().toISOString(),
              inputPrice: form.get("inputPrice"),
              outputPrice: form.get("outputPrice"),
              cachePrice: form.get("cachePrice"),
              toolPrice: form.get("toolPrice"),
              uncertaintyBps: Number(form.get("uncertaintyBps")),
              source: form.get("source"),
            },
          },
          crypto.randomUUID(),
        ),
      t("priceRegistered"),
    );
    if (ok) {
      close();
      await load();
    }
  }
  async function saveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const revision = data!.revisions.find((item) => item.id === form.get("providerRevisionId"));
    const ok = await run(
      () =>
        evalRequest("/models/routes", "POST", {
          orgId: form.get("routeOrgId"),
          route: { role: form.get("role"), providerRevisionId: revision?.id, priceRevisionId: revision?.price?.id, dataClass: form.get("dataClass"), region: form.get("region"), internalCostPerSecond: form.get("internalCostPerSecond") },
        }),
      t("routeSaved"),
    );
    if (ok) {
      close();
      await load();
    }
  }
  async function saveKey(event: FormEvent<HTMLFormElement>, revisionId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = String(form.get("value"));
    event.currentTarget.reset();
    const existing = keyFor(revisionId);
    const ok = await run(() => evalRequest("/providers/keys", "POST", { orgId, providerRevisionId: revisionId, recordId: existing[0]?.id, value }), existing.length ? t("keyRotated") : t("keySaved"));
    if (ok) {
      close();
      await load();
    }
  }
  async function amendAccount(event: FormEvent<HTMLFormElement>, accountId: string, currency: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await run(
      () => evalRequest(`/budgets/${orgId}/amendments`, "POST", { targetKind: "provider_account", targetId: accountId, ceiling: form.get("ceiling"), currency, enabled: form.has("enabled"), reason: form.get("reason") }),
      t("amendmentRecorded"),
    );
    if (ok) {
      close();
      await load();
    }
  }

  const keyDialog = typeof dialog === "object" && "key" in dialog ? data.revisions.find((item) => item.id === dialog.key) : undefined;
  const accountDialog = typeof dialog === "object" && "ceiling" in dialog ? data.accounts.find((item) => item.id === dialog.ceiling) : undefined;

  return (
    <>
      {dialog === "" && messages}
      <section>
        <SectionHeading
          title={t("providerAccounts")}
          actions={
            admin && (
              <Action variant="secondary" onClick={() => setDialog("account")}>
                <Plus aria-hidden="true" />
                {t("addProviderAccount")}
              </Action>
            )
          }
        >
          {t("providerAccountsHelp")}
        </SectionHeading>
        {data.accounts.length ? (
          <DataTable caption={t("providerAccounts")} headers={[t("account"), { label: t("ceiling"), align: "end" }, { label: t("settledSpend"), align: "end" }, { label: t("outstandingSpend"), align: "end" }, t("routing"), { label: t("actions"), align: "end", hidden: true }]}>
            {data.accounts.map((account) => (
              <tr key={account.id}>
                <RowTitle meta={account.id.slice(0, 8)}>{account.name}</RowTitle>
                <td className="p-num">
                  {formatMoney(account.ceiling, account.currency)}
                </td>
                <td className="p-num">{formatMoney(account.settled, account.currency)}</td>
                <td className="p-num">{formatMoney(account.reserved, account.currency)}</td>
                <td>
                  <StatusBadge value={account.enabled ? "enabled" : "disabled"} />
                </td>
                <td className="p-table-action">
                  {admin && (
                    <Action variant="ghost" size="sm" onClick={() => setDialog({ ceiling: account.id })}>
                      {t("amend")}
                    </Action>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title={t("noProviders")} icon={<SlidersHorizontal />}>
            <p>{t("noProvidersHelp")}</p>
          </EmptyState>
        )}
      </section>

      <section className="p-section">
        <SectionHeading
          title={t("modelRevisions")}
          actions={
            admin && (
              <span className="p-row">
                <Action variant="ghost" onClick={() => setDialog("price")} disabled={!data.revisions.length}>
                  {t("registerPrice")}
                </Action>
                <Action variant="secondary" onClick={() => setDialog("model")} disabled={!data.accounts.length}>
                  <Plus aria-hidden="true" />
                  {t("registerRevision")}
                </Action>
              </span>
            )
          }
        >
          {t("modelRevisionsHelp")}
        </SectionHeading>
        {(() => {
          // €0 guard (spec v2 §6.4, G9): paid models without a price cannot serve customers.
          const zero = data.revisions.filter((revision) => !revision.retired_at && !revision.free_model && revision.price_issue === "MODEL_PRICE_ZERO");
          return zero.length ? (
            <Status tone="warn" action={<Link href="/ops/platform/billing?view=price-book">{t("billingOpsOpenPriceBook")}</Link>}>{tv("zeroPriceModelsWarning", { count: zero.length })}</Status>
          ) : null;
        })()}
        {data.revisions.length ? (
          <DataTable caption={t("modelRevisions")} headers={[t("model"), t("rolesLabel"), { label: t("limitsLabel"), align: "end" }, t("apiKey"), t("health"), { label: t("actions"), align: "end", hidden: true }]}>
            {data.revisions.map((revision) => {
              const keys = keyFor(revision.id);
              return (
                <tr key={revision.id}>
                  <RowTitle
                    meta={`${adapterLabel(revision.adapter)} · ${revision.endpoint_host} · ${revision.id.slice(0, 8)} · ${revision.price ? perMillion(revision.price) : t("noPrice")}`}
                  >
                    {revision.model_id}
                  </RowTitle>
                  <td className="p-cell-meta">
                    {revision.roles.map(humanize).join(", ")}
                    <span className="p-cell-note">
                      {revision.free_model ? (
                        <Badge>{t("engineFreeModel")}</Badge>
                      ) : revision.price_issue ? (
                        <Badge tone="warn" dot>{t(revision.price_issue === "MODEL_PRICE_ZERO" ? "enginePriceZero" : "engineRateMissing")}</Badge>
                      ) : revision.credit_rate ? (
                        tv("engineCreditRate", { input: String(Number(BigInt(revision.credit_rate.input) / BigInt(1_000_000))), output: String(Number(BigInt(revision.credit_rate.output) / BigInt(1_000_000))) })
                      ) : null}
                    </span>
                  </td>
                  <td className="p-num p-cell-meta">
                    {revision.context_limit.toLocaleString()} / {revision.output_limit.toLocaleString()}
                  </td>
                  <td>
                    {revision.adapter === "dgx" ? (
                      <Badge>{t("privateRoute")}</Badge>
                    ) : keys.length ? (
                      <Badge tone="pass" dot>
                        {t("keyStored")} · v{keys[0].versions}
                      </Badge>
                    ) : (
                      <Badge tone="warn" dot>
                        {t("noKey")}
                      </Badge>
                    )}
                  </td>
                  <td>
                    <StatusBadge value={revision.retired_at ? "retired" : revision.health ?? "unprobed"} />
                    {revision.last_probe_at && (
                      <span className="p-cell-meta p-cell-note">
                        <Time value={revision.last_probe_at} />
                      </span>
                    )}
                  </td>
                  <td className="p-table-action">
                    {admin && !revision.retired_at && (
                      <ActionMenu
                        label={`${t("actions")}: ${revision.model_id}`}
                        items={[
                          ...(revision.adapter === "dgx"
                            ? (["text", "json_object", "tools"] as const).map((kind) => ({
                                label: `${t("probe")} ${kind.replace("_object", "")}`,
                                onSelect: () => void run(() => evalRequest("/inference/probes", "POST", { orgId, providerRevisionId: revision.id, kind }), t("probeQueued")),
                              }))
                            : [
                                { label: keys.length ? t("rotateKey") : t("addKey"), icon: <KeyRound />, onSelect: () => setDialog({ key: revision.id }) },
                                ...keys.map((key) => ({
                                  label: `${t("revokeKey")} (v${key.versions})`,
                                  tone: "danger" as const,
                                  onSelect: () => void run(() => evalRequest(`/providers/keys/${key.id}?orgId=${orgId}`, "DELETE"), t("keyRevoked")).then((ok) => ok && void load()),
                                })),
                              ]),
                        ]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState compact title={t("noModels")} />
        )}
      </section>

      <section className="p-section">
        <SectionHeading
          title={t("modelRoutes")}
          actions={
            admin && (
              <Action variant="secondary" onClick={() => setDialog("route")} disabled={!data.revisions.some((item) => item.adapter === "dgx" && item.price)}>
                {t("setRoute")}
              </Action>
            )
          }
        >
          {t("modelRoutesHelp")}
        </SectionHeading>
        {routes.length ? (
          <DataTable caption={t("modelRoutes")} headers={[t("workspace"), t("roleLabel"), t("model"), t("dataPolicy")]}>
            {routes.map((route) => (
              <tr key={`${route.org_id}-${route.role}`}>
                <RowTitle>{route.workspace}</RowTitle>
                <td>{humanize(route.role)}</td>
                <td className="p-cell-meta">{model(route.provider_revision_id)}</td>
                <td className="p-cell-meta">
                  {humanize(route.data_class)} · {humanize(route.region)}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState compact title={t("noRoutes")} />
        )}
      </section>

      <Modal

        alert={messages}
        open={dialog === "account"}
        onOpenChange={(value) => !value && close()}
        title={t("addProviderAccount")}
        description={t("addProviderAccountHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={close}>{t("cancel")}</Action>
            <Action type="submit" form="account-create-form" disabled={pending}>{t("addProviderAccount")}</Action>
          </>
        }
      >
        <form id="account-create-form" className="p-stack" onSubmit={registerAccount}>
          <Field id="account-name" name="name" label={t("name")} placeholder="OpenAI (Caudals)" required maxLength={120} />
          <div className="p-grid-2 p-form-grid">
            <Field id="account-currency" name="currency" label={t("currency")} defaultValue="EUR" required pattern="[A-Za-z]{3}" />
            <Field id="account-new-ceiling" name="ceiling" label={t("ceiling")} defaultValue="100" required inputMode="decimal" hint={t("accountCeilingHint")} />
          </div>
          <Check name="enabled" label={t("routingEnabled")} description={t("accountEnabledHint")} />
        </form>
      </Modal>

      <Modal

        alert={messages}
        open={dialog === "model"}
        onOpenChange={(value) => !value && close()}
        size="lg"
        title={t("registerRevision")}
        description={t("registerRevisionHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={close}>{t("cancel")}</Action>
            <Action type="submit" form="model-form" disabled={pending}>{t("registerRevision")}</Action>
          </>
        }
      >
        <form id="model-form" className="p-stack" onSubmit={registerRevision}>
          <div className="p-grid-2 p-form-grid">
            <SelectField id="rev-account" name="accountId" label={t("account")} required>
              {data.accounts.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </SelectField>
            <SelectField id="rev-adapter" name="adapter" label={t("adapter")} value={adapter} onChange={(event) => setAdapter(event.target.value)}>
              <option value="dgx">{t("adapterDgxPrivate")}</option>
              <option value="openai_compatible">{t("adapterOpenAiHttps")}</option>
            </SelectField>
            {adapter !== "dgx" && <Field id="rev-endpoint" name="endpoint" type="url" label={t("endpointHttps")} placeholder="https://api.example.com/v1" required />}
            <Field id="rev-model" name="modelId" label={t("modelId")} required />
            <Field id="rev-context" name="contextLimit" type="number" label={t("contextLimit")} defaultValue="8192" required />
            <Field id="rev-output" name="outputLimit" type="number" label={t("outputLimit")} defaultValue="1024" required />
            <Field id="rev-classes" name="dataClasses" label={t("dataClasses")} defaultValue="synthetic" required />
            <Field id="rev-regions" name="regions" label={t("regions")} defaultValue={adapter === "dgx" ? "private_wireguard" : "eu"} required />
            <Field id="rev-concurrency" name="concurrencyLimit" type="number" min={1} max={16} label={t("concurrency")} defaultValue="1" />
            <Field id="rev-rpm" name="rpm" type="number" label="RPM" defaultValue="60" />
            <Field id="rev-tpm" name="tpm" type="number" label="TPM" defaultValue="1000000" />
          </div>
          <fieldset className="p-fieldset p-checks p-checks-grid">
            <legend>{t("rolesLabel")}</legend>
            {ROLES.map((role) => (
              <Check key={role} name={`role-${role}`} label={humanize(role)} />
            ))}
          </fieldset>
          <fieldset className="p-fieldset p-checks p-checks-grid">
            <legend>{t("verifiedCapabilities")}</legend>
            {CAPABILITIES.map((capability) => (
              <Check key={capability} name={`cap-${capability}`} label={capability} />
            ))}
          </fieldset>
          {adapter !== "dgx" && <p className="p-field-hint">{t("commercialKeyAfter")}</p>}
        </form>
      </Modal>

      <Modal

        alert={messages}
        open={dialog === "price"}
        onOpenChange={(value) => !value && close()}
        title={t("registerPrice")}
        description={t("registerPriceHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={close}>{t("cancel")}</Action>
            <Action type="submit" form="price-form" disabled={pending}>{t("registerPrice")}</Action>
          </>
        }
      >
        <form id="price-form" className="p-stack" onSubmit={registerPrice}>
          <SelectField id="price-model" name="providerRevisionId" label={t("model")} required>
            {data.revisions.map((item) => (
              <option key={item.id} value={item.id}>{model(item.id)}</option>
            ))}
          </SelectField>
          <div className="p-grid-2 p-form-grid">
            <Field id="price-currency" name="currency" label={t("currency")} defaultValue="EUR" required pattern="[A-Za-z]{3}" />
            <Field id="price-uncertainty" name="uncertaintyBps" type="number" min={0} max={10000} label={t("uncertaintyBps")} defaultValue="1000" />
            {(["inputPrice", "outputPrice", "cachePrice", "toolPrice"] as const).map((name) => (
              <Field key={name} id={`price-${name}`} name={name} label={t(name)} defaultValue="0" required inputMode="decimal" />
            ))}
          </div>
          <Field id="price-source" name="source" label={t("priceSource")} required placeholder={t("priceSourcePlaceholder")} />
        </form>
      </Modal>

      <Modal

        alert={messages}
        open={dialog === "route"}
        onOpenChange={(value) => !value && close()}
        title={t("setRoute")}
        description={t("modelRoutesHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={close}>{t("cancel")}</Action>
            <Action type="submit" form="route-form" disabled={pending}>{t("saveRoute")}</Action>
          </>
        }
      >
        <form id="route-form" className="p-stack" onSubmit={saveRoute}>
          <SelectField id="route-workspace" name="routeOrgId" label={t("workspace")} defaultValue={orgId}>
            {workspaces.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </SelectField>
          <div className="p-grid-2 p-form-grid">
            <SelectField id="route-role" name="role" label={t("roleLabel")}>
              {["context_analyzer", "generator", "judge", "report_writer"].map((role) => (
                <option key={role} value={role}>{humanize(role)}</option>
              ))}
            </SelectField>
            <SelectField id="route-model" name="providerRevisionId" label={t("model")} required>
              {data.revisions
                .filter((item) => item.adapter === "dgx" && !item.retired_at && item.price)
                .map((item) => (
                  <option key={item.id} value={item.id}>{model(item.id)}</option>
                ))}
            </SelectField>
            <Field id="route-class" name="dataClass" label={t("dataClass")} defaultValue="synthetic" required />
            <Field id="route-region" name="region" label={t("region")} defaultValue="private_wireguard" required />
          </div>
          <Field id="route-cost" name="internalCostPerSecond" label={t("internalCostPerSecond")} defaultValue="0.0001" required inputMode="decimal" />
        </form>
      </Modal>

      <Modal

        alert={messages}
        open={!!keyDialog}
        onOpenChange={(value) => !value && close()}
        size="sm"
        title={keyDialog && keyFor(keyDialog.id).length ? t("rotateKey") : t("addKey")}
        description={`${keyDialog?.model_id ?? ""} · ${keyDialog?.endpoint_host ?? ""}. ${t("providerKeyHelp")}`}
        footer={
          <>
            <Action variant="secondary" onClick={close}>{t("cancel")}</Action>
            <Action type="submit" form="key-form" disabled={pending}>{t("saveKey")}</Action>
          </>
        }
      >
        {keyDialog && (
          <form id="key-form" autoComplete="off" onSubmit={(event) => void saveKey(event, keyDialog.id)}>
            <Field id="provider-key" name="value" type="password" label={t("providerKey")} autoComplete="new-password" required minLength={8} hint={t("providerKeyWriteOnly")} />
          </form>
        )}
      </Modal>

      <Modal

        alert={messages}
        open={!!accountDialog}
        onOpenChange={(value) => !value && close()}
        title={`${t("amend")} ${accountDialog?.name ?? ""}`}
        description={t("amendmentHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={close}>{t("cancel")}</Action>
            <Action type="submit" form="account-form" disabled={pending}>{t("save")}</Action>
          </>
        }
      >
        {accountDialog && (
          <form id="account-form" className="p-stack" onSubmit={(event) => void amendAccount(event, accountDialog.id, accountDialog.currency)}>
            <Field id="account-ceiling" name="ceiling" label={`${t("ceiling")} (${accountDialog.currency})`} defaultValue={money(accountDialog.ceiling)} required inputMode="decimal" />
            <Check name="enabled" defaultChecked={accountDialog.enabled} label={t("routingEnabled")} />
            <Field id="account-reason" name="reason" label={t("amendmentReason")} required minLength={3} />
          </form>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------ inference --- */

function Inference() {
  const { orgId } = useWorkspace();
  const [now] = useState(() => Date.now());
  const [data, setData] = useState<{
    health: Array<{ id: string; adapter: string; model_id: string; roles: string[]; state: string | null; last_probe_at: string | null; circuit_until: string | null; active_slots: number; calls_24h: number; avg_seconds_24h: number | null }>;
    probes: Array<{ id: string; status: string; reason_code: string | null; created_at: string; provider_revision_id: string; kind: string; evidence: { status: string } | null }>;
  } | null>(null);
  useEffect(() => {
    if (orgId) void evalRequest<NonNullable<typeof data>>(`/inference?orgId=${orgId}`).then(setData).catch(() => setData({ health: [], probes: [] }));
  }, [orgId]);
  if (!data) return <TableSkeleton columns={6} />;
  const calls = data.health.reduce((sum, row) => sum + row.calls_24h, 0);
  const open = data.health.filter((row) => row.circuit_until && Date.parse(row.circuit_until) > now).length;
  return (
    <>
      <StatGrid>
        <Stat label={t("models")} value={data.health.length} />
        <Stat label={t("calls24h")} value={calls} />
        <Stat label={t("activeSlots")} value={data.health.reduce((sum, row) => sum + row.active_slots, 0)} />
        <Stat label={t("circuitsOpen")} value={open} meta={open ? t("circuitsOpenHelp") : t("allRoutesAvailable")} />
      </StatGrid>
      <section className="p-section">
        <SectionHeading title={t("inferenceHealth")}>{t("inferenceHelp")}</SectionHeading>
        <DataTable caption={t("inferenceHealth")} headers={[t("model"), t("health"), t("lastProbe"), { label: t("activeSlots"), align: "end" }, { label: t("calls24h"), align: "end" }, { label: t("avgSeconds"), align: "end" }]}>
          {data.health.map((row) => (
            <tr key={row.id}>
              <RowTitle meta={`${adapterLabel(row.adapter)} · ${row.id.slice(0, 8)} · ${row.roles.map(humanize).join(", ")}`}>{row.model_id}</RowTitle>
              <td>
                <StatusBadge value={row.circuit_until && Date.parse(row.circuit_until) > now ? "circuit_open" : row.state ?? "unprobed"} />
              </td>
              <td className="p-cell-meta">
                <Time value={row.last_probe_at} />
              </td>
              <td className="p-num">{row.active_slots}</td>
              <td className="p-num">{row.calls_24h}</td>
              <td className="p-num">{row.avg_seconds_24h ?? "—"}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <section className="p-section">
        <SectionHeading title={t("recentProbes")}>{t("recentProbesHelp")}</SectionHeading>
        {data.probes.length ? (
          <DataTable caption={t("recentProbes")} headers={[t("probeNoun"), t("statusLabel"), t("capabilityEvidence"), { label: t("createdAt"), align: "end" }]}>
            {data.probes.map((probe) => (
              <tr key={probe.id}>
                <RowTitle meta={probe.provider_revision_id?.slice(0, 8)}>{humanize(probe.kind)}</RowTitle>
                <td>
                  <StatusBadge value={probe.status} />
                </td>
                <td className="p-cell-meta">{probe.evidence?.status ? humanize(probe.evidence.status) : probe.reason_code ? humanize(probe.reason_code) : "—"}</td>
                <td className="p-table-action p-cell-meta">
                  <Time value={probe.created_at} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState compact title={t("noProbes")} />
        )}
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- usage --- */

type UsageData = {
  budgets: Array<{ id: string; kind: string; scope_id: string; currency: string; ceiling: string; settled: string; reserved: string }>;
  entitlement: { max_active_runs: number; monthly_spend_limit: string; currency: string; allowed_connection_types: string[]; can_schedule: boolean; can_export: boolean; review_allowance: number; version: number } | null;
  evaluations: Array<{ id: string; title: string; commercial_cap: string; currency: string }>;
  amendments: Array<{ id: string; target_kind: string; reason: string; actor_id: string; created_at: string; next: Record<string, unknown> }>;
  targetCalls: { calls: number; unknown: number };
};

function Usage({ admin }: { admin: boolean }) {
  const { orgId } = useWorkspace();
  const [data, setData] = useState<UsageData | null>(null);
  const [dialog, setDialog] = useState<"" | "budget" | "entitlement" | { cap: string }>("");
  const { run, pending, messages } = usePlatformAction();
  const load = useCallback(async () => {
    if (orgId) setData(await evalRequest<UsageData>(`/usage?orgId=${orgId}`).catch(() => null));
  }, [orgId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setData(null);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (!data) return <TableSkeleton columns={3} />;
  const workspaceBudget = data.budgets.find((item) => item.kind === "workspace");
  const amend = async (body: Record<string, unknown>) => {
    const ok = await run(() => evalRequest(`/budgets/${orgId}/amendments`, "POST", body), t("amendmentRecorded"));
    if (ok) {
      setDialog("");
      await load();
    }
  };
  const entitlement = data.entitlement;
  const capDialog = typeof dialog === "object" ? data.evaluations.find((item) => item.id === dialog.cap) : undefined;
  return (
    <>
      {dialog === "" && messages}
      <StatGrid>
        <Stat label={t("ceiling")} value={workspaceBudget ? formatMoney(workspaceBudget.ceiling, workspaceBudget.currency) : t("notSet")} meta={t("workspaceBudget")} />
        <Stat label={t("settledSpend")} value={formatMoney(workspaceBudget?.settled ?? "0", workspaceBudget?.currency ?? "EUR")} />
        <Stat label={t("outstandingSpend")} value={formatMoney(workspaceBudget?.reserved ?? "0", workspaceBudget?.currency ?? "EUR")} />
        <Stat label={t("externalTargetCalls")} value={data.targetCalls.calls} meta={countOf(data.targetCalls.unknown, "countUnknownOne", "countUnknown")} />
      </StatGrid>

      <CreditUsage admin={admin} />

      <div className="p-settings p-section">
        <div className="p-setting">
          <div className="p-setting-text">
            <h3>{t("workspaceBudget")}</h3>
            <div className="p-setting-desc">{t("workspaceBudgetHelp")}</div>
          </div>
          <div className="p-setting-control">{admin && <Action variant="secondary" onClick={() => setDialog("budget")}>{t("amendBudget")}</Action>}</div>
        </div>
        {entitlement && (
          <div className="p-setting">
            <div className="p-setting-text">
              <h3>{t("entitlements")}</h3>
              <div className="p-setting-desc">
                {countOf(entitlement.max_active_runs, "countActiveRunsOne", "countActiveRuns")} · {formatMoney(entitlement.monthly_spend_limit, entitlement.currency)} {t("perMonth")} · {countOf(entitlement.review_allowance, "countReviewsOne", "countReviews")} ·{" "}
                {entitlement.allowed_connection_types.map(humanize).join(", ")} · {entitlement.can_schedule ? t("schedulingOn") : t("schedulingOff")} · {entitlement.can_export ? t("exportsOn") : t("exportsOff")}
              </div>
            </div>
            <div className="p-setting-control">{admin && <Action variant="secondary" onClick={() => setDialog("entitlement")}>{t("amendEntitlements")}</Action>}</div>
          </div>
        )}
      </div>

      <section className="p-section">
        <SectionHeading title={t("evaluationCaps")}>{t("evaluationCapsHelp")}</SectionHeading>
        {!data.evaluations.length ? <EmptyState compact title={t("noEvaluationsYet")} /> : <DataTable caption={t("evaluationCaps")} headers={[t("evaluation"), { label: t("ceiling"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
          {data.evaluations.map((evaluation) => (
            <tr key={evaluation.id}>
              <RowTitle>{evaluation.title}</RowTitle>
              <td className="p-num">
                {formatMoney(evaluation.commercial_cap, evaluation.currency)}
              </td>
              <td className="p-table-action">
                {admin && (
                  <Action variant="ghost" size="sm" onClick={() => setDialog({ cap: evaluation.id })}>
                    {t("amend")}
                  </Action>
                )}
              </td>
            </tr>
          ))}
        </DataTable>}
      </section>

      <section className="p-section">
        <SectionHeading title={t("amendmentHistory")} />
        {data.amendments.length ? (
          <DataTable caption={t("amendmentHistory")} headers={[t("changeNoun"), t("amendmentReason"), { label: t("createdAt"), align: "end" }]}>
            {data.amendments.map((item) => (
              <tr key={item.id}>
                <RowTitle meta={amendmentText(item.next)}>{humanize(item.target_kind)}</RowTitle>
                <td>{item.reason}</td>
                <td className="p-table-action p-cell-meta">
                  <Time value={item.created_at} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState compact title={t("noAmendments")} />
        )}
      </section>

      <Modal

        alert={messages}
        open={dialog === "budget"}
        onOpenChange={(value) => !value && setDialog("")}
        title={t("amendBudget")}
        description={t("amendmentHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={() => setDialog("")}>{t("cancel")}</Action>
            <Action type="submit" form="budget-form" disabled={pending}>{t("save")}</Action>
          </>
        }
      >
        <form
          id="budget-form"
          className="p-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void amend({ targetKind: "workspace_budget", ceiling: form.get("ceiling"), currency: form.get("currency"), reason: form.get("reason") });
          }}
        >
          <div className="p-grid-2 p-form-grid">
            <Field id="wb-ceiling" name="ceiling" label={t("newCeiling")} defaultValue={money(workspaceBudget?.ceiling ?? "500")} required inputMode="decimal" />
            <Field id="wb-currency" name="currency" label={t("currency")} defaultValue={workspaceBudget?.currency ?? "EUR"} required />
          </div>
          <Field id="wb-reason" name="reason" label={t("amendmentReason")} required minLength={3} />
        </form>
      </Modal>

      {entitlement && (
        <Modal
          alert={messages}
          open={dialog === "entitlement"}
          onOpenChange={(value) => !value && setDialog("")}
          size="lg"
          title={t("amendEntitlements")}
          description={t("amendmentHelp")}
          footer={
            <>
              <Action variant="secondary" onClick={() => setDialog("")}>{t("cancel")}</Action>
              <Action type="submit" form="entitlement-form" disabled={pending}>{t("save")}</Action>
            </>
          }
        >
          <EntitlementForm id="entitlement-form" entitlement={entitlement} pending={pending} onSubmit={amend} />
        </Modal>
      )}

      <Modal

        alert={messages}
        open={!!capDialog}
        onOpenChange={(value) => !value && setDialog("")}
        size="sm"
        title={`${t("amend")} ${capDialog?.title ?? ""}`}
        description={t("evaluationCapsHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={() => setDialog("")}>{t("cancel")}</Action>
            <Action type="submit" form="cap-form" disabled={pending}>{t("save")}</Action>
          </>
        }
      >
        {capDialog && (
          <form
            id="cap-form"
            className="p-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void amend({ targetKind: "evaluation_cap", targetId: capDialog.id, ceiling: form.get("ceiling"), reason: form.get("reason") });
            }}
          >
            <Field id="cap-ceiling" name="ceiling" label={`${t("newCeiling")} (${capDialog.currency})`} defaultValue={money(capDialog.commercial_cap)} required inputMode="decimal" />
            <Field id="cap-reason" name="reason" label={t("amendmentReason")} required minLength={3} />
          </form>
        )}
      </Modal>
    </>
  );
}

/* --------------------------------------------------------- credit usage --- */

type CreditUsageData = {
  month: string;
  totals: { sold: string; soldNetCents: number; granted: string; consumed: string; held: string; expired: string; available: string; shadowCharged: string };
  workspaces: Array<{ orgId: string; workspace: string; plan: string | null; billingMode: string; frozen: boolean; available: string; held: string; sold: string; soldNetCents: number;
    granted: string; consumed: string; returned: string; refunded: string; expired: string; shadowCharged: string }>;
};

/** Credits sold, consumed, held and expired per workspace (launch L-16, spec §5.3). Platform-wide; amounts only. */
function CreditUsage({ admin }: { admin: boolean }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<CreditUsageData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void evalRequest<CreditUsageData>(`/billing/admin/usage?month=${month}`).then(next => { setData(next); setFailed(false); }).catch(() => setFailed(true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [month]);
  return (
    <section className="p-section">
      <SectionHeading title={`${t("billingOpsCreditUsage")} · ${t("allWorkspaces")}`} actions={
        <Field id="credit-usage-month" label={t("billingOpsMonth")} type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
      }>{t("billingOpsCreditUsageHelp")}</SectionHeading>
      {failed ? <Status error>{t("error")}</Status> : !data ? <TableSkeleton columns={6} /> : (
        <>
          <StatGrid>
            <Stat label={t("billingOpsSold")} value={fmtCredits(data.totals.sold)} meta={euros(data.totals.soldNetCents)} />
            <Stat label={t("billingOpsConsumed")} value={fmtCredits(data.totals.consumed)} meta={tv("billingOpsShadowCharged", { credits: fmtCredits(data.totals.shadowCharged) })} />
            <Stat label={t("billingOpsHeld")} value={fmtCredits(data.totals.held)} meta={tv("billingOpsAvailableCredits", { credits: fmtCredits(data.totals.available) })} />
            <Stat label={t("billingOpsExpired")} value={fmtCredits(data.totals.expired)} meta={tv("billingOpsGrantedCredits", { credits: fmtCredits(data.totals.granted) })} />
          </StatGrid>
          {!data.workspaces.length ? <EmptyState compact title={t("billingOpsNoCreditActivity")} /> : (
            <DataTable caption={t("billingOpsCreditUsage")} headers={[t("workspace"), { label: t("billingOpsSold"), align: "end" }, { label: t("billingOpsConsumed"), align: "end" }, { label: t("billingOpsHeld"), align: "end" }, { label: t("billingOpsExpired"), align: "end" }, { label: t("billingOpsAvailable"), align: "end" }]}>
              {data.workspaces.map(row => (
                <tr key={row.orgId}>
                  <RowTitle href={admin ? accountHref(row.orgId) : undefined} meta={[...new Set([planLabel(row.plan), humanize(row.billingMode)]), row.frozen && t("billingOpsFrozen")].filter(Boolean).join(" · ")}>{row.workspace}</RowTitle>
                  <td className="p-num">{fmtCredits(row.sold)}{row.soldNetCents ? <span className="p-cell-meta p-cell-note">{euros(row.soldNetCents)}</span> : null}</td>
                  <td className="p-num">{fmtCredits(row.consumed)}{Number(row.shadowCharged) ? <span className="p-cell-meta p-cell-note">{tv("billingOpsShadowShort", { credits: fmtCredits(row.shadowCharged) })}</span> : null}</td>
                  <td className="p-num">{fmtCredits(row.held)}</td>
                  <td className="p-num">{fmtCredits(row.expired)}</td>
                  <td className="p-num">{fmtCredits(row.available)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- accounts --- */

function Accounts({ admin }: { admin: boolean }) {
  const [data, setData] = useState<{ platformRoles: Array<{ user_id: string; email: string; name: string; role: string }>; memberships: Array<{ org_id: string; workspace: string; user_id: string; email: string; role: string; created_at: string }> } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (admin) void evalRequest<NonNullable<typeof data>>("/accounts").then(setData).catch(() => setError(t("error")));
  }, [admin]);
  if (!admin) return <Status>{t("accountsAdminOnly")}</Status>;
  if (error) return <Status error>{error}</Status>;
  if (!data) return <TableSkeleton columns={3} />;
  return (
    <>
      <section>
        <SectionHeading title={t("platformRoles")}>{t("platformRolesHelp")}</SectionHeading>
        <DataTable caption={t("platformRoles")} headers={[t("account"), { label: t("roleLabel"), align: "end" }]}>
          {data.platformRoles.map((row) => (
            <tr key={row.user_id}>
              <RowTitle meta={row.name}>{row.email}</RowTitle>
              <td className="p-table-action">
                <Badge tone={row.role === "platform_admin" ? "strong" : "neutral"}>{roleName(row.role)}</Badge>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
      <section className="p-section">
        <SectionHeading title={t("workspaceMembers")} />
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} label={t("searchMembers")} />
        </Toolbar>
        <DataTable caption={t("workspaceMembers")} headers={[t("account"), t("workspace"), t("roleLabel"), { label: t("joined"), align: "end" }]}>
          {data.memberships.filter((row) => !query.trim() || `${row.email} ${row.workspace}`.toLowerCase().includes(query.trim().toLowerCase())).map((row) => (
            <tr key={`${row.org_id}-${row.user_id}`}>
              <RowTitle>{row.email}</RowTitle>
              <td>{row.workspace}</td>
              <td><Badge>{roleName(row.role)}</Badge></td>
              <td className="p-table-action p-cell-meta">
                <Time value={row.created_at} withTime={false} />
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- audit --- */

function Audit() {
  const { orgId } = useWorkspace();
  const [rows, setRows] = useState<Array<{ id: string; actor_id: string; action: string; subject_id: string; created_at: string }> | null>(null);
  const [action, setAction] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRows(null);
      if (orgId) void evalRequest<NonNullable<typeof rows>>(`/audit?orgId=${orgId}`).then(setRows).catch(() => setRows([]));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [orgId]);
  async function older() {
    const last = rows?.at(-1);
    if (!last) return;
    const next = await evalRequest<NonNullable<typeof rows>>(`/audit?orgId=${orgId}&before=${encodeURIComponent(new Date(last.created_at).toISOString())}`).catch(() => []);
    setRows((current) => [...(current ?? []), ...next]);
  }
  const actionLabel = (value: string) => humanize(value.replaceAll(".", "_"));
  const actions = [...new Set((rows ?? []).map((row) => row.action))].sort();
  const visible = (rows ?? []).filter((row) => !action || row.action === action);
  const body: ReactNode = !rows ? (
    <TableSkeleton columns={4} />
  ) : rows.length ? (
    <>
      <Toolbar>
        <InlineSelect id="audit-action" label={t("auditFilterAction")} value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="">{t("auditAllActions")}</option>
          {actions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}
        </InlineSelect>
      </Toolbar>
      <DataTable caption={t("auditLog")} headers={[t("action"), t("account"), t("subject"), { label: t("createdAt"), align: "end" }]}>
        {visible.map((row) => (
          <tr key={row.id}>
            <RowTitle>{actionLabel(row.action)}</RowTitle>
            <td className="p-cell-meta">
              <code className="p-code" title={row.actor_id}>{row.actor_id.slice(0, 12)}</code>
            </td>
            <td className="p-cell-meta">
              <code className="p-code" title={row.subject_id}>{row.subject_id.slice(0, 8)}</code>
            </td>
            <td className="p-table-action p-cell-meta">
              <time dateTime={row.created_at}>{formatDate(row.created_at, true)}</time>
            </td>
          </tr>
        ))}
      </DataTable>
      {rows.length % 100 === 0 && (
        <div className="p-row p-section">
          <Action variant="secondary" onClick={() => void older()}>
            {t("loadOlder")}
          </Action>
        </div>
      )}
    </>
  ) : (
    <EmptyState compact title={t("noAudit")} />
  );
  return (
    <>
      <p className="p-field-hint p-intro">{t("auditHelp")}</p>
      {body}
    </>
  );
}
