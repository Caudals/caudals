"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { evalRequest } from "./api";
import { Action, Badge, Check, PageHeading, SettingsRow, Status, Tabs, formatMoney } from "./primitives";
import { Meter } from "./charts";
import { notify } from "./overlays";
import { InvitationManager } from "./invitation-manager";
import { DeveloperAccess, MonitoringSchedules } from "./workspace-monitoring";
import { WorkspaceDeletion } from "./workspace-deletion";
import { EngineSettings } from "./engine-settings";
import { RenameDialog } from "./item-actions";
import { NoWorkspace } from "./workspace-evaluations";
import { useWorkspace } from "./workspace-context";
import { connectionLabel, useWorkspaceSummary, type WorkspaceSummary } from "./workspace-data";
import { t } from "@/lib/evals/messages/en";

type Tab = "general" | "members" | "notifications" | "monitoring" | "developers" | "models" | "danger";

export function WorkspaceSettings() {
  const { orgId, workspace, role, canManage, platformAdmin } = useWorkspace();
  const { summary, error, reload, retry } = useWorkspaceSummary(orgId);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const owner = role === "owner";
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "general", label: t("general") },
    ...(canManage ? [{ value: "members" as const, label: t("members") }] : []),
    { value: "notifications", label: t("notifications") },
    { value: "monitoring", label: t("monitoring") },
    { value: "developers", label: t("developers") },
    ...(platformAdmin ? [{ value: "models" as const, label: t("aiModels") }] : []),
    ...(owner || platformAdmin ? [{ value: "danger" as const, label: t("dangerZone") }] : []),
  ];
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = tabs.some((item) => item.value === requested) ? requested! : "general";
  function select(value: Tab) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  if (!workspace) return <NoWorkspace />;
  return (
    <>
      <PageHeading title={t("settings")}>{workspace.name}</PageHeading>
      <Tabs value={tab} onChange={select} label={t("settingsSections")} options={tabs} />
      {error && (
        <Status error action={<Action variant="secondary" size="sm" onClick={retry}>{t("retry")}</Action>}>
          {error}
        </Status>
      )}
      {tab === "models" ? (
        <EngineSettings key={orgId} orgId={orgId} workspaceName={workspace.name} />
      ) : !summary ? (
        <p className="p-loading" role="status">
          <span className="p-spinner" aria-hidden="true" />
          {t("loading")}
        </p>
      ) : tab === "general" ? (
        <General summary={summary} orgId={orgId} workspaceName={workspace.name} role={role} canRename={canManage || platformAdmin} />
      ) : tab === "members" ? (
        <InvitationManager orgId={orgId} workspaceName={workspace.name} />
      ) : tab === "notifications" ? (
        <Notifications orgId={orgId} summary={summary} onSaved={reload} />
      ) : tab === "monitoring" ? (
        <MonitoringSchedules orgId={orgId} canManage={canManage} summary={summary} />
      ) : tab === "developers" ? (
        <DeveloperAccess orgId={orgId} canManage={canManage} />
      ) : (
        <div className="p-settings">
          <WorkspaceDeletion key={orgId} orgId={orgId} workspaceName={workspace.name} />
        </div>
      )}
    </>
  );
}

function General({ summary, orgId, workspaceName, role, canRename }: { summary: WorkspaceSummary; orgId: string; workspaceName: string; role: string; canRename: boolean }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const { entitlement, usage } = summary;
  const limit = Number(entitlement.monthly_spend_limit);
  const used = Number(usage.settled) + Number(usage.outstanding);
  return (
    <div className="p-settings">
      <SettingsRow title={t("workspace")} description={t("workspaceNameHelp")}>
        <span className="p-row p-nowrap">
          <strong>{workspaceName}</strong>
          {canRename && (
            <Action variant="secondary" size="sm" onClick={() => setRenaming(true)}>
              {t("rename")}
            </Action>
          )}
        </span>
        {renaming && (
          <RenameDialog
            title={t("renameWorkspace")}
            label={t("workspaceName")}
            initial={workspaceName}
            onClose={() => setRenaming(false)}
            onSave={async (name) => {
              await evalRequest(`/workspaces/${orgId}`, "PATCH", { name });
              router.refresh();
            }}
          />
        )}
      </SettingsRow>
      <SettingsRow title={t("yourRole")} description={t("yourRoleHelp")}>
        <Badge>{t((role || "viewer") as "owner" | "editor" | "viewer" | "operator")}</Badge>
      </SettingsRow>
      <SettingsRow
        title={t("spendThisMonth")}
        description={`${t("settledSpend")}: ${formatMoney(usage.settled, entitlement.currency)} · ${t("outstandingSpend")}: ${formatMoney(usage.outstanding, entitlement.currency)}. ${t("spendHelp")}`}
      >
        <span className="p-row p-nowrap">
          <Meter value={limit > 0 ? used / limit : null} label={t("spendThisMonth")} />
          <span className="p-cell-meta">
            {formatMoney(used)} / {formatMoney(entitlement.monthly_spend_limit, entitlement.currency)}
          </span>
        </span>
      </SettingsRow>
      <SettingsRow title={t("activeRunAllowance")} description={t("activeRunAllowanceHelp")}>
        <strong>{entitlement.max_active_runs}</strong>
      </SettingsRow>
      <SettingsRow title={t("allowedConnections")} description={t("allowedConnectionsHelp")}>
        <span className="p-row">
          {[...new Set(entitlement.allowed_connection_types.map(connectionLabel))].map((label) => (
            <Badge key={label}>{label}</Badge>
          ))}
        </span>
      </SettingsRow>
      <SettingsRow title={t("exportsAndScheduling")} description={t("exportsAndSchedulingHelp")}>
        <span className="p-row">
          <Badge tone={entitlement.can_export ? "pass" : "neutral"} dot>
            {entitlement.can_export ? t("exportsOn") : t("exportsOff")}
          </Badge>
          <Badge tone={entitlement.can_schedule ? "pass" : "neutral"} dot>
            {entitlement.can_schedule ? t("schedulingOn") : t("schedulingOff")}
          </Badge>
        </span>
      </SettingsRow>
    </div>
  );
}

function Notifications({ orgId, summary, onSaved }: { orgId: string; summary: WorkspaceSummary; onSaved: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await evalRequest("/workspace/preferences", "PATCH", { orgId, completion: form.has("completion"), requiredInput: form.has("requiredInput"), failure: form.has("failure"), email: form.has("email") });
      notify(t("preferencesSaved"));
      await onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="p-settings" onSubmit={save} key={JSON.stringify(summary.preferences)}>
      {error && <Status error>{error}</Status>}
      <SettingsRow title={t("inAppNotifications")} description={t("inAppNotificationsHelp")}>
        <span className="p-stack p-stack-tight">
          <Check name="completion" defaultChecked={summary.preferences.completion} label={t("notifyCompletion")} />
          <Check name="requiredInput" defaultChecked={summary.preferences.required_input} label={t("notifyRequiredInput")} />
          <Check name="failure" defaultChecked={summary.preferences.failure} label={t("notifyFailure")} />
        </span>
      </SettingsRow>
      <SettingsRow title={t("emailNotificationsTitle")} description={t("emailNotificationsHelp")}>
        <Check name="email" defaultChecked={summary.preferences.email} label={t("emailNotifications")} />
      </SettingsRow>
      <div className="p-settings-actions">
        <Action type="submit" disabled={pending}>
          {pending ? t("saving") : t("savePreferences")}
        </Action>
      </div>
    </form>
  );
}
