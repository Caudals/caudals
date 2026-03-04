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
  Search,
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

type SubmissionResult = {
  id: string;
  status: string | null;
  updated_at: string | null;
  dataset_requests: { title: string | null } | Array<{ title: string | null }> | null;
};

function extractDatasetTitle(record: SubmissionResult["dataset_requests"]) {
  if (!record) return "Untitled dataset";
  if (Array.isArray(record)) return record[0]?.title ?? "Untitled dataset";
  return record.title ?? "Untitled dataset";
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [datasets, setDatasets] = useState<DatasetResult[]>([]);
  const [tickets, setTickets] = useState<SupportTicketResult[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const { userRole, user } = useAuth();
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
      setSubmissions([]);
      setLoadingSearch(false);
    };

    const loadSearchResults = async () => {
      if (!userRole || !user || term.length < 2) {
        clear();
        return;
      }

      setLoadingSearch(true);
      const ilikeTerm = `%${term}%`;

      if (userRole === "requester") {
        const [datasetsRes, ticketsRes] = await Promise.all([
          supabase
            .from("dataset_requests")
            .select("id,title,approval_status,status,updated_at")
            .eq("created_by", user.id)
            .ilike("title", ilikeTerm)
            .order("updated_at", { ascending: false })
            .limit(10),
          supabase
            .from("support_tickets")
            .select("id,subject,status,priority,updated_at")
            .eq("requester_id", user.id)
            .ilike("subject", ilikeTerm)
            .order("updated_at", { ascending: false })
            .limit(8),
        ]);

        if (!active) return;
        if (datasetsRes.error) {
          console.error("Command palette requester dataset search error", datasetsRes.error);
          setDatasets([]);
        } else {
          setDatasets(datasetsRes.data ?? []);
        }

        if (ticketsRes.error) {
          console.error("Command palette requester ticket search error", ticketsRes.error);
          setTickets([]);
        } else {
          setTickets(ticketsRes.data ?? []);
        }

        setSubmissions([]);
        setLoadingSearch(false);
        return;
      }

      if (userRole === "contributor") {
        const [datasetsRes, submissionsRes] = await Promise.all([
          supabase
            .from("dataset_requests")
            .select("id,title,approval_status,status,updated_at")
            .eq("approval_status", "approved")
            .ilike("title", ilikeTerm)
            .order("updated_at", { ascending: false })
            .limit(10),
          supabase
            .from("submissions")
            .select("id,status,updated_at,dataset_requests(title)")
            .eq("contributor_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(20),
        ]);

        if (!active) return;
        if (datasetsRes.error) {
          console.error("Command palette contributor dataset search error", datasetsRes.error);
          setDatasets([]);
        } else {
          setDatasets(datasetsRes.data ?? []);
        }

        if (submissionsRes.error) {
          console.error("Command palette contributor submissions search error", submissionsRes.error);
          setSubmissions([]);
        } else {
          const filtered = (submissionsRes.data ?? []).filter((row) =>
            extractDatasetTitle(row.dataset_requests)
              .toLowerCase()
              .includes(term.toLowerCase())
          );
          setSubmissions(filtered.slice(0, 8));
        }

        setTickets([]);
        setLoadingSearch(false);
        return;
      }

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
      setSubmissions([]);
      setLoadingSearch(false);
    };

    const timer = setTimeout(() => {
      void loadSearchResults();
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, supabase, userRole, user]);

  const navigationItems = useMemo(() => {
    if (userRole === "admin") {
      return [
        { label: t("Control center"), href: "/admin", icon: Shield },
        { label: t("Requests"), href: "/admin/requests", icon: FileText },
        { label: t("Submissions"), href: "/admin/submissions", icon: FileUp },
        { label: t("Datasets"), href: "/admin/datasets", icon: Database },
        { label: t("Payments"), href: "/admin/payments", icon: CreditCard },
        { label: t("Support queue"), href: "/admin/support", icon: AlertCircle },
        { label: t("Activity"), href: "/admin/activity", icon: Activity },
        { label: t("Analytics"), href: "/admin/analytics", icon: BarChart3 },
        { label: t("Users"), href: "/admin/users", icon: Users },
        { label: t("Settings"), href: "/admin/settings", icon: Settings },
      ];
    }

    if (userRole === "contributor") {
      return [
        { label: t("Dashboard"), href: "/contributor", icon: FileText },
        { label: t("Browse opportunities"), href: "/contributor/browse", icon: Search },
        { label: t("My contributions"), href: "/contributor/contributions", icon: FileUp },
        { label: t("Earnings & payouts"), href: "/contributor/earnings", icon: CreditCard },
        { label: t("Settings"), href: "/contributor/settings", icon: Settings },
      ];
    }

    return [
      { label: t("Dashboard"), href: "/requester", icon: FileText },
      { label: t("Datasets"), href: "/requester/datasets", icon: FileText },
      { label: t("Review queue"), href: "/requester/datasets?filter=pending_review", icon: AlertCircle },
      { label: t("Funding needed"), href: "/requester/datasets?filter=needs_funding", icon: CreditCard },
      { label: t("Files & exports"), href: "/requester/files", icon: FolderArchive },
      { label: t("Support"), href: "/requester/support", icon: AlertCircle },
      { label: t("Analytics"), href: "/requester/analytics", icon: BarChart3 },
      { label: t("Settings"), href: "/requester/settings", icon: Settings },
    ];
  }, [t, userRole]);

  const adminActions = useMemo(() => {
    if (userRole !== "admin") return [];
    return [
      { label: t("Approve next pending request"), href: "/admin/requests" },
      { label: t("Open payout queue"), href: "/admin/payments" },
      { label: t("Open activity log"), href: "/admin/activity" },
      { label: t("Open analytics"), href: "/admin/analytics" },
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
                const href =
                  userRole === "admin"
                    ? `/admin/datasets?search=${encodeURIComponent(dataset.title)}`
                    : userRole === "contributor"
                      ? `/browse/${dataset.id}`
                      : `/requester/datasets/${dataset.id}`;

                return (
                  <CommandItem
                    key={dataset.id}
                    value={href}
                    onSelect={handleSelect}
                  >
                    <FileText className="h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="line-clamp-1">{dataset.title}</span>
                      <span className="text-[11px] text-muted-foreground">
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
                  value={
                    userRole === "admin"
                      ? "/admin/support"
                      : `/requester/support/${ticket.id}`
                  }
                  onSelect={handleSelect}
                >
                  <AlertCircle className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="line-clamp-1">
                      {ticket.subject || t("Support ticket")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {ticket.status} / {ticket.priority}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {submissions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("My submissions")}>
              {submissions.map((submission) => (
                <CommandItem
                  key={submission.id}
                  value="/contributor/contributions"
                  onSelect={handleSelect}
                >
                  <FileText className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="line-clamp-1">
                      {extractDatasetTitle(submission.dataset_requests)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {submission.status}
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
