"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { getOperatorConsoleOverview } from "@/lib/actions/operator-console-actions";
import { useAuth } from "@/lib/auth/provider";
import { useTranslations } from "@/lib/i18n/use-translations";
import type { OperatorConsoleSnapshot } from "@/lib/operator/console-snapshot";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CreditCard,
  Database,
  FileText,
  FileUp,
  FolderArchive,
  LifeBuoy,
  ListChecks,
  Search,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";

type PaletteItem = {
  key: string;
  label: string;
  href: string;
  description?: string;
  shortcut?: string;
  searchValue: string;
  icon: LucideIcon;
};

function anchorHref(moduleKey: string, id: string) {
  return `/admin?module=${moduleKey}#${encodeURIComponent(id)}`;
}

function addUniqueRecord(items: Map<string, PaletteItem>, item: PaletteItem) {
  if (!items.has(item.key)) {
    items.set(item.key, item);
  }
}

function buildRecordItems(snapshot: OperatorConsoleSnapshot): PaletteItem[] {
  const items = new Map<string, PaletteItem>();
  const workItems = Object.values(snapshot.workItems).flat();

  for (const item of workItems) {
    addUniqueRecord(items, {
      key: `${item.recordType}:${item.id}`,
      label: item.title,
      href: anchorHref(item.moduleKey, item.id),
      description: `${item.recordType} / ${item.state} / ${item.detail}`,
      shortcut: item.id,
      searchValue: [
        item.title,
        item.id,
        item.recordType,
        item.state,
        item.detail,
        item.moduleKey,
      ].join(" "),
      icon: Search,
    });
  }

  for (const build of snapshot.builds) {
    addUniqueRecord(items, {
      key: `build:${build.id}`,
      label: build.title,
      href: anchorHref("builds", build.id),
      description: `build / ${build.state} / ${build.buyerBriefId} / ${build.supplierOrgId}`,
      shortcut: build.id,
      searchValue: [
        build.title,
        build.id,
        build.state,
        build.buyerBriefId,
        build.supplierOrgId,
      ].join(" "),
      icon: Activity,
    });
  }

  for (const event of snapshot.lineageEvents) {
    addUniqueRecord(items, {
      key: `lineage_event:${event.id}`,
      label: event.jobName,
      href: anchorHref("datasets", event.id),
      description: `lineage_event / ${event.datasetVersionId} / ${event.namespace}`,
      shortcut: event.datasetVersionId,
      searchValue: [
        event.id,
        event.jobName,
        event.datasetVersionId,
        event.namespace,
      ].join(" "),
      icon: Database,
    });
  }

  for (const row of snapshot.auditRows) {
    addUniqueRecord(items, {
      key: `audit_event:${row.id}`,
      label: row.action,
      href: anchorHref("audit", row.id),
      description: `${row.target} / ${row.actor}`,
      shortcut: row.id,
      searchValue: [row.id, row.action, row.target, row.actor].join(" "),
      icon: FileText,
    });
  }

  return Array.from(items.values()).slice(0, 48);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<OperatorConsoleSnapshot | null>(null);
  const [recordError, setRecordError] = useState(false);
  const recordsRequestStartedRef = useRef(false);
  const { userRole } = useAuth();
  const router = useRouter();
  const t = useTranslations();

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.key === "k" && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        setOpen((state) => !state);
      }
    };
    const openPalette = () => setOpen(true);
    const togglePalette = () => setOpen((state) => !state);

    document.addEventListener("keydown", down);
    window.addEventListener("caudals:open-command-palette", openPalette);
    window.addEventListener("caudals:toggle-command-palette", togglePalette);

    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("caudals:open-command-palette", openPalette);
      window.removeEventListener("caudals:toggle-command-palette", togglePalette);
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (
      !open ||
      !userRole ||
      snapshot ||
      recordError ||
      recordsRequestStartedRef.current
    ) {
      return;
    }

    recordsRequestStartedRef.current = true;

    getOperatorConsoleOverview()
      .then((result) => {
        if (active) {
          setSnapshot(result.data);
        }
      })
      .catch(() => {
        if (active) {
          setRecordError(true);
        }
      })
      .finally(() => {
        recordsRequestStartedRef.current = false;
      });

    return () => {
      active = false;
    };
  }, [open, recordError, snapshot, userRole]);

  const recordsPending = Boolean(open && userRole && !snapshot && !recordError);

  const navigationItems: PaletteItem[] = useMemo(() => {
    if (userRole) {
      return [
        { label: t("Pipeline / Home"), href: "/admin", icon: Shield },
        { label: t("Leads & Opportunities"), href: "/admin?module=leads", icon: FileText },
        { label: t("Suppliers"), href: "/admin?module=suppliers", icon: Users },
        { label: t("Buyers"), href: "/admin?module=buyers", icon: AlertCircle },
        { label: t("Builds"), href: "/admin?module=builds", icon: Activity },
        { label: t("Datasets"), href: "/admin?module=datasets", icon: Database },
        { label: t("Labeling"), href: "/admin?module=labeling", icon: ListChecks },
        { label: t("Quality"), href: "/admin?module=quality", icon: BarChart3 },
        { label: t("Privacy & Rights"), href: "/admin?module=privacy", icon: Shield },
        { label: t("Catalogue & Offers"), href: "/admin?module=catalogue", icon: FileUp },
        { label: t("Commercials"), href: "/admin?module=commercials", icon: CreditCard },
        { label: t("Operations"), href: "/admin?module=operations", icon: FolderArchive },
        { label: t("Escalations"), href: "/admin?module=escalations", icon: LifeBuoy },
        { label: t("Audit"), href: "/admin?module=audit", icon: Activity },
        { label: t("Settings"), href: "/admin?module=settings", icon: Settings },
      ].map((item) => ({
        ...item,
        key: item.href,
        searchValue: `${item.label} ${item.href}`,
        shortcut: item.href,
      }));
    }

    return [];
  }, [t, userRole]);

  const adminActions: PaletteItem[] = useMemo(() => {
    if (!userRole) return [];
    return [
      { label: t("Review active blockers"), href: "/admin" },
      { label: t("Open QA pending builds"), href: "/admin?module=builds" },
      { label: t("Open license vault"), href: "/admin?module=privacy" },
      { label: t("Open audit overlay"), href: "/admin?module=audit" },
    ].map((item) => ({
      ...item,
      key: item.label,
      searchValue: `${item.label} ${item.href}`,
      icon: Search,
    }));
  }, [t, userRole]);

  const recordItems = useMemo(
    () => (snapshot ? buildRecordItems(snapshot) : []),
    [snapshot]
  );

  const handleSelect = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("Search records, modules, or actions...")} />
      <CommandList>
        <CommandEmpty>
          {t("No matching modules or actions.")}
        </CommandEmpty>

        <CommandGroup heading={t("Navigation")}>
          {navigationItems.map((item) => (
            <CommandItem
              key={item.key}
              value={item.searchValue}
              onSelect={() => handleSelect(item.href)}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
              <CommandShortcut>{item.href}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        {adminActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("Admin actions")}>
              {adminActions.map((action) => (
                <CommandItem
                  key={action.href}
                  value={action.href}
                  onSelect={handleSelect}
                >
                  <Search className="h-4 w-4" />
                  <span>{action.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {userRole && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("Records")}>
              {recordsPending ? (
                <div className="px-3 py-2 text-sm text-slate-500">
                  {t("Loading operator records...")}
                </div>
              ) : recordError ? (
                <div className="px-3 py-2 text-sm text-red-700">
                  {t("Unable to load operator records.")}
                </div>
              ) : (
                recordItems.map((item) => (
                  <CommandItem
                    key={item.key}
                    value={item.searchValue}
                    onSelect={() => handleSelect(item.href)}
                  >
                    <item.icon className="h-4 w-4" />
                    <div className="min-w-0">
                      <p className="truncate">{item.label}</p>
                      {item.description ? (
                        <p className="truncate text-xs text-slate-500">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    {item.shortcut ? (
                      <CommandShortcut className="max-w-[160px] truncate font-mono">
                        {item.shortcut}
                      </CommandShortcut>
                    ) : null}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
