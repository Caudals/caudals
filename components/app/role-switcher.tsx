"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/use-translations";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RoleSwitcherProps {
  userRole: string;
  currentView: string; // "admin", "requester", or "contributor"
  isCollapsed?: boolean;
}

const roleOptions = [
  {
    value: "admin",
    label: "Admin View",
    description: "Platform governance and moderation controls",
    href: "/admin",
  },
  {
    value: "requester",
    label: "Requester View",
    description: "Dataset operations, funding, and exports",
    href: "/requester",
  },
  {
    value: "contributor",
    label: "Contributor View",
    description: "Contribution pipeline and payout progress",
    href: "/contributor",
  },
] as const;

export function RoleSwitcher({ userRole, currentView, isCollapsed = false }: RoleSwitcherProps) {
  const router = useRouter();
  const t = useTranslations();

  // Only admins can switch views
  if (userRole !== "admin") {
    return null;
  }

  const activeRole =
    roleOptions.find((role) => role.value === currentView) ??
    roleOptions[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={
            isCollapsed
              ? "h-8 w-8 rounded-md border border-sidebar-border/60 bg-card/70 p-0 text-xs font-semibold"
              : "h-8 w-full justify-between rounded-md bg-sidebar-accent/50 px-2 text-xs font-medium text-slate-500 hover:text-foreground shadow-none"
          }
        >
          {isCollapsed ? (
            <span>{activeRole.label[0]}</span>
          ) : (
            <>
              <span>{t(activeRole.label)}</span>
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isCollapsed ? "center" : "start"} className="w-64 rounded-lg">
        {roleOptions.map((role) => {
          const isActive = role.value === activeRole.value;
          return (
            <DropdownMenuItem
              key={role.value}
              onClick={() => router.push(role.href)}
              className="flex items-start gap-2 py-2 px-3 cursor-pointer hover:bg-slate-50/500"
            >
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-slate-500'}`}>{t(role.label)}</span>
                  {isActive ? (
                    <Check className="h-4 w-4 text-[var(--accent)]" />
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">{t(role.description)}</p>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
