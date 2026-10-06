"use client";

/**
 * Settings → AI models. Chooses the model behind each engine task (reading
 * sources, drafting tests, grading, writing report takeaways) for every
 * workspace or for this one, from the private DGX Spark or any
 * OpenAI-compatible API. Platform administrators only; keys are write-only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Cpu, FileSearch, Globe, KeyRound, PenLine, Plus, RotateCcw, Scale, Search, Trash2, Zap } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, Badge, Check, Chip, DataTable, Field, RowTitle, Section, SelectField, Status, Switch, Tabs } from "./primitives";
import { ActionMenu, Modal, notify } from "./overlays";
import { useReauth } from "./reauth";
import { t, tv } from "@/lib/evals/messages/en";
import { DemoModelSettings } from "./demo-model-settings";

type Role = "context_analyzer" | "generator" | "judge" | "report_writer";
type Connection = { id: string; name: string; adapter: "dgx" | "openai_compatible"; host: string; key_hint: string | null; enabled: boolean; has_key: boolean };
type Route = { role: Role; provider_revision_id: string; model_id: string; adapter: string; account_id: string; account_name: string; context_limit: number; input_price: string; output_price: string; currency: string; updated_at: string; usable: boolean; web_research: boolean; web_capable: boolean };
type SearchEngineId = "tavily" | "exa";
type SearchEngineRow = { engine: SearchEngineId; key_hint: string | null; priority: number; enabled: boolean; updated_at: string };
type Settings = { roles: Role[]; dgxAvailable: boolean; connections: Connection[]; platform: Route[]; workspace: Route[]; searchEngines: SearchEngineRow[] };
type Model = { id: string; label: string; detail: string | null };
type Scope = "platform" | "workspace";

const ROLE_COPY: Record<Role, { title: string; help: string }> = {
  context_analyzer: { title: t("roleContextAnalyzer"), help: t("roleContextAnalyzerHelp") },
  generator: { title: t("roleGenerator"), help: t("roleGeneratorHelp") },
  judge: { title: t("roleJudge"), help: t("roleJudgeHelp") },
  report_writer: { title: t("roleReportWriter"), help: t("roleReportWriterHelp") },
};

/** Roles that can use public web search, and what the web does for each. */
const WEB_ROLES = ["context_analyzer", "generator", "judge"] as const satisfies readonly Role[];
const WEB_ROLE_COPY: Record<(typeof WEB_ROLES)[number], { help: string; Icon: typeof Globe }> = {
  context_analyzer: { help: t("engineWebRoleContext"), Icon: FileSearch },
  generator: { help: t("engineWebRoleGenerator"), Icon: PenLine },
  judge: { help: t("engineWebRoleJudge"), Icon: Scale },
};
const SEARCH_ENGINES: Array<{ id: SearchEngineId; name: string; help: string }> = [
  { id: "tavily", name: "Tavily", help: t("engineWebTavily") },
  { id: "exa", name: "Exa", help: t("engineWebExa") },
];

/** Common OpenAI-compatible base addresses, so nobody has to look them up. */
const PRESETS = [
  { name: "OpenAI", endpoint: "https://api.openai.com/v1" },
  { name: "Anthropic", endpoint: "https://api.anthropic.com/v1" },
  { name: "Google Gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { name: "Mistral", endpoint: "https://api.mistral.ai/v1" },
  { name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1" },
  { name: "Groq", endpoint: "https://api.groq.com/openai/v1" },
  { name: "DeepSeek", endpoint: "https://api.deepseek.com/v1" },
  { name: "Together", endpoint: "https://api.together.xyz/v1" },
];

/** Per-token EUR (nine decimals) → EUR per million tokens for display. */
const perMillion = (value: string) => {
  const number = Number(value) * 1_000_000;
  return number === 0 ? "0" : number.toFixed(number < 1 ? 3 : 2).replace(/\.?0+$/, "");
};

function useAction() {
  const [error, setError] = useState<{ message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const reauth = useReauth();
  const { confirm } = reauth;
  const run = useCallback(async (work: () => Promise<unknown>, done?: string) => {
    setPending(true);
    setError(null);
    try {
      try {
        await work();
      } catch (reason) {
        // A sensitive change asks for a fresh confirmation: confirm in place, then retry once.
        if (!(reason instanceof EvalRequestError && reason.code === "REAUTHENTICATION_REQUIRED") || !(await confirm())) throw reason;
        await work();
      }
      if (done) notify(done);
      return true;
    } catch (reason) {
      setError({ message: reason instanceof Error ? reason.message : t("error") });
      return false;
    } finally {
      setPending(false);
    }
  }, [confirm]);
  const message = (
    <>
      {reauth.dialog}
      {error ? <Status error>{error.message}</Status> : null}
    </>
  );
  return { run, pending, message, clear: () => setError(null) };
}

export function EngineSettings({ orgId, workspaceName }: { orgId: string; workspaceName: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scope, setScope] = useState<Scope>("platform");
  const [editing, setEditing] = useState<Role | null>(null);
  const [adding, setAdding] = useState(false);
  const [keyFor, setKeyFor] = useState<Connection | null>(null);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const load = useAction();
  const action = useAction();

  const reload = useCallback(() => load.run(async () => setSettings(await evalRequest<Settings>(`/engine?orgId=${encodeURIComponent(orgId)}`))), [load, orgId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), [orgId]);

  if (!settings) return load.message ?? <p className="p-loading" role="status"><span className="p-spinner" aria-hidden="true" />{t("loading")}</p>;

  const effective = (role: Role) => {
    const own = settings.workspace.find((item) => item.role === role && item.usable);
    const platform = settings.platform.find((item) => item.role === role && item.usable);
    return scope === "workspace" ? { route: own ?? platform ?? null, inherited: !own && !!platform } : { route: platform ?? null, inherited: false };
  };
  const missing = settings.roles.filter((role) => !settings.platform.some((item) => item.role === role && item.usable));

  return (
    <div className="p-stack eval-engine-settings">
      {load.message}
      {action.message}
      {missing.length > 0 && scope === "platform" && <Status>{t("engineMissingDefaults")}</Status>}
      <Section
        title={t("engineTasks")}
        description={scope === "platform" ? t("engineTasksPlatformHelp") : `${t("engineTasksWorkspaceHelp")} ${workspaceName}.`}
        actions={
          <Tabs
            variant="pill"
            value={scope}
            onChange={setScope}
            label={t("engineScope")}
            options={[
              { value: "platform", label: t("engineScopePlatform") },
              { value: "workspace", label: t("engineScopeWorkspace") },
            ]}
          />
        }
      >
        <DataTable caption={t("engineTasks")} headers={[t("engineTask"), t("engineModel"), { label: t("actions"), align: "end", hidden: true }]}>
          {settings.roles.map((role) => {
            const { route, inherited } = effective(role);
            return (
              <tr key={role}>
                <RowTitle meta={ROLE_COPY[role].help}>{ROLE_COPY[role].title}</RowTitle>
                <td>
                  {route ? (
                    <span className="p-stack p-stack-tight">
                      <span className="p-row p-nowrap">
                        {route.adapter === "dgx" ? <Cpu aria-hidden="true" width={14} /> : <Globe aria-hidden="true" width={14} />}
                        <strong>{route.model_id}</strong>
                        {inherited && <Badge>{t("engineInherited")}</Badge>}
                        {route.web_research && <Badge tone="info"><Globe aria-hidden="true" width={12} />{t("engineWebBadge")}</Badge>}
                        {scope === "workspace" && !inherited && <Badge tone="info">{t("engineOverride")}</Badge>}
                      </span>
                      <span className="p-cell-meta">
                        {route.account_name} · {Math.round(route.context_limit / 1000)}k {t("engineContext")}
                        {route.adapter !== "dgx" && ` · €${perMillion(route.input_price)} / €${perMillion(route.output_price)} ${t("enginePerMillion")}`}
                      </span>
                    </span>
                  ) : (
                    <Badge tone="warn" dot>{t("engineNotSet")}</Badge>
                  )}
                </td>
                <td className="p-table-action">
                  <span className="p-row p-nowrap">
                    {scope === "workspace" && !inherited && route && (
                      <Action
                        variant="ghost"
                        size="sm"
                        disabled={action.pending}
                        onClick={() => void action.run(async () => { await evalRequest(`/engine/routes?orgId=${encodeURIComponent(orgId)}&role=${role}`, "DELETE"); await reload(); }, t("engineReset"))}
                      >
                        <RotateCcw aria-hidden="true" />
                        {t("engineUseDefault")}
                      </Action>
                    )}
                    <Action variant="secondary" size="sm" onClick={() => setEditing(role)} disabled={!settings.connections.length}>
                      {t("change")}
                    </Action>
                  </span>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Section>

      <WebResearch orgId={orgId} scope={scope} engines={settings.searchEngines} effective={effective} action={action} reload={reload} />

      <DemoModelSettings key={orgId} orgId={orgId} />

      <Section
        title={t("engineProviders")}
        description={t("engineProvidersHelp")}
        actions={
          <Action variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            {t("engineAddProvider")}
          </Action>
        }
      >
        <DataTable caption={t("engineProviders")} headers={[t("engineProvider"), t("engineKey"), { label: t("actions"), align: "end", hidden: true }]}>
          {settings.connections.map((connection) => (
            <tr key={connection.id}>
              <RowTitle meta={connection.host}>
                <span className="p-row p-nowrap">
                  {connection.adapter === "dgx" ? <Cpu aria-hidden="true" width={14} /> : <Globe aria-hidden="true" width={14} />}
                  {connection.name}
                </span>
              </RowTitle>
              <td>
                {connection.adapter === "dgx" ? (
                  <Badge tone="pass" dot>{t("engineNoKeyNeeded")}</Badge>
                ) : connection.has_key ? (
                  <span className="p-cell-meta">{connection.key_hint ?? t("engineKeySaved")}</span>
                ) : (
                  <Badge>{t("engineNoKey")}</Badge>
                )}
              </td>
              <td className="p-table-action">
                {connection.adapter !== "dgx" && (
                  <ActionMenu
                    label={t("moreActions")}
                    items={[
                      { label: t("engineReplaceKey"), icon: <KeyRound />, onSelect: () => setKeyFor(connection) },
                      { separator: true },
                      { label: t("engineRemoveProvider"), icon: <Trash2 />, tone: "danger", onSelect: () => setRemoving(connection) },
                    ]}
                  />
                )}
              </td>
            </tr>
          ))}
        </DataTable>
        {!settings.dgxAvailable && <p className="p-field-hint">{t("engineDgxUnavailable")}</p>}
      </Section>

      {editing && (
        <RouteDialog
          key={`${editing}-${scope}`}
          orgId={orgId}
          role={editing}
          scope={scope}
          workspaceName={workspaceName}
          connections={settings.connections}
          current={effective(editing).route}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      <AddProviderDialog open={adding} orgId={orgId} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); await reload(); }} />
      {keyFor && <ReplaceKeyDialog orgId={orgId} connection={keyFor} onClose={() => setKeyFor(null)} onSaved={async () => { setKeyFor(null); await reload(); }} />}
      <Modal
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("engineRemoveProvider")}
        description={removing ? `${removing.name} · ${removing.host}. ${t("engineRemoveHelp")}` : undefined}
        alert={action.message}
        size="sm"
        footer={
          <>
            <Action variant="secondary" onClick={() => setRemoving(null)}>{t("cancel")}</Action>
            <Action
              variant="danger"
              disabled={action.pending}
              onClick={() => removing && void action.run(async () => {
                await evalRequest(`/engine/connections/${removing.id}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
                setRemoving(null);
                await reload();
              }, t("engineProviderRemoved"))}
            >
              {action.pending ? t("working") : t("remove")}
            </Action>
          </>
        }
      />
    </div>
  );
}

function RouteDialog({
  orgId, role, scope, workspaceName, connections, current, onClose, onSaved,
}: {
  orgId: string; role: Role; scope: Scope; workspaceName: string; connections: Connection[]; current: Route | null;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const initialConnection = connections.find((item) => item.id === current?.account_id) ?? connections.find((item) => item.adapter === (current?.adapter ?? "dgx")) ?? connections[0];
  const [connectionId, setConnectionId] = useState(initialConnection?.id ?? "");
  const [models, setModels] = useState<Model[] | null>(null);
  const [modelId, setModelId] = useState(current?.model_id ?? "");
  const [filter, setFilter] = useState("");
  const [allRoles, setAllRoles] = useState(false);
  const [inputPrice, setInputPrice] = useState(current && current.adapter !== "dgx" ? perMillion(current.input_price) : "0");
  const [outputPrice, setOutputPrice] = useState(current && current.adapter !== "dgx" ? perMillion(current.output_price) : "0");
  const [contextLimit, setContextLimit] = useState("");
  const [test, setTest] = useState<{ ok: boolean; message: string; latencyMs: number } | null>(null);
  const listing = useAction();
  const saving = useAction();
  const connection = connections.find((item) => item.id === connectionId);
  const commercial = connection?.adapter === "openai_compatible";

  // Only the latest request may fill the list: a slow answer from the
  // previously selected provider must never replace it or pick a model.
  const request = useRef(0);
  useEffect(() => {
    if (!connectionId) return;
    const ticket = ++request.current;
    setModels(null);
    setTest(null);
    void listing.run(async () => {
      const list = await evalRequest<Model[]>(`/engine/models?orgId=${encodeURIComponent(orgId)}&connectionId=${encodeURIComponent(connectionId)}`);
      if (ticket === request.current) setModels(list);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, orgId]);

  function chooseConnection(id: string) {
    setConnectionId(id);
    setFilter("");
    // A model is always an explicit choice; keep the current one only on its own provider.
    setModelId(id === current?.account_id ? current.model_id : "");
  }

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = (models ?? []).filter((item) => !needle || item.id.toLowerCase().includes(needle)).slice(0, 300);
    // The chosen model stays visible whatever the filter says.
    const chosen = (models ?? []).find((item) => item.id === modelId);
    return chosen && !list.includes(chosen) ? [chosen, ...list] : list;
  }, [models, filter, modelId]);

  async function runTest() {
    setTest(null);
    await listing.run(async () => setTest(await evalRequest(`/engine/test`, "POST", { orgId, connectionId, modelId })));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await saving.run(async () => {
      await evalRequest(`/engine/routes`, "PUT", {
        orgId, scope, role, connectionId, modelId: modelId.trim(), allRoles,
        ...(commercial ? { inputPrice: inputPrice || "0", outputPrice: outputPrice || "0" } : {}),
        ...(contextLimit ? { contextLimit: Number(contextLimit) } : {}),
      });
      await onSaved();
    }, t("engineSaved"));
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${t("engineChooseModel")} · ${ROLE_COPY[role].title}`}
      description={scope === "platform" ? t("engineAppliesPlatform") : `${t("engineAppliesWorkspace")} ${workspaceName}.`}
      alert={saving.message ?? listing.message}
      footer={
        <>
          <Action variant="secondary" onClick={runTest} disabled={!modelId || listing.pending}>
            <Zap aria-hidden="true" />
            {t("engineTest")}
          </Action>
          <Action type="submit" form="engine-route" disabled={!modelId.trim() || saving.pending}>
            {saving.pending ? t("saving") : t("save")}
          </Action>
        </>
      }
    >
      <form id="engine-route" className="p-stack" onSubmit={save}>
        <SelectField id="engine-connection" label={t("engineProvider")} value={connectionId} onChange={(event) => chooseConnection(event.target.value)}>
          {connections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.host}
            </option>
          ))}
        </SelectField>
        {models === null ? (
          <p className="p-loading" role="status"><span className="p-spinner" aria-hidden="true" />{t("engineLoadingModels")}</p>
        ) : models.length > 12 ? (
          <Field id="engine-filter" label={t("engineFilterModels")} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="gpt, claude, llama…" autoComplete="off" />
        ) : null}
        {models && models.length > 0 ? (
          <fieldset className="p-fieldset">
            <legend>{t("engineModel")}</legend>
            <div role="radiogroup" aria-label={t("engineModel")} style={{ maxHeight: 264, overflowY: "auto", display: "grid", gap: 2 }}>
              {visible.map((item) => (
                <label key={item.id} className="p-check" data-selected={item.id === modelId ? "true" : undefined} style={{ padding: "6px 8px", borderRadius: 6, background: item.id === modelId ? "var(--p-surface-3)" : undefined }}>
                  <input type="radio" name="engine-model" value={item.id} checked={item.id === modelId} onChange={() => setModelId(item.id)} />
                  <span>
                    <span className="p-check-label">{item.label}</span>
                    {item.detail && <span className="p-check-desc">{item.detail}</span>}
                  </span>
                </label>
              ))}
              {!visible.length && <p className="p-cell-meta">{t("engineNoMatchingModels")}</p>}
            </div>
            <span className="p-field-hint">{modelId ? `${t("engineSelectedModel")} ${modelId}` : t("engineSelectAModel")}</span>
          </fieldset>
        ) : models ? (
          <Field id="engine-model-name" label={t("engineModelName")} value={modelId} onChange={(event) => setModelId(event.target.value)} hint={t("engineModelNameHelp")} required />
        ) : null}
        {commercial && (
          <div className="p-grid-2">
            <Field id="engine-input-price" label={t("engineInputPrice")} inputMode="decimal" value={inputPrice} onChange={(event) => setInputPrice(event.target.value)} hint={t("enginePriceHelp")} />
            <Field id="engine-output-price" label={t("engineOutputPrice")} inputMode="decimal" value={outputPrice} onChange={(event) => setOutputPrice(event.target.value)} />
          </div>
        )}
        <Field
          id="engine-context"
          label={t("engineContextLimit")}
          inputMode="numeric"
          value={contextLimit}
          onChange={(event) => setContextLimit(event.target.value.replace(/\D/g, ""))}
          placeholder={commercial ? "128000" : t("engineContextAuto")}
          hint={t("engineContextHelp")}
        />
        <Check checked={allRoles} onChange={(event) => setAllRoles(event.target.checked)} label={t("engineAllRoles")} description={t("engineAllRolesHelp")} />
        {commercial && <p className="p-field-hint">{t("engineDataNotice")}</p>}
        {test && (
          <Status error={!test.ok}>
            {test.message} ({Math.round(test.latencyMs / 100) / 10} s)
          </Status>
        )}
      </form>
    </Modal>
  );
}

function AddProviderDialog({ open, orgId, onClose, onSaved }: { open: boolean; orgId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const action = useAction();
  useEffect(() => {
    if (open) return;
    setName("");
    setEndpoint("");
    setApiKey("");
    action.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      await evalRequest(`/engine/connections`, "POST", { orgId, name: name.trim(), endpoint: endpoint.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
      await onSaved();
    }, t("engineProviderAdded"));
  }
  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title={t("engineAddProvider")}
      description={t("engineAddProviderHelp")}
      alert={action.message}
      footer={
        <>
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action type="submit" form="engine-provider" disabled={!name.trim() || !endpoint.trim() || action.pending}>
            {action.pending ? t("saving") : t("engineAddProvider")}
          </Action>
        </>
      }
    >
      <form id="engine-provider" className="p-stack" onSubmit={save}>
        <div className="p-row" role="group" aria-label={t("enginePresets")}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset.name}
              active={endpoint === preset.endpoint}
              onClick={() => {
                setEndpoint(preset.endpoint);
                if (!name.trim() || PRESETS.some((item) => item.name === name)) setName(preset.name);
              }}
            >
              {preset.name}
            </Chip>
          ))}
        </div>
        <Field id="provider-name" label={t("engineProviderName")} value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
        <Field id="provider-endpoint" label={t("engineBaseUrl")} type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.example.com/v1" hint={t("engineBaseUrlHelp")} required />
        <Field id="provider-key" label={t("engineApiKey")} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" hint={t("engineApiKeyHelp")} />
      </form>
    </Modal>
  );
}

function ReplaceKeyDialog({ orgId, connection, onClose, onSaved }: { orgId: string; connection: Connection; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(connection.name);
  const [apiKey, setApiKey] = useState("");
  const action = useAction();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      await evalRequest(`/engine/connections/${connection.id}`, "PATCH", { orgId, ...(name.trim() !== connection.name ? { name: name.trim() } : {}), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
      await onSaved();
    }, t("engineProviderUpdated"));
  }
  return (
    <Modal
      open
      onOpenChange={(value) => !value && onClose()}
      title={t("engineEditProvider")}
      description={connection.host}
      alert={action.message}
      footer={
        <>
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action type="submit" form="engine-key" disabled={action.pending || (!apiKey.trim() && name.trim() === connection.name) || !name.trim()}>
            {action.pending ? t("saving") : t("save")}
          </Action>
        </>
      }
    >
      <form id="engine-key" className="p-stack" onSubmit={save}>
        <Field id="edit-provider-name" label={t("engineProviderName")} value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
        <Field id="edit-provider-key" label={t("engineNewApiKey")} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" hint={t("engineApiKeyHelp")} />
      </form>
    </Modal>
  );
}

/**
 * Web research: one switch per task, and the search engines that let any
 * model (the DGX included) use the web. Without an engine only OpenRouter
 * models can search, through OpenRouter's own plugin.
 */
function WebResearch({
  orgId, scope, engines, effective, action, reload,
}: {
  orgId: string; scope: Scope; engines: SearchEngineRow[];
  effective: (role: Role) => { route: Route | null; inherited: boolean };
  action: ReturnType<typeof useAction>; reload: () => Promise<unknown>;
}) {
  const [connecting, setConnecting] = useState<SearchEngineId | null>(null);
  const [disconnecting, setDisconnecting] = useState<SearchEngineId | null>(null);
  const [tests, setTests] = useState<Partial<Record<SearchEngineId, { ok: boolean; text: string }>>>({});
  const connected = engines.filter((item) => item.enabled);
  const primary = SEARCH_ENGINES.find((item) => item.id === connected[0]?.engine);
  const nameOf = (id: SearchEngineId) => SEARCH_ENGINES.find((item) => item.id === id)?.name ?? id;
  const switchable = WEB_ROLES.filter((role) => {
    const { route, inherited } = effective(role);
    return route && !inherited && route.web_capable && !route.web_research;
  });

  const toggle = (roles: readonly Role[], enabled: boolean) =>
    void action.run(async () => {
      for (const role of roles) await evalRequest("/engine/routes/web", "PUT", { orgId, scope, role, enabled });
      await reload();
    }, enabled ? t("engineWebEnabled") : t("engineWebDisabled"));

  async function test(engine: SearchEngineId) {
    setTests((current) => ({ ...current, [engine]: undefined }));
    await action.run(async () => {
      const result = await evalRequest<{ ok: boolean; latencyMs: number; results: Array<{ url: string; title: string }>; message?: string }>("/engine/web-search/test", "POST", { orgId, engine });
      setTests((current) => ({ ...current, [engine]: { ok: result.ok, text: result.ok ? tv("engineWebTestOk", { count: result.results.length, seconds: Math.round(result.latencyMs / 100) / 10 }) : result.message ?? t("error") } }));
    });
  }

  return (
    <Section
      title={t("engineWebTitle")}
      description={t("engineWebHelp")}
      actions={switchable.length > 1 ? (
        <Action variant="secondary" disabled={action.pending} onClick={() => toggle(switchable, true)}>
          <Globe aria-hidden="true" />
          {t("engineWebTurnAllOn")}
        </Action>
      ) : undefined}
    >
      {!connected.length && <Status tone="info">{t("engineWebNoEngine")}</Status>}
      <div className="p-web-roles">
        {WEB_ROLES.map((role) => {
          const { route, inherited } = effective(role);
          const on = !!route?.web_research;
          const { Icon, help } = WEB_ROLE_COPY[role];
          const note = !route ? t("engineWebNeedsModel")
            : inherited ? t("engineWebAllWorkspaces")
            : !route.web_capable ? t("engineWebNeedsEngine")
            : on ? (primary ? tv("engineWebVia", { engine: primary.name }) : t("engineWebViaOpenRouter")) : null;
          return (
            <div key={role} className="p-web-role" data-on={on ? "true" : undefined}>
              <div className="p-web-role-head">
                <Icon aria-hidden="true" />
                <h3 id={`web-role-${role}`}>{ROLE_COPY[role].title}</h3>
                <Switch
                  aria-labelledby={`web-role-${role}`}
                  checked={on}
                  disabled={action.pending || !route || inherited || (!route.web_capable && !on)}
                  onChange={(event) => toggle([role], event.target.checked)}
                />
              </div>
              <p className="p-web-role-help">{help}</p>
              {note && <p className="p-web-role-note">{note}</p>}
            </div>
          );
        })}
      </div>

      <div className="p-web-engines">
        <div className="p-head-text">
          <h3>{t("engineWebEngines")}</h3>
          <p>{t("engineWebEnginesHelp")}</p>
        </div>
        <DataTable caption={t("engineWebEngines")} headers={[t("engineWebEngine"), t("engineWebStatus"), { label: t("actions"), align: "end", hidden: true }]}>
          {SEARCH_ENGINES.map((engine) => {
            const row = engines.find((item) => item.engine === engine.id && item.enabled);
            const rank = row ? connected.indexOf(row) : -1;
            const result = tests[engine.id];
            return (
              <tr key={engine.id}>
                <RowTitle meta={engine.help}>
                  <span className="p-row p-nowrap">
                    <Search aria-hidden="true" width={14} />
                    {engine.name}
                  </span>
                </RowTitle>
                <td>
                  {row ? (
                    <span className="p-stack p-stack-tight">
                      <span className="p-row p-nowrap">
                        <Badge tone="pass" dot>{t("engineWebConnected")}</Badge>
                        <Badge>{rank === 0 ? t("engineWebPrimary") : t("engineWebBackup")}</Badge>
                        {row.key_hint && <span className="p-cell-meta">{row.key_hint}</span>}
                      </span>
                      {result && <span className="p-cell-meta" data-tone={result.ok ? undefined : "error"} role="status">{result.text}</span>}
                    </span>
                  ) : (
                    <span className="p-cell-meta">{t("engineWebNotConnected")}</span>
                  )}
                </td>
                <td className="p-table-action">
                  {row ? (
                    <span className="p-row p-nowrap">
                      <Action variant="ghost" size="sm" disabled={action.pending} onClick={() => void test(engine.id)}>
                        <Zap aria-hidden="true" />
                        {t("engineWebTestSearch")}
                      </Action>
                      <ActionMenu
                        label={t("moreActions")}
                        items={[
                          { label: t("engineWebReplaceKey"), icon: <KeyRound />, onSelect: () => setConnecting(engine.id) },
                          { separator: true },
                          { label: t("engineWebDisconnect"), icon: <Trash2 />, tone: "danger", onSelect: () => setDisconnecting(engine.id) },
                        ]}
                      />
                    </span>
                  ) : (
                    <Action variant="secondary" size="sm" onClick={() => setConnecting(engine.id)}>
                      {t("engineWebConnect")}
                    </Action>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </div>

      {connecting && (
        <ConnectSearchDialog
          orgId={orgId}
          engine={connecting}
          name={nameOf(connecting)}
          onClose={() => setConnecting(null)}
          onSaved={async () => { setConnecting(null); await reload(); }}
        />
      )}
      <Modal
        open={!!disconnecting}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        title={t("engineWebDisconnect")}
        description={disconnecting ? nameOf(disconnecting) : undefined}
        alert={action.message}
        size="sm"
        footer={
          <>
            <Action variant="secondary" onClick={() => setDisconnecting(null)}>{t("cancel")}</Action>
            <Action
              variant="danger"
              disabled={action.pending}
              onClick={() => disconnecting && void action.run(async () => {
                await evalRequest(`/engine/web-search?orgId=${encodeURIComponent(orgId)}&engine=${disconnecting}`, "DELETE");
                setDisconnecting(null);
                await reload();
              }, t("engineWebRemovedToast"))}
            >
              {action.pending ? t("working") : t("engineWebDisconnect")}
            </Action>
          </>
        }
      />
    </Section>
  );
}

function ConnectSearchDialog({ orgId, engine, name, onClose, onSaved }: { orgId: string; engine: SearchEngineId; name: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [apiKey, setApiKey] = useState("");
  const action = useAction();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      await evalRequest("/engine/web-search", "PUT", { orgId, engine, apiKey: apiKey.trim() });
      await onSaved();
    }, t("engineWebConnectedToast"));
  }
  return (
    <Modal
      open
      onOpenChange={(value) => !value && onClose()}
      title={tv("engineWebConnectTitle", { engine: name })}
      description={SEARCH_ENGINES.find((item) => item.id === engine)?.help}
      alert={action.message}
      size="sm"
      footer={
        <>
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action type="submit" form="engine-search-key" disabled={apiKey.trim().length < 8 || action.pending}>
            {action.pending ? t("saving") : t("engineWebConnect")}
          </Action>
        </>
      }
    >
      <form id="engine-search-key" className="p-stack" onSubmit={save}>
        <Field id="search-key" label={t("engineWebKeyLabel")} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" hint={t("engineWebKeyHelp")} required />
      </form>
    </Modal>
  );
}
