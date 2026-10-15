"use client";

/**
 * Systems as a connection health centre (launch L-22, spec P-14): status
 * (connected or needs attention), the last successful check and the last
 * score per system, "Check now" (the existing bounded connection check,
 * rate-limited on the server) and "Fix", which opens the system straight at
 * re-teaching the chat, updating the key or pairing the runner again.
 * `?system=<id>` opens a system's panel (deep links from Home, ⌘K and the
 * evaluation's Connect step); `&fix=1` scrolls to the fix.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Code2, FileSpreadsheet, Globe, KeyRound, Pencil, Plug, Plus, RefreshCw, Trash2, Wrench } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
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
import { percent } from "./charts";
import { ActionMenu, CopyField, SidePanel, notify } from "./overlays";
import { useItemActions } from "./item-actions";
import { TargetCredentials } from "./workspace-credentials";
import { WebsiteLoginSessions } from "./website-login-sessions";
import { WebAppConnector } from "./web-app-connector";
import { NoWorkspace } from "./workspace-evaluations";
import { useWorkspace, usePageCrumb } from "./workspace-context";
import { connectionLabel, useWorkspaceSummary, type WorkspaceReport, type WorkspaceSystem } from "./workspace-data";
import { HEALTH_LABEL, canCheckConnection, fixAction, isApiKind, lastHealthy, scoreHistory, systemHealth } from "@/lib/evals/workspace/health";
import { t, type MessageKey } from "@/lib/evals/messages/runtime";

const FIX_LABEL: Record<"reteach" | "key" | "pair", MessageKey> = { reteach: "fixReteach", key: "fixKey", pair: "fixPair" };

function systemStatus(system: WorkspaceSystem) {
  if (system.document.kind === "private_runner") return system.runner_status ?? "pairing_required";
  if (system.document.kind === "imported_responses") return null;
  return system.connection_status ?? "checking_connection";
}

/**
 * "Check now" for one system: the existing connection check, which the server
 * bounds to one probe at a time per system and rate-limits per system and
 * workspace. Shared by Systems and the evaluation's Connect step.
 */
export function useConnectionCheck(orgId: string, onChecked: () => Promise<void> | void) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function check(system: WorkspaceSystem) {
    if (pending) return;
    setPending(system.id);
    setError("");
    try {
      const result = await evalRequest<{ status: string; reused?: boolean }>(`/targets/${system.target_revision_id}/checks`, "POST", { orgId }, crypto.randomUUID());
      notify(t(result.reused ? "connectionCheckRunning" : result.status === "ready" ? "connectionCheckPassed" : result.status === "queued" || result.status === "running" ? "connectionCheckStarted" : "connectionCheckFinished"));
      await onChecked();
    } catch (value) {
      setError(value instanceof EvalRequestError && value.code === "RATE_LIMITED" ? `${t("connectionCheckLimited")} ${value.message}` : value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(null);
    }
  }
  return { check, pending, error, clearError: () => setError("") };
}

/** Status, last successful check and "Check now" for one system (Connect step, launch L-22). */
export function ConnectionHealth({ system, orgId, onChecked, fixHref }: { system: WorkspaceSystem; orgId: string; onChecked: () => Promise<void> | void; fixHref?: string }) {
  const { canWrite } = useWorkspace();
  const health = systemHealth(system);
  const checks = useConnectionCheck(orgId, onChecked);
  const fix = fixAction(system);
  if (health === "manual") return null;
  return (
    <div className="p-health" aria-live="polite">
      <DefinitionList
        items={[
          { term: t("connection"), value: <StatusBadge value={health} label={t(HEALTH_LABEL[health])} /> },
          ...(system.error_code && health === "needs_attention" ? [{ term: t("lastError"), value: humanize(system.error_code.toLowerCase()) }] : []),
          { term: t("lastSuccessfulCheck"), value: <Time value={lastHealthy(system)} /> },
        ]}
      />
      {checks.error && <Status error>{checks.error}</Status>}
      {canWrite && (
        <div className="p-row">
          {canCheckConnection(system.document.kind) && (
            <Action variant="secondary" size="sm" onClick={() => void checks.check(system)} disabled={!!checks.pending || health === "checking"}>
              <RefreshCw aria-hidden="true" />
              {checks.pending || health === "checking" ? t("checking") : t("checkNow")}
            </Action>
          )}
          {fix && fixHref && (
            <ActionLink variant="ghost" size="sm" href={fixHref}>
              <Wrench aria-hidden="true" />
              {t(FIX_LABEL[fix])}
            </ActionLink>
          )}
          <span className="p-cell-meta">{t("checkConnectionHelp")}</span>
        </div>
      )}
    </div>
  );
}

export function WorkspaceSystems() {
  const { orgId, workspace, canWrite, canManage, withOrg } = useWorkspace();
  const { summary, error, reload, retry, loading } = useWorkspaceSummary(orgId);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = params.get("system");
  const fixing = params.get("fix") === "1";
  const [panelPending, setPanelPending] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const checks = useConnectionCheck(orgId, reload);
  const system = summary?.systems.find((item) => item.id === openId) ?? null;
  const items = useItemActions(orgId, reload);
  const fixRef = useRef<HTMLDivElement>(null);
  usePageCrumb(system?.title);
  const usedBy = (item: WorkspaceSystem) => summary?.evaluations.filter((evaluation) => (evaluation.selected_target_id ? evaluation.selected_target_id === item.id : evaluation.project_id === item.project_id)) ?? [];
  const latestReport = (item: WorkspaceSystem): WorkspaceReport | undefined => {
    const [latest] = scoreHistory(summary?.reports ?? [], (report) => report.target_id === item.id, 1);
    return latest ? summary?.reports.find((report) => report.id === latest.reportId) : undefined;
  };

  // "Fix" lands on the section that fixes it once the panel has rendered.
  useEffect(() => {
    if (!system || !fixing) return;
    const timer = window.setTimeout(() => fixRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 150);
    return () => window.clearTimeout(timer);
  }, [system, fixing]);

  if (!workspace) return <NoWorkspace />;

  /** The open panel lives in the address (`?system=`), so a system can be linked from Home, ⌘K and Connect. */
  function open(id: string | null, fix = false) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("system", id);
    else next.delete("system");
    if (fix) next.set("fix", "1");
    else next.delete("fix");
    setPairing(null);
    setPanelError("");
    checks.clearError();
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }
  const fixHref = (item: WorkspaceSystem) => withOrg(`/workspace/systems?system=${item.id}&fix=1`);

  async function pair(item: WorkspaceSystem) {
    setPanelPending(true);
    setPanelError("");
    setPairing(null);
    try {
      setPairing(await evalRequest<{ code: string; expiresAt: string }>("/runner/pairings", "POST", { orgId, targetId: item.id }));
    } catch (value) {
      setPanelError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPanelPending(false);
    }
  }
  async function revoke(item: WorkspaceSystem) {
    if (!item.runner_id) return;
    setPanelPending(true);
    setPanelError("");
    try {
      await evalRequest(`/runner/${item.runner_id}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      notify(t("runnerRevoked"));
      await reload();
    } catch (value) {
      setPanelError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPanelPending(false);
    }
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
      >
        {summary?.systems.length ? t("systemsHelp") : undefined}
      </PageHeading>
      {error && (
        <Status error action={<Action variant="secondary" size="sm" onClick={retry}>{t("retry")}</Action>}>
          {error}
        </Status>
      )}
      {checks.error && !system && <Status error>{checks.error}</Status>}
      {!summary ? (
        loading ? <TableSkeleton columns={5} /> : null
      ) : summary.systems.length ? (
        <DataTable caption={t("systems")} headers={[t("system"), t("statusLabel"), t("lastSuccessfulCheck"), t("lastScore"), { label: t("actions"), align: "end", hidden: true }]}>
          {summary.systems.map((item) => {
            const health = systemHealth(item);
            const evaluations = usedBy(item);
            const report = latestReport(item);
            const fix = canWrite ? fixAction(item) : null;
            const fixAllowed = fix === "reteach" ? canManage : !!fix;
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
                  <StatusBadge value={health} label={t(HEALTH_LABEL[health])} />
                  {item.error_code && health === "needs_attention" && <span className="p-cell-meta p-cell-note">{humanize(item.error_code.toLowerCase())}</span>}
                </td>
                <td className="p-cell-meta">{health === "manual" ? "—" : <Time value={lastHealthy(item)} />}</td>
                <td>
                  {report?.strict_pass_rate != null ? (
                    <Link className="p-link" href={withOrg(`/workspace/reports/${report.id}`)}>{percent(report.strict_pass_rate)}</Link>
                  ) : (
                    <span className="p-cell-meta">—</span>
                  )}
                </td>
                <td className="p-table-action">
                  {fix && fixAllowed && (
                    <ActionLink variant="ghost" size="sm" href={fixHref(item)}>
                      <Wrench aria-hidden="true" />
                      {t("fix")}
                      <span className="sr-only">: {item.title}</span>
                    </ActionLink>
                  )}
                  {canWrite && canCheckConnection(item.document.kind) && (
                    <Action variant="secondary" size="sm" onClick={() => void checks.check(item)} disabled={!!checks.pending || health === "checking"}>
                      <RefreshCw aria-hidden="true" />
                      {checks.pending === item.id || health === "checking" ? t("checking") : t("checkNow")}
                      <span className="sr-only">: {item.title}</span>
                    </Action>
                  )}
                  <ActionMenu
                    label={`${t("actions")}: ${item.title}`}
                    items={[
                      { label: t("details"), onSelect: () => open(item.id) },
                      ...(canWrite && isApiKind(item.document.kind) ? [{ label: t("manageCredentials"), icon: <KeyRound />, onSelect: () => open(item.id, true) }] : []),
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
        <SystemsEmpty />
      )}

      <SidePanel
        open={!!system}
        onOpenChange={(value) => !value && open(null)}
        title={system?.title ?? t("system")}
        description={system ? <>{connectionLabel(system.document.kind)}{systemStatus(system) && <StatusBadge value={systemHealth(system)} label={t(HEALTH_LABEL[systemHealth(system)])} />}</> : undefined}
        wide
      >
        {system && (
          <>
            {panelError && <Status error>{panelError}</Status>}
            <DefinitionList
              items={[
                { term: t("connectionType"), value: connectionLabel(system.document.kind) },
                { term: t("usedBy"), value: usedBy(system).map((item) => item.title).join(", ") || "—" },
                { term: t("lastChecked"), value: <Time value={system.connection_checked_at ?? null} /> },
              ]}
            />
            <ConnectionHealth system={system} orgId={orgId} onChecked={reload} />
            <div ref={fixRef} className="p-stack">
              {isApiKind(system.document.kind) && canWrite && (
                <TargetCredentials key={system.id} orgId={orgId} targetId={system.id} canRevoke={canManage} onChanged={() => void reload()} />
              )}
              {system.document.kind === "website" && canManage && <><WebAppConnector key={system.id} orgId={orgId} targetId={system.id} status={system.connection_status} errorCode={system.error_code} onChanged={reload} /><WebsiteLoginSessions orgId={orgId} targetId={system.id} /></>}
              {system.document.kind === "website" && !canManage && canWrite && fixAction(system) === "reteach" && <Status>{t("fixReteachOwner")}</Status>}
              {system.document.kind === "private_runner" && canWrite && (
                <section>
                  <SectionHeading title={t("privateRunner")}>{t("privateRunnerHelp")}</SectionHeading>
                  {pairing && (
                    <CopyField label={t("pairingCode")} value={pairing.code} hint={`${t("expires")} ${new Date(pairing.expiresAt).toLocaleTimeString()}. ${t("pairingShownOnce")}`} />
                  )}
                  <div className="p-row">
                    <Action variant="secondary" onClick={() => void pair(system)} disabled={panelPending}>
                      {system.runner_id ? t("replacePairing") : t("createPairingCode")}
                    </Action>
                    {system.runner_id && system.runner_status !== "revoked" && canManage && (
                      <Action variant="ghost" onClick={() => void revoke(system)} disabled={panelPending}>
                        {t("revokeRunner")}
                      </Action>
                    )}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </SidePanel>
      {items.dialog}
    </>
  );
}

/** No systems yet: the three ways to connect one, each with an example. */
function SystemsEmpty() {
  const { canWrite, withOrg } = useWorkspace();
  const kinds = [
    { icon: <Globe />, title: t("websiteChatbot"), body: t("systemsEmptyWebsite"), example: t("systemsEmptyWebsiteExample") },
    { icon: <Code2 />, title: t("apiSystem"), body: t("systemsEmptyApi"), example: t("systemsEmptyApiExample") },
    { icon: <FileSpreadsheet />, title: t("uploadAnswers"), body: t("systemsEmptyUpload"), example: t("systemsEmptyUploadExample") },
  ];
  return (
    <>
      <EmptyState
        title={t("noSystems")}
        icon={<Plug />}
        action={
          canWrite && (
            <ActionLink href={withOrg("/workspace/evaluations/new")}>
              <Plus aria-hidden="true" />
              {t("connectSystemAction")}
            </ActionLink>
          )
        }
      >
        <p>{t("systemsEmptyHelp")}</p>
      </EmptyState>
      <ul className="p-connect-kinds" aria-label={t("systemsEmptyKinds")}>
        {kinds.map((kind) => (
          <li key={kind.title} className="p-connect-kind">
            <span className="p-home-card-icon" aria-hidden="true">{kind.icon}</span>
            <strong>{kind.title}</strong>
            <span>{kind.body}</span>
            <span className="p-cell-meta">{kind.example}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
