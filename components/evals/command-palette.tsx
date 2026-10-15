"use client";

/**
 * ⌘K / Ctrl+K: jump to any screen, evaluation, report, system, test set or
 * settings tab in the current workspace, or switch workspace, without learning
 * the navigation (launch L-22 added systems as deep links, test sets and
 * settings tabs). Items come from the same scoped APIs as the screens;
 * nothing is cached. The Settings tabs are the ones Settings shows the same
 * person: AI models for platform admins, and for owners when the workspace's
 * own-key settings answer (launch L-27, the request Settings makes); Data
 * while DATA_CONTROLS_ENABLED is on, for every member (launch L-32).
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Building2, CircleHelp, FileText, FlaskConical, ListChecks, Plug, Plus, Search, Settings } from "lucide-react";
import { evalRequest } from "./api";
import { useWorkspace } from "./workspace-context";
import { settingsTabs } from "./settings-tabs";
import { useBilling } from "./billing-state";
import { t } from "@/lib/evals/messages/runtime";

export type PaletteLink = { href: string; label: string; icon: ReactNode; group: string };
type Summary = {
  evaluations: Array<{ id: string; title: string; project_title: string }>;
  reports: Array<{ id: string; title: string }>;
  systems: Array<{ id: string; title: string }>;
};
type TestSet = { suite_id: string; title: string; project_title: string };

export function CommandPalette({
  open,
  onOpenChange,
  links,
  onHelp,
  dataControls = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: PaletteLink[];
  /** Opens the help panel; the palette closes first. */
  onHelp?: () => void;
  /** Settings → Data is on (DATA_CONTROLS_ENABLED, read on the server). */
  dataControls?: boolean;
}) {
  const router = useRouter();
  const { orgId, workspaces, workspace, role, canWrite, canManage, platformAdmin, setOrgId, withOrg } = useWorkspace();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  // The workspace whose own-key settings answered for this owner (Settings → AI models shows then).
  const [modelsFor, setModelsFor] = useState("");
  const ownerOnly = role === "owner" && !platformAdmin;

  useEffect(() => {
    if (!open || !orgId) return;
    let live = true;
    void evalRequest<Summary>(`/workspace/summary?orgId=${encodeURIComponent(orgId)}`)
      .then((value) => live && setSummary(value))
      .catch(() => live && setSummary(null));
    void evalRequest<TestSet[]>(`/suites?orgId=${encodeURIComponent(orgId)}&grouped=1`)
      .then((value) => live && setTestSets(value))
      .catch(() => live && setTestSets([]));
    // Platform admins always have the tab; editors and viewers never do.
    if (ownerOnly)
      void evalRequest<unknown>(`/engine/byok?orgId=${encodeURIComponent(orgId)}`)
        // `null`: own keys are closed in this workspace (R3; a 404 before).
        .then((value) => live && setModelsFor(value ? orgId : ""))
        .catch(() => live && setModelsFor(""));
    return () => {
      live = false;
    };
  }, [open, orgId, ownerOnly]);
  const { summary: billing } = useBilling();
  const settings = workspace
    ? settingsTabs({ canManage, platformAdmin, owner: role === "owner", billing: !!billing, models: ownerOnly && modelsFor === orgId, data: dataControls })
    : [];
  const searchHint: Partial<Record<string, string>> = { models: t("paletteModelsKeywords"), data: t("paletteDataKeywords") };

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const groups = [...new Set(links.map((link) => link.group))];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="p-scrim" />
        <DialogPrimitive.Content className="p-root p-palette" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">{t("commandPalette")}</DialogPrimitive.Title>
          <Command label={t("commandPalette")} loop>
            <div className="p-palette-input">
              <Search aria-hidden="true" />
              <Command.Input placeholder={workspace ? `${t("searchIn")} ${workspace.name}…` : `${t("search")}…`} autoFocus />
              <kbd className="p-kbd">Esc</kbd>
            </div>
            <Command.List className="p-palette-list">
              <Command.Empty className="p-palette-empty">{t("noMatches")}</Command.Empty>
              {(canWrite || onHelp) && (
                <Command.Group heading={t("actions")}>
                  {canWrite && (
                    <Command.Item value="new evaluation create" onSelect={() => go(withOrg("/workspace/evaluations/new"))}>
                      <Plus aria-hidden="true" />
                      {t("newEvaluationAction")}
                    </Command.Item>
                  )}
                  {onHelp && (
                    <Command.Item
                      value={`help ${t("help")} glossary support`}
                      onSelect={() => {
                        onOpenChange(false);
                        onHelp();
                      }}
                    >
                      <CircleHelp aria-hidden="true" />
                      {t("help")}
                    </Command.Item>
                  )}
                </Command.Group>
              )}
              {summary?.evaluations.length ? (
                <Command.Group heading={t("product")}>
                  {summary.evaluations.slice(0, 30).map((item) => (
                    <Command.Item key={item.id} value={`evaluation ${item.title} ${item.project_title} ${item.id}`} onSelect={() => go(withOrg(`/workspace/evaluations/${item.id}`))}>
                      <FlaskConical aria-hidden="true" />
                      <span className="p-palette-text">{item.title}</span>
                      <span className="p-palette-meta">{item.project_title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {summary?.reports.length ? (
                <Command.Group heading={t("reports")}>
                  {summary.reports.slice(0, 30).map((item) => (
                    <Command.Item key={item.id} value={`report ${item.title} ${item.id}`} onSelect={() => go(withOrg(`/workspace/reports/${item.id}`))}>
                      <FileText aria-hidden="true" />
                      <span className="p-palette-text">{item.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {summary?.systems.length ? (
                <Command.Group heading={t("systems")}>
                  {summary.systems.slice(0, 30).map((item) => (
                    <Command.Item key={item.id} value={`system ${item.title} ${item.id}`} onSelect={() => go(withOrg(`/workspace/systems?system=${item.id}`))}>
                      <Plug aria-hidden="true" />
                      <span className="p-palette-text">{item.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {testSets.length ? (
                <Command.Group heading={t("testSets")}>
                  {testSets.slice(0, 30).map((item) => (
                    <Command.Item key={item.suite_id} value={`test set ${item.title} ${item.project_title} ${item.suite_id}`} onSelect={() => go(withOrg(`/workspace/test-sets/${item.suite_id}`))}>
                      <ListChecks aria-hidden="true" />
                      <span className="p-palette-text">{item.title}</span>
                      <span className="p-palette-meta">{item.project_title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {settings.length ? (
                <Command.Group heading={t("settings")}>
                  {settings.map((item) => (
                    <Command.Item key={item.value} value={`settings ${t("settings")} ${item.label} ${item.value} ${searchHint[item.value] ?? ""}`} onSelect={() => go(withOrg(`/workspace/settings?tab=${item.value}`))}>
                      <Settings aria-hidden="true" />
                      <span className="p-palette-text">{item.label}</span>
                      <span className="p-palette-meta">{t("settings")}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {groups.map((group) => (
                <Command.Group key={group} heading={group}>
                  {links
                    .filter((link) => link.group === group)
                    .map((link) => (
                      <Command.Item key={link.href} value={`${group} ${link.label}`} onSelect={() => go(link.href)}>
                        {link.icon}
                        {link.label}
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}
              {workspaces.length > 1 && (
                <Command.Group heading={t("switchWorkspace")}>
                  {workspaces.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`workspace switch ${item.name}`}
                      onSelect={() => {
                        onOpenChange(false);
                        setOrgId(item.id);
                      }}
                    >
                      <Building2 aria-hidden="true" />
                      <span className="p-palette-text">{item.name}</span>
                      {item.id === orgId && <span className="p-palette-meta">{t("current")}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
