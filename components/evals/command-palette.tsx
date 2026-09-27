"use client";

/**
 * ⌘K / Ctrl+K: jump to any screen, evaluation, report or system in the
 * current workspace, or switch workspace, without learning the navigation.
 * Items come from the same scoped APIs as the screens; nothing is cached.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Building2, FileText, FlaskConical, Plug, Plus, Search } from "lucide-react";
import { evalRequest } from "./api";
import { useWorkspace } from "./workspace-context";
import { t } from "@/lib/evals/messages/en";

export type PaletteLink = { href: string; label: string; icon: ReactNode; group: string };
type Summary = {
  evaluations: Array<{ id: string; title: string; project_title: string }>;
  reports: Array<{ id: string; title: string }>;
  systems: Array<{ id: string; title: string }>;
};

export function CommandPalette({
  open,
  onOpenChange,
  links,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: PaletteLink[];
}) {
  const router = useRouter();
  const { orgId, workspaces, workspace, canWrite, setOrgId, withOrg } = useWorkspace();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!open || !orgId) return;
    let live = true;
    void evalRequest<Summary>(`/workspace/summary?orgId=${encodeURIComponent(orgId)}`)
      .then((value) => live && setSummary(value))
      .catch(() => live && setSummary(null));
    return () => {
      live = false;
    };
  }, [open, orgId]);

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
              {canWrite && (
                <Command.Group heading={t("actions")}>
                  <Command.Item value="new evaluation create" onSelect={() => go(withOrg("/workspace/evaluations/new"))}>
                    <Plus aria-hidden="true" />
                    {t("newEvaluationAction")}
                  </Command.Item>
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
                    <Command.Item key={item.id} value={`system ${item.title} ${item.id}`} onSelect={() => go(withOrg("/workspace/systems"))}>
                      <Plug aria-hidden="true" />
                      <span className="p-palette-text">{item.title}</span>
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
