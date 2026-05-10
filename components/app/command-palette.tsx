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

export function CommandPalette() {
  const [open, setOpen] = useState(false);
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
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("Search modules and actions...")} />
      <CommandList>
        <CommandEmpty>
          {t("No matching modules or actions.")}
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
                  <Search className="h-4 w-4" />
                  <span>{action.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
