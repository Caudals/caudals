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
import {
  Activity,
  AlertCircle,
  BarChart3,
  CreditCard,
  Database,
  FileText,
  FileUp,
  FolderArchive,
  Settings,
  Shield,
  Users,
} from "lucide-react";

type DatasetResult = {
  id: string;
  title: string;
  approval_status: string | null;
  status: string | null;
  updated_at?: string | null;
};

type SupportTicketResult = {
  id: string;
  subject: string | null;
  status: string | null;
  priority: string | null;
  updated_at: string | null;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [datasets, setDatasets] = useState<DatasetResult[]>([]);
  const [tickets, setTickets] = useState<SupportTicketResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const { userRole } = useAuth();
  const router = useRouter();
  const supabase = createClient();
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
    const term = query.trim();

    const clear = () => {
      if (!active) return;
      setDatasets([]);
      setTickets([]);
      setLoadingSearch(false);
    };

    const loadSearchResults = async () => {
      if (!userRole || term.length < 2) {
        clear();
        return;
      }

      setLoadingSearch(true);
      const ilikeTerm = `%${term}%`;

      const [datasetsRes, ticketsRes] = await Promise.all([
        supabase
          .from("dataset_requests")
          .select("id,title,approval_status,status,updated_at")
          .ilike("title", ilikeTerm)
          .order("updated_at", { ascending: false })
          .limit(12),
        supabase
          .from("support_tickets")
          .select("id,subject,status,priority,updated_at")
          .ilike("subject", ilikeTerm)
          .order("updated_at", { ascending: false })
          .limit(10),
      ]);

      if (!active) return;
      if (datasetsRes.error) {
        console.error("Command palette admin dataset search error", datasetsRes.error);
        setDatasets([]);
      } else {
        setDatasets(datasetsRes.data ?? []);
      }

      if (ticketsRes.error) {
        console.error("Command palette admin ticket search error", ticketsRes.error);
        setTickets([]);
      } else {
        setTickets(ticketsRes.data ?? []);
      }
      setLoadingSearch(false);
    };

    const timer = setTimeout(() => {
      void loadSearchResults();
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, supabase, userRole]);

  const navigationItems = useMemo(() => {
    if (userRole) {
      return [
        { label: t("Pipeline / Home"), href: "/admin", icon: Shield },
        { label: t("Leads & Opportunities"), href: "/admin?module=leads", icon: FileText },
        { label: t("Suppliers"), href: "/admin?module=suppliers", icon: Users },
        { label: t("Buyers"), href: "/admin?module=buyers", icon: AlertCircle },
        { label: t("Builds"), href: "/admin?module=builds", icon: Activity },
        { label: t("Datasets"), href: "/admin?module=datasets", icon: Database },
        { label: t("Quality"), href: "/admin?module=quality", icon: BarChart3 },
        { label: t("Privacy & Rights"), href: "/admin?module=privacy", icon: Shield },
        { label: t("Catalogue & Offers"), href: "/admin?module=catalogue", icon: FileUp },
        { label: t("Commercials"), href: "/admin?module=commercials", icon: CreditCard },
        { label: t("Operations"), href: "/admin?module=operations", icon: FolderArchive },
        { label: t("Audit"), href: "/admin?module=audit", icon: Activity },
        { label: t("Settings"), href: "/admin?module=settings", icon: Settings },
      ];
    }

    return [];
  }, [t, userRole]);

  const adminActions = useMemo(() => {
    if (!userRole) return [];
    return [
      { label: t("Review active blockers"), href: "/admin" },
      { label: t("Open QA pending builds"), href: "/admin?module=builds" },
      { label: t("Open license vault"), href: "/admin?module=privacy" },
      { label: t("Open audit overlay"), href: "/admin?module=audit" },
    ];
  }, [t, userRole]);

  const handleSelect = (value: string) => {
    router.push(value);
    setOpen(false);
    setQuery("");
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={t("Search datasets, tickets, actions...")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {loadingSearch
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
              {datasets.map((dataset) => {
                return (
                  <CommandItem
                    key={dataset.id}
                    value="/admin?module=datasets"
                    onSelect={handleSelect}
                  >
                    <FileText className="h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="line-clamp-1">{dataset.title}</span>
                      <span className="text-[11px] text-slate-500">
                        {dataset.status} / {dataset.approval_status}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {tickets.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("Support tickets")}>
              {tickets.map((ticket) => (
                <CommandItem
                  key={ticket.id}
                  value="/admin?module=operations"
                  onSelect={handleSelect}
                >
                  <AlertCircle className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="line-clamp-1">
                      {ticket.subject || t("Support ticket")}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {ticket.status} / {ticket.priority}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

      </CommandList>
    </CommandDialog>
  );
}
