"use client";

/**
 * Settings → AI models for workspace owners: their own provider keys (BYOK,
 * launch L-27, spec v2 §6.11). A key is typed once, checked with the
 * provider, stored encrypted and never shown again. Each engine task runs on
 * the key's model or on Caudals' model (charged in credits). Calls on the
 * key carry no token credits; per-question and page fees still apply.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, Badge, Check, DataTable, Field, RowTitle, Section, SelectField, Status, formatDate } from "./primitives";
import { ActionMenu, Modal } from "./overlays";
import { useAction } from "./engine-settings";
import { BYOK_PROVIDER_LABELS, type ByokKeyState, type ByokProvider, type ByokRole } from "@/lib/evals/byok/shared";
import { t, tv, type MessageKey } from "@/lib/evals/messages/runtime";

export type ByokConnection = {
  id: string; provider: ByokProvider; label: string; state: ByokKeyState; checkedAt: string | null; models: string[];
  createdAt: string; rotatedAt: string | null; revokedAt: string | null;
};
export type ByokRoute = { role: ByokRole; connectionId: string; provider: ByokProvider; modelId: string; webResearch: boolean; updatedAt: string };
export type ByokSettingsData = {
  available: boolean; plan: string | null; roles: ByokRole[]; providers: Array<{ id: ByokProvider; label: string }>;
  connections: ByokConnection[]; routes: ByokRoute[];
};

const ROLE_KEY: Record<ByokRole, { title: MessageKey; help: MessageKey }> = {
  context_analyzer: { title: "roleContextAnalyzer", help: "roleContextAnalyzerHelp" },
  generator: { title: "roleGenerator", help: "roleGeneratorHelp" },
  judge: { title: "roleJudge", help: "roleJudgeHelp" },
  report_writer: { title: "roleReportWriter", help: "roleReportWriterHelp" },
};

/**
 * The workspace's BYOK settings, for owners and platform admins while the
 * server opens them (`null` otherwise, or 404 for anyone else: the tab then
 * stays hidden).
 */
export function useByokSettings(orgId: string, enabled: boolean) {
  const key = enabled && orgId ? orgId : "";
  const [state, setState] = useState<{ key: string; data: ByokSettingsData | null }>({ key: "", data: null });
  const fetchSettings = useCallback(async (target: string) => {
    try {
      return { key: target, data: (await evalRequest<ByokSettingsData | null>(`/engine/byok?orgId=${encodeURIComponent(target)}`)) ?? null };
    } catch (error) {
      if (error instanceof EvalRequestError && (error.status === 404 || error.status === 403)) return { key: target, data: null };
      return null;
    }
  }, []);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void fetchSettings(key).then((next) => { if (live && next) setState(next); });
    return () => { live = false; };
  }, [key, fetchSettings]);
  const reload = useCallback(async () => {
    if (!key) return;
    const next = await fetchSettings(key);
    if (next) setState(next);
  }, [key, fetchSettings]);
  const setData = useCallback((data: ByokSettingsData) => setState({ key, data }), [key]);
  return { data: key && state.key === key ? state.data : null, setData, reload };
}

/** Key and model errors in the person's language, by code; a recent-sign-in request passes through (the dialog asks and retries). */
async function byokCall<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof EvalRequestError) {
      const key: MessageKey | null = error.code === "BYOK_KEY_REJECTED" ? "byokErrRejected"
        : error.code === "PROVIDER_UNAVAILABLE" ? "byokErrUnavailable"
          : error.status === 409 ? "byokErrExists"
            : error.status === 422 ? "byokErrModel"
              : error.status === 400 ? "byokErrFormat" : null;
      if (key) throw new Error(t(key));
    }
    throw error;
  }
}

function StateBadge({ state }: { state: ByokKeyState }) {
  if (state === "valid") return <Badge tone="pass" dot>{t("byokStateValid")}</Badge>;
  return <Badge tone={state === "quota_exceeded" ? "warn" : "fail"} dot>{t(state === "quota_exceeded" ? "byokStateQuota" : "byokStateInvalid")}</Badge>;
}

export function ByokSettings({ orgId, data, onChange }: { orgId: string; data: ByokSettingsData; onChange: (next: ByokSettingsData) => void }) {
  const live = data.connections.filter((item) => !item.revokedAt);
  const [connecting, setConnecting] = useState(false);
  const [replacing, setReplacing] = useState<ByokConnection | null>(null);
  const [removing, setRemoving] = useState<ByokConnection | null>(null);
  const [routing, setRouting] = useState<ByokRole | "all" | null>(null);
  const action = useAction();
  const failing = live.find((item) => item.state !== "valid");
  const taken = new Set(live.map((item) => item.provider));
  const canAdd = data.available && taken.size < data.providers.length;

  return (
    <div className="p-stack" data-testid="byok-settings">
      {action.message}
      <Section
        title={t("byokTitle")}
        description={t("byokIntro")}
        actions={canAdd ? (
          <Action variant="secondary" onClick={() => setConnecting(true)} data-testid="byok-connect">
            <Plus aria-hidden="true" />
            {t("byokConnect")}
          </Action>
        ) : undefined}
      >
        {!data.available && <Status tone="info">{data.plan === "free" ? t("byokUnavailableFree") : t("byokUnavailableOff")}</Status>}
        {failing && (
          <Status tone={failing.state === "invalid" ? "error" : "warn"}>
            {failing.label}: {t(failing.state === "invalid" ? "byokStateInvalidHelp" : "byokStateQuotaHelp")}
          </Status>
        )}
        {live.length ? (
          <DataTable caption={t("byokKeys")} headers={[t("byokProvider"), t("statusLabel"), { label: t("actions"), align: "end", hidden: true }]}>
            {live.map((connection) => (
              <tr key={connection.id} data-testid={`byok-key-${connection.provider}`}>
                <RowTitle meta={connection.rotatedAt ? tv("byokReplacedOn", { date: formatDate(connection.rotatedAt) }) : tv("byokSavedOn", { date: formatDate(connection.createdAt) })}>
                  <span className="p-row p-nowrap">
                    <KeyRound aria-hidden="true" width={14} />
                    {connection.label}
                  </span>
                </RowTitle>
                <td><StateBadge state={connection.state} /></td>
                <td className="p-table-action">
                  <ActionMenu
                    label={t("moreActions")}
                    items={[
                      ...(data.available ? [{ label: t("byokReplaceKey"), icon: <KeyRound />, onSelect: () => setReplacing(connection) }, { separator: true as const }] : []),
                      { label: t("byokRemoveKey"), icon: <Trash2 />, tone: "danger" as const, onSelect: () => setRemoving(connection) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <p className="p-cell-meta">{t("byokNoKeys")}</p>
        )}
        <p className="p-field-hint">{t("byokDataNote")}</p>
      </Section>

      {live.length > 0 && (
        <Section title={t("byokTasks")} description={t("byokTasksHelp")}
          actions={data.available ? (
            <Action variant="secondary" onClick={() => setRouting("all")} data-testid="byok-use-all">
              <KeyRound aria-hidden="true" />
              {t("byokUseYourKey")}
            </Action>
          ) : undefined}>
          <DataTable caption={t("byokTasks")} headers={[t("byokTask"), t("byokModel"), { label: t("actions"), align: "end", hidden: true }]}>
            {data.roles.map((role) => {
              const route = data.routes.find((item) => item.role === role);
              return (
                <tr key={role} data-testid={`byok-role-${role}`}>
                  <RowTitle meta={t(ROLE_KEY[role].help)}>{t(ROLE_KEY[role].title)}</RowTitle>
                  <td>
                    {route ? (
                      <span className="p-stack p-stack-tight">
                        <span className="p-row p-nowrap"><KeyRound aria-hidden="true" width={14} /><strong>{route.modelId}</strong></span>
                        <span className="p-cell-meta">{tv("byokOnYourKey", { provider: BYOK_PROVIDER_LABELS[route.provider] })}</span>
                      </span>
                    ) : (
                      <span className="p-row p-nowrap"><Cpu aria-hidden="true" width={14} /><span className="p-cell-meta">{t("byokCaudalsModel")}</span></span>
                    )}
                  </td>
                  <td className="p-table-action">
                    {(route || data.available) && (
                      <ActionMenu
                        label={t("moreActions")}
                        items={[
                          ...(data.available ? [{ label: t("byokUseYourKey"), icon: <KeyRound />, onSelect: () => setRouting(role) }] : []),
                          ...(route ? [{ label: t("byokUseCaudals"), icon: <RotateCcw />, disabled: action.pending, onSelect: () => void action.run(async () => {
                            onChange(await evalRequest<ByokSettingsData>(`/engine/byok/routes?orgId=${encodeURIComponent(orgId)}&role=${role}`, "DELETE"));
                          }, t("byokRouteCleared")) }] : []),
                        ]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </Section>
      )}

      {connecting && (
        <KeyDialog
          title={t("byokConnectTitle")}
          providers={data.providers.filter((item) => !taken.has(item.id))}
          onClose={() => setConnecting(false)}
          submit={async (provider, apiKey) => {
            onChange(await byokCall(() => evalRequest<ByokSettingsData>("/engine/byok", "POST", { orgId, provider, apiKey })));
            setConnecting(false);
          }}
          done={t("byokKeySaved")}
        />
      )}
      {replacing && (
        <KeyDialog
          title={tv("byokReplaceTitle", { provider: replacing.label })}
          description={t("byokReplaceHelp")}
          onClose={() => setReplacing(null)}
          submit={async (_provider, apiKey) => {
            onChange(await byokCall(() => evalRequest<ByokSettingsData>(`/engine/byok/${replacing.id}`, "PATCH", { orgId, apiKey })));
            setReplacing(null);
          }}
          done={t("byokKeyReplaced")}
        />
      )}
      {routing && (
        <RouteDialog
          orgId={orgId}
          role={routing}
          connections={live}
          current={routing === "all" ? undefined : data.routes.find((item) => item.role === routing)}
          onClose={() => setRouting(null)}
          onSaved={(next) => { onChange(next); setRouting(null); }}
        />
      )}
      <Modal
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? tv("byokRemoveTitle", { provider: removing.label }) : t("byokRemoveKey")}
        description={t("byokRemoveHelp")}
        alert={action.message}
        size="sm"
        footer={
          <>
            <Action variant="secondary" onClick={() => setRemoving(null)}>{t("cancel")}</Action>
            <Action
              variant="danger"
              disabled={action.pending}
              data-testid="byok-remove-confirm"
              onClick={() => removing && void action.run(async () => {
                onChange(await evalRequest<ByokSettingsData>(`/engine/byok/${removing.id}?orgId=${encodeURIComponent(orgId)}`, "DELETE"));
                setRemoving(null);
              }, t("byokKeyRemoved"))}
            >
              {action.pending ? t("working") : t("byokRemoveKey")}
            </Action>
          </>
        }
      />
    </div>
  );
}

/** Type a key once: it is sent for checking and never kept in the page afterwards. */
function KeyDialog({ title, description, providers, onClose, submit, done }: {
  title: string; description?: string; providers?: Array<{ id: ByokProvider; label: string }>;
  onClose: () => void; submit: (provider: ByokProvider | null, apiKey: string) => Promise<void>; done: string;
}) {
  const [provider, setProvider] = useState<ByokProvider | null>(providers?.[0]?.id ?? null);
  const [apiKey, setApiKey] = useState("");
  const action = useAction();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const ok = await action.run(() => submit(provider, apiKey.trim()), done);
    if (!ok) setApiKey("");
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={description}
      alert={action.message}
      footer={
        <>
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action type="submit" form="byok-key" disabled={apiKey.trim().length < 8 || (!!providers && !provider) || action.pending} data-testid="byok-key-save">
            {action.pending ? t("byokChecking") : t("byokSaveKey")}
          </Action>
        </>
      }
    >
      <form id="byok-key" className="p-stack" onSubmit={save} autoComplete="off">
        {providers && (
          <SelectField id="byok-provider" label={t("byokProvider")} value={provider ?? ""} onChange={(event) => setProvider(event.target.value as ByokProvider)}>
            {providers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </SelectField>
        )}
        <Field id="byok-api-key" label={t("byokApiKey")} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off" spellCheck={false} hint={t("byokApiKeyHelp")} required maxLength={512} />
        <p className="p-field-hint">{t("byokDataNote")}</p>
      </form>
    </Modal>
  );
}

function RouteDialog({ orgId, role, connections, current, onClose, onSaved }: {
  orgId: string; role: ByokRole | "all"; connections: ByokConnection[]; current?: ByokRoute;
  onClose: () => void; onSaved: (next: ByokSettingsData) => void;
}) {
  const [connectionId, setConnectionId] = useState(current?.connectionId ?? connections[0]?.id ?? "");
  const [modelId, setModelId] = useState(current?.modelId ?? "");
  const [filter, setFilter] = useState("");
  const [roles, setRoles] = useState<ByokRole[]>(role === "all" ? ["context_analyzer", "generator", "judge", "report_writer"] : [role]);
  const [context, setContext] = useState("");
  const action = useAction();
  const connection = connections.find((item) => item.id === connectionId);
  const models = useMemo(() => connection?.models ?? [], [connection]);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = models.filter((item) => !needle || item.toLowerCase().includes(needle)).slice(0, 200);
    return modelId && models.includes(modelId) && !list.includes(modelId) ? [modelId, ...list] : list;
  }, [models, filter, modelId]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      onSaved(await byokCall(() => evalRequest<ByokSettingsData>("/engine/byok/routes", "PUT", {
        orgId, connectionId, modelId: modelId.trim(), roles, ...(context ? { contextLimit: Number(context) } : {}),
      })));
    }, t("byokRouteSaved"));
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("byokRouteTitle")}
      description={t("byokRouteHelp")}
      alert={action.message}
      footer={
        <>
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action type="submit" form="byok-route" disabled={!modelId.trim() || !roles.length || action.pending} data-testid="byok-route-save">
            {action.pending ? t("saving") : t("save")}
          </Action>
        </>
      }
    >
      <form id="byok-route" className="p-stack" onSubmit={save}>
        {connections.length > 1 && (
          <SelectField id="byok-route-key" label={t("byokRouteKey")} value={connectionId} onChange={(event) => { setConnectionId(event.target.value); setModelId(""); setFilter(""); }}>
            {connections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </SelectField>
        )}
        {models.length ? (
          <fieldset className="p-fieldset">
            <legend>{t("byokModel")}</legend>
            {models.length > 12 && (
              <Field id="byok-model-filter" label={t("byokRouteModelFilter")} value={filter} onChange={(event) => setFilter(event.target.value)} autoComplete="off" />
            )}
            <div role="radiogroup" aria-label={t("byokModel")} className="p-engine-model-options">
              {visible.map((item) => (
                <label key={item} className="p-check" data-selected={item === modelId ? "true" : undefined}>
                  <input type="radio" name="byok-model" value={item} checked={item === modelId} onChange={() => setModelId(item)} />
                  <span className="p-check-label">{item}</span>
                </label>
              ))}
              {!visible.length && <p className="p-cell-meta">{t("engineNoMatchingModels")}</p>}
            </div>
            <span className="p-field-hint">{t("byokRouteModelHelp")}</span>
          </fieldset>
        ) : (
          <Field id="byok-model-id" label={t("byokModelId")} value={modelId} onChange={(event) => setModelId(event.target.value)} hint={t("byokNoModels")} required maxLength={200} autoComplete="off" />
        )}
        <fieldset className="p-fieldset">
          <legend>{t("byokRouteRoles")}</legend>
          {(["context_analyzer", "generator", "judge", "report_writer"] as const).map((item) => (
            <Check key={item} checked={roles.includes(item)} label={t(ROLE_KEY[item].title)}
              onChange={(event) => setRoles((value) => (event.target.checked ? [...value, item] : value.filter((entry) => entry !== item)))} />
          ))}
        </fieldset>
        <Field id="byok-context" label={t("byokContext")} inputMode="numeric" value={context} placeholder="128000"
          onChange={(event) => setContext(event.target.value.replace(/\D/g, ""))} hint={t("byokContextHelp")} />
        <p className="p-field-hint">{t("byokDataNote")}</p>
      </form>
    </Modal>
  );
}
