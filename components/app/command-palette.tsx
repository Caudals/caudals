"use client";

import { useEffect, useMemo, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/provider";
import { useTranslations } from "@/lib/i18n/use-translations";
import { FileText, Search, Settings, Shield, Users } from "lucide-react";

type DatasetResult = {
  id: string;
  title: string;
  approval_status: string | null;
  status: string | null;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [datasets, setDatasets] = useState<DatasetResult[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const { userRole } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations();

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.key === "k" && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    let active = true;
    const loadDatasets = async () => {
      if (userRole !== "admin" || query.trim().length < 3) {
        setDatasets([]);
        return;
      }
      setLoadingDatasets(true);
      const { data, error } = await supabase
        .from("dataset_requests")
        .select("id,title,approval_status,status")
        .ilike("title", `%${query.trim()}%`)
        .limit(12);
      if (!active) return;
      if (error) {
        console.error("Command palette search error", error);
        setDatasets([]);
      } else {
        setDatasets(data || []);
      }
      setLoadingDatasets(false);
    };
    const handle = setTimeout(loadDatasets, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, supabase, userRole]);

  const navigationItems = useMemo(() => {
    const base = [
      { label: t("Dashboard"), href: "/dashboard", icon: FileText },
      { label: t("Browse"), href: "/browse", icon: Search },
      { label: t("Settings"), href: "/dashboard/settings", icon: Settings },
    ];

    if (userRole === "admin") {
      return [
        ...base,
        { label: t("Admin Overview"), href: "/admin", icon: Shield },
        { label: t("Requests"), href: "/admin/requests", icon: FileText },
        { label: t("Submissions"), href: "/admin/submissions", icon: FileText },
        { label: t("Payments"), href: "/admin/payments", icon: FileText },
        { label: t("Users"), href: "/admin/users", icon: Users },
        { label: t("Activity log"), href: "/admin/activity", icon: Shield },
      ];
    }
    return base;
  }, [t, userRole]);

  const adminActions = useMemo(() => {
    if (userRole !== "admin") return [];
    return [
      { label: t("Approve next pending request"), href: "/admin/requests" },
      { label: t("Open payout queue"), href: "/admin/payments" },
      { label: t("Create featured ad"), href: "/admin/featured" },
      { label: t("Open analytics"), href: "/admin/analytics" },
    ];
  }, [t, userRole]);

  const handleSelect = (value: string) => {
    router.push(value);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label={t("Open command palette")}
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 hidden rounded-full border border-border/70 bg-background/90 px-3 py-2 text-xs font-medium text-muted-foreground shadow-md backdrop-blur hover:text-foreground md:inline-flex"
      >
        {t("Search or jump")} <CommandShortcut>⌘K</CommandShortcut>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder={t("Search datasets, users, actions...")}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {loadingDatasets
              ? t("Searching...")
              : t("No results. Try another search.")}
          </CommandEmpty>

          <CommandGroup heading={t("Navigation")}>
            {navigationItems.map((item) => (
              <CommandItem
                key={item.href}
                value={item.href}
                onSelect={handleSelect}
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
                    <Shield className="h-4 w-4" />
                    <span>{action.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {datasets.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("Datasets")}>
                {datasets.map((ds) => (
                  <CommandItem
                    key={ds.id}
                    value={`/browse/${ds.id}`}
                    onSelect={handleSelect}
                  >
                    <FileText className="h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="line-clamp-1">{ds.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {ds.status} / {ds.approval_status}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
