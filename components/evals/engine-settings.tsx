"use client";

/**
 * Settings → AI models. Chooses the model behind each engine task (reading
 * sources, drafting tests, grading, writing report takeaways) for every
 * workspace or for this one, from the private DGX Spark or any
 * OpenAI-compatible API. Platform administrators only; keys are write-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Cpu, Globe, KeyRound, Plus, RotateCcw, Trash2, Zap } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, Badge, Check, Chip, DataTable, Field, RowTitle, Section, SelectField, Status, Tabs } from "./primitives";
import { ActionMenu, Modal, notify } from "./overlays";
import { t } from "@/lib/evals/messages/en";

type Role = "context_analyzer" | "generator" | "judge" | "report_writer";
type Connection = { id: string; name: string; adapter: "dgx" | "openai_compatible"; host: string; key_hint: string | null; enabled: boolean; has_key: boolean };
type Route = { role: Role; provider_revision_id: string; model_id: string; adapter: string; account_id: string; account_name: string; context_limit: number; input_price: string; output_price: string; currency: string; updated_at: string; usable: boolean };
type Settings = { roles: Role[]; dgxAvailable: boolean; connections: Connection[]; platform: Route[]; workspace: Route[] };
type Model = { id: string; label: string; detail: string | null };
type Scope = "platform" | "workspace";

const ROLE_COPY: Record<Role, { title: string; help: string }> = {
  context_analyzer: { title: t("roleContextAnalyzer"), help: t("roleContextAnalyzerHelp") },
  generator: { title: t("roleGenerator"), help: t("roleGeneratorHelp") },
  judge: { title: t("roleJudge"), help: t("roleJudgeHelp") },
  report_writer: { title: t("roleReportWriter"), help: t("roleReportWriterHelp") },
};

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
  const [error, setError] = useState<{ message: string; reauth: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const run = useCallback(async (work: () => Promise<unknown>, done?: string) => {
    setPending(true);
    setError(null);
    try {
      await work();
      if (done) notify(done);
      return true;
    } catch (reason) {
      setError({ message: reason instanceof Error ? reason.message : t("error"), reauth: reason instanceof EvalRequestError && reason.code === "REAUTHENTICATION_REQUIRED" });
      return false;
    } finally {
      setPending(false);
    }
  }, []);
  const message = error ? (
    <Status
      error
      action={
        error.reauth ? (
          <Link className="p-link" href={`/workspace/sign-in?next=${encodeURIComponent(typeof location === "undefined" ? "/workspace/settings?tab=models" : location.pathname + location.search)}`}>
            {t("signInAgain")}
          </Link>
        ) : undefined
      }
    >
      {error.message}
    </Status>
  ) : null;
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
    <div className="p-stack">
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

  useEffect(() => {
    if (!connectionId) return;
    setModels(null);
    setTest(null);
    void listing.run(async () => {
      const list = await evalRequest<Model[]>(`/engine/models?orgId=${encodeURIComponent(orgId)}&connectionId=${encodeURIComponent(connectionId)}`);
      setModels(list);
      setModelId((value) => (list.some((item) => item.id === value) ? value : list[0]?.id ?? value));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, orgId]);

  const visible = useMemo(() => (models ?? []).filter((item) => !filter || item.id.toLowerCase().includes(filter.toLowerCase())).slice(0, 300), [models, filter]);

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
        <SelectField id="engine-connection" label={t("engineProvider")} value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
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
          <SelectField id="engine-model" label={t("engineModel")} value={modelId} onChange={(event) => setModelId(event.target.value)} size={Math.min(8, Math.max(3, visible.length))}>
            {visible.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}{item.detail ? ` — ${item.detail}` : ""}
              </option>
            ))}
          </SelectField>
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
