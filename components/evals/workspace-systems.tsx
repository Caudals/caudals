"use client";

import { useState } from "react";
import { KeyRound, Pencil, Plug, Plus, RefreshCw, Trash2 } from "lucide-react";
import { evalRequest } from "./api";
import {
  Action,
  ActionLink,
  DataTable,
  DefinitionList,
  EmptyState,
  PageHeading,
  SectionHeading,
  Status,
  StatusBadge,
  TableSkeleton,
  Time,
  humanize,
} from "./primitives";
import { ActionMenu, CopyField, SidePanel, notify } from "./overlays";
import { useItemActions } from "./item-actions";
import { TargetCredentials } from "./workspace-credentials";
import { WebsiteLoginSessions } from "./website-login-sessions";
import { WebAppConnector } from "./web-app-connector";
import { NoWorkspace } from "./workspace-evaluations";
import { useWorkspace } from "./workspace-context";
import { connectionLabel, useWorkspaceSummary, type WorkspaceSystem } from "./workspace-data";
import { t } from "@/lib/evals/messages/en";

const API_KINDS = new Set(["openai_compatible", "provider_native", "https_json"]);

function systemStatus(system: WorkspaceSystem) {
  if (system.document.kind === "private_runner") return system.runner_status ?? "pairing_required";
  if (system.document.kind === "imported_responses") return null;
  return system.connection_status ?? "checking_connection";
}

export function WorkspaceSystems() {
  const { orgId, workspace, canWrite, canManage, withOrg } = useWorkspace();
  const { summary, error, reload, retry, loading } = useWorkspaceSummary(orgId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const system = summary?.systems.find((item) => item.id === openId) ?? null;
  const items = useItemActions(orgId, reload);
  const usedBy = (item: WorkspaceSystem) => summary?.evaluations.filter((evaluation) => (evaluation.selected_target_id ? evaluation.selected_target_id === item.id : evaluation.project_id === item.project_id)) ?? [];

  if (!workspace) return <NoWorkspace />;

  async function check(item: WorkspaceSystem) {
    setPending(true);
    setPanelError("");
    try {
      await evalRequest(`/targets/${item.target_revision_id}/checks`, "POST", { orgId }, crypto.randomUUID());
      notify(t("connectionCheckStarted"));
      await reload();
    } catch (value) {
      setPanelError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  async function pair(item: WorkspaceSystem) {
    setPending(true);
    setPanelError("");
    setPairing(null);
    try {
      setPairing(await evalRequest<{ code: string; expiresAt: string }>("/runner/pairings", "POST", { orgId, targetId: item.id }));
    } catch (value) {
      setPanelError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  async function revoke(item: WorkspaceSystem) {
    if (!item.runner_id) return;
    setPending(true);
    setPanelError("");
    try {
      await evalRequest(`/runner/${item.runner_id}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      notify(t("runnerRevoked"));
      await reload();
    } catch (value) {
      setPanelError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  function open(id: string | null) {
    setOpenId(id);
    setPairing(null);
    setPanelError("");
  }

  return (
    <>
      <PageHeading
        title={t("systems")}
        actions={
          canWrite && summary?.systems.length ? (
            <ActionLink variant="secondary" href={withOrg("/workspace/evaluations/new")}>
              <Plus aria-hidden="true" />
              {t("connectSystemAction")}
            </ActionLink>
          ) : undefined
        }
      />
      {error && (
        <Status error action={<Action variant="secondary" size="sm" onClick={retry}>{t("retry")}</Action>}>
          {error}
        </Status>
      )}
      {!summary ? (
        loading ? <TableSkeleton columns={4} /> : null
      ) : summary.systems.length ? (
        <DataTable caption={t("systems")} headers={[t("system"), t("connection"), t("lastChecked"), { label: t("actions"), align: "end", hidden: true }]}>
          {summary.systems.map((item) => {
            const status = systemStatus(item);
            const evaluations = usedBy(item);
            return (
              <tr key={item.id}>
                <th scope="row">
                  <span className="p-table-primary">
                    <button type="button" className="p-row-link p-row-button" onClick={() => open(item.id)}>
                      {item.title}
                    </button>
                    <span className="p-cell-meta">
                      {connectionLabel(item.document.kind)}
                      {evaluations.length ? ` · ${evaluations.length} ${evaluations.length === 1 ? t("evaluationLower") : t("evaluationsLower")}` : ""}
                    </span>
                  </span>
                </th>
                <td>
                  {status ? <StatusBadge value={status} /> : <span className="p-cell-meta">{t("manualUploads")}</span>}
                  {item.error_code && <span className="p-cell-meta p-cell-note">{humanize(item.error_code.toLowerCase())}</span>}
                </td>
                <td className="p-cell-meta">
                  <Time value={item.connection_checked_at ?? null} />
                </td>
                <td className="p-table-action">
                  <ActionMenu
                    label={`${t("actions")}: ${item.title}`}
                    items={[
                      { label: t("details"), onSelect: () => open(item.id) },
                      ...(canWrite && (API_KINDS.has(item.document.kind) || item.document.kind === "website")
                        ? [{ label: t("checkConnection"), icon: <RefreshCw />, onSelect: () => void check(item) }]
                        : []),
                      ...(canWrite && API_KINDS.has(item.document.kind) ? [{ label: t("manageCredentials"), icon: <KeyRound />, onSelect: () => open(item.id) }] : []),
                      ...(canWrite
                        ? [
                            { label: t("rename"), icon: <Pencil />, onSelect: () => items.rename("systems", item.id, item.title) },
                            { separator: true as const },
                            { label: t("delete"), icon: <Trash2 />, tone: "danger" as const, onSelect: () => items.remove("systems", item.id, item.title) },
                          ]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState
          title={t("noSystems")}
          icon={<Plug />}
          action={
            canWrite && (
              <ActionLink href={withOrg("/workspace/evaluations/new")}>
                <Plus aria-hidden="true" />
                {t("newEvaluationAction")}
              </ActionLink>
            )
          }
        >
          <p>{t("noSystemsHelp")}</p>
        </EmptyState>
      )}

      <SidePanel
        open={!!system}
        onOpenChange={(value) => !value && open(null)}
        title={system?.title ?? t("system")}
        description={system ? <>{connectionLabel(system.document.kind)}{systemStatus(system) && <StatusBadge value={systemStatus(system)} />}</> : undefined}
        wide
      >
        {system && (
          <>
            {panelError && <Status error>{panelError}</Status>}
            <DefinitionList
              items={[
                { term: t("connectionType"), value: connectionLabel(system.document.kind) },
                { term: t("connection"), value: systemStatus(system) ? <StatusBadge value={systemStatus(system)} /> : t("manualUploads") },
                ...(system.error_code ? [{ term: t("lastError"), value: humanize(system.error_code.toLowerCase()) }] : []),
                { term: t("lastChecked"), value: <Time value={system.connection_checked_at ?? null} /> },
                { term: t("usedBy"), value: usedBy(system).map((item) => item.title).join(", ") || "—" },
              ]}
            />
            {canWrite && (API_KINDS.has(system.document.kind) || system.document.kind === "website") && (
              <div className="p-row">
                <Action variant="secondary" onClick={() => void check(system)} disabled={pending}>
                  <RefreshCw aria-hidden="true" />
                  {t("checkConnection")}
                </Action>
                <span className="p-cell-meta">{t("checkConnectionHelp")}</span>
              </div>
            )}
            {API_KINDS.has(system.document.kind) && canWrite && (
              <TargetCredentials key={system.id} orgId={orgId} targetId={system.id} canRevoke={canManage} onChanged={() => void reload()} />
            )}
            {system.document.kind === "website" && canManage && <><WebAppConnector key={system.id} orgId={orgId} targetId={system.id} status={system.connection_status} errorCode={system.error_code} onChanged={reload} /><WebsiteLoginSessions orgId={orgId} targetId={system.id} /></>}
            {system.document.kind === "private_runner" && canWrite && (
              <section>
                <SectionHeading title={t("privateRunner")}>{t("privateRunnerHelp")}</SectionHeading>
                {pairing && (
                  <CopyField label={t("pairingCode")} value={pairing.code} hint={`${t("expires")} ${new Date(pairing.expiresAt).toLocaleTimeString()}. ${t("pairingShownOnce")}`} />
                )}
                <div className="p-row">
                  <Action variant="secondary" onClick={() => void pair(system)} disabled={pending}>
                    {system.runner_id ? t("replacePairing") : t("createPairingCode")}
                  </Action>
                  {system.runner_id && system.runner_status !== "revoked" && canManage && (
                    <Action variant="ghost" onClick={() => void revoke(system)} disabled={pending}>
                      {t("revokeRunner")}
                    </Action>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </SidePanel>
      {items.dialog}
    </>
  );
}
