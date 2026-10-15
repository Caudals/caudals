"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { evalRequest } from "./api";
import { Action, Badge, Check, PageHeading, SettingsRow, Status, Tabs } from "./primitives";
import { ExampleEvaluationSetting } from "./example-evaluation-links";
import { DpaSetting } from "./dpa-setting";
import { notify } from "./overlays";
import { useBilling } from "./billing-state";
import { PlanAndLimits, WorkspaceBilling } from "./workspace-billing";
import { InvitationManager } from "./invitation-manager";
import { DeveloperAccess, MonitoringSchedules } from "./workspace-monitoring";
import { ApiReference } from "./api-reference";
import { WorkspaceDeletion } from "./workspace-deletion";
import { WorkspaceDataControls } from "./workspace-data-controls";
import { EngineSettings } from "./engine-settings";
import { ByokSettings, useByokSettings } from "./byok-settings";
import { LocaleSwitch } from "./locale";
import { RenameDialog } from "./item-actions";
import { NoWorkspace } from "./workspace-evaluations";
import { useWorkspace } from "./workspace-context";
import { connectionLabel, useWorkspaceSummary, type WorkspaceSummary } from "./workspace-data";
import { rememberTab, rememberedTab, settingsTabs, type SettingsTab } from "./settings-tabs";
import { getLocale, t } from "@/lib/evals/messages/runtime";

type Tab = SettingsTab;

/**
 * `estimatesApi`: the estimate endpoint accepts API tokens (BILLING_ESTIMATES_ENABLED=true, read on the server).
 * `integrationsV2`: CI tokens, Slack/Teams/email destinations and release-gate thresholds (INTEGRATIONS_V2_ENABLED, launch L-19).
 * `dataControls`: answer retention and workspace export (DATA_CONTROLS_ENABLED=true, read on the server; launch L-32).
 */
export function WorkspaceSettings({ marketingOrigin, estimatesApi = false, integrationsV2 = false, dataControls = false }: { marketingOrigin?: string; estimatesApi?: boolean; integrationsV2?: boolean; dataControls?: boolean } = {}) {
  const { orgId, workspace, role, canManage, platformAdmin } = useWorkspace();
  const { summary, error, reload, retry } = useWorkspaceSummary(orgId);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const owner = role === "owner";
  // Billing and usage (launch L-15): owners and editors where the billing screens show.
  const { summary: billing } = useBilling();
  // Your own model keys (launch L-27): the server answers only where BYOK is open or a key still exists.
  const byok = useByokSettings(orgId, owner || platformAdmin);
  const tabs = settingsTabs({ canManage, platformAdmin, owner, billing: !!billing, models: !!byok.data, data: dataControls });
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = tabs.some((item) => item.value === requested) ? requested! : "general";
  function select(value: Tab) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  // Settings opens on the tab this device last showed unless the link names one (launch L-22).
  const hasTab = params.has("tab");
  const allowed = tabs.map((item) => item.value).join();
  useEffect(() => {
    if (hasTab) rememberTab("settings", tab);
  }, [hasTab, tab]);
  useEffect(() => {
    if (hasTab) return;
    const saved = rememberedTab("settings");
    if (saved && saved !== "general" && allowed.split(",").includes(saved)) {
      const next = new URLSearchParams(window.location.search);
      next.set("tab", saved);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
  }, [hasTab, allowed, pathname, router]);

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
        <div className="p-stack">
          {byok.data && <ByokSettings key={`byok-${orgId}`} orgId={orgId} data={byok.data} onChange={byok.setData} />}
          {platformAdmin && <EngineSettings key={orgId} orgId={orgId} workspaceName={workspace.name} />}
        </div>
      ) : tab === "billing" ? (
        <WorkspaceBilling key={orgId} />
      ) : !summary ? (
        <p className="p-loading" role="status">
          <span className="p-spinner" aria-hidden="true" />
          {t("loading")}
        </p>
      ) : tab === "general" ? (
        <General key={orgId} platformAdmin={platformAdmin} onManageRoles={() => select("members")} summary={summary} orgId={orgId} workspaceName={workspace.name} role={role} canRename={canManage || platformAdmin} marketingOrigin={marketingOrigin} />
      ) : tab === "members" ? (
        <InvitationManager orgId={orgId} workspaceName={workspace.name} />
      ) : tab === "notifications" ? (
        <Notifications orgId={orgId} summary={summary} onSaved={reload} />
      ) : tab === "monitoring" ? (
        <MonitoringSchedules orgId={orgId} canManage={canManage} summary={summary} integrationsV2={integrationsV2} />
      ) : tab === "developers" ? (
        <>
          <DeveloperAccess orgId={orgId} canManage={canManage} integrationsV2={integrationsV2} />
          <ApiReference orgId={orgId} estimates={estimatesApi} integrations={integrationsV2} />
        </>
      ) : tab === "data" ? (
        <WorkspaceDataControls key={orgId} orgId={orgId} owner={owner} />
      ) : (
        <div className="p-settings">
          <WorkspaceDeletion key={orgId} orgId={orgId} workspaceName={workspace.name} exportFirst={dataControls && owner} />
        </div>
      )}
    </>
  );
}

/**
 * Settings → General. "Plan and limits" (launch L-15, P-13) replaces the
 * machine-spend, run-allowance, connection and export rows: the plan and its
 * limits in plain words, and the credit balance where billing shows. Machine
 * spend and entitlement amendments stay in ops (/ops/platform/usage).
 */
function General({ summary, orgId, workspaceName, role, canRename, platformAdmin, onManageRoles, marketingOrigin }: { summary: WorkspaceSummary; orgId: string; workspaceName: string; role: string; canRename: boolean; platformAdmin: boolean; onManageRoles: () => void; marketingOrigin?: string }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const { entitlement } = summary;
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
      <SettingsRow title={t("language")} description={t("languageHelp")}>
        <LocaleSwitch compact />
      </SettingsRow>
      <ExampleEvaluationSetting />
      <SettingsRow title={t("yourRole")} description={t("yourRoleHelp")}>
        <span className="p-row">
          <Badge>{t((role || "viewer") as "owner" | "editor" | "viewer" | "operator")}</Badge>
          {platformAdmin && <Action variant="secondary" size="sm" onClick={onManageRoles}>{t("manageRoles")}</Action>}
        </span>
      </SettingsRow>
      <DpaSetting orgId={orgId} workspaceName={workspaceName} marketingOrigin={marketingOrigin} />
      <SettingsRow title={t("planAndLimits")} description={t("planAndLimitsHelp")} id="plan-and-limits">
        <PlanAndLimits entitlement={entitlement} systems={summary.systems.length} />
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

/**
 * In-app categories, then one email switch per category (launch L-07): the
 * evaluation categories, billing and regressions for this workspace, and the
 * "getting started" emails for the person across workspaces. Saving also
 * records the interface language as the email language.
 */
function Notifications({ orgId, summary, onSaved }: { orgId: string; summary: WorkspaceSummary; onSaved: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const p = summary.preferences;
  const email = {
    completion: p.email_completion ?? (p.email && p.completion),
    requiredInput: p.email_required_input ?? (p.email && p.required_input),
    failure: p.email_failure ?? (p.email && p.failure),
    billing: p.email_billing ?? true,
    regressions: p.email_regressions ?? true,
    lifecycle: p.lifecycle ?? true,
  };
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await evalRequest("/workspace/preferences", "PATCH", {
        orgId,
        completion: form.has("completion"),
        requiredInput: form.has("requiredInput"),
        failure: form.has("failure"),
        emailCompletion: form.has("emailCompletion"),
        emailRequiredInput: form.has("emailRequiredInput"),
        emailFailure: form.has("emailFailure"),
        emailBilling: form.has("emailBilling"),
        emailRegressions: form.has("emailRegressions"),
        lifecycle: form.has("lifecycle"),
        locale: getLocale(),
      });
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
          <Check name="completion" defaultChecked={p.completion} label={t("notifyCompletion")} />
          <Check name="requiredInput" defaultChecked={p.required_input} label={t("notifyRequiredInput")} />
          <Check name="failure" defaultChecked={p.failure} label={t("notifyFailure")} />
        </span>
      </SettingsRow>
      <SettingsRow title={t("emailNotificationsTitle")} description={t("emailCategoriesHelp")}>
        <span className="p-stack p-stack-tight">
          <Check name="emailCompletion" defaultChecked={email.completion} label={t("emailCategoryCompletion")} />
          <Check name="emailRequiredInput" defaultChecked={email.requiredInput} label={t("notifyRequiredInput")} />
          <Check name="emailFailure" defaultChecked={email.failure} label={t("notifyFailure")} />
          <Check name="emailBilling" defaultChecked={email.billing} label={t("emailCategoryBilling")} description={t("emailCategoryBillingHelp")} />
          <Check name="emailRegressions" defaultChecked={email.regressions} label={t("emailCategoryRegressions")} description={t("emailCategoryRegressionsHelp")} />
        </span>
      </SettingsRow>
      <SettingsRow title={t("emailLifecycleTitle")} description={t("emailLifecycleHelp")}>
        <Check name="lifecycle" defaultChecked={email.lifecycle} label={t("emailCategoryLifecycle")} />
      </SettingsRow>
      <div className="p-settings-actions">
        <Action type="submit" disabled={pending}>
          {pending ? t("saving") : t("savePreferences")}
        </Action>
      </div>
    </form>
  );
}
