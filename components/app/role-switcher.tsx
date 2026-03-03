"use client";

import { Briefcase, Check, ChevronsUpDown, Shield, User } from "lucide-react";
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
    icon: Shield,
  },
  {
    value: "requester",
    label: "Requester View",
    description: "Dataset operations, funding, and exports",
    href: "/requester",
    icon: Briefcase,
  },
  {
    value: "contributor",
    label: "Contributor View",
    description: "Contribution pipeline and payout progress",
    href: "/contributor",
    icon: User,
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
  const ActiveIcon = activeRole.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={
            isCollapsed
              ? "h-8 w-8 rounded-md border border-sidebar-border/60 bg-card/70 p-0"
              : "h-8 w-full justify-between rounded-md bg-sidebar-accent/50 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          }
        >
          <span className="flex items-center gap-1.5">
            <ActiveIcon className="h-3.5 w-3.5" />
            {!isCollapsed ? <span>{t(activeRole.label)}</span> : null}
          </span>
          {!isCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isCollapsed ? "center" : "start"} className="w-64 rounded-lg">
        {roleOptions.map((role) => {
          const RoleIcon = role.icon;
          const isActive = role.value === activeRole.value;
          return (
            <DropdownMenuItem
              key={role.value}
              onClick={() => router.push(role.href)}
              className="flex items-start gap-2 py-2"
            >
              <div className="mt-0.5 rounded-md border border-border/70 p-1">
                <RoleIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{t(role.label)}</span>
                  {isActive ? (
                    <Check className="h-3.5 w-3.5 text-[var(--accent-foreground)]" />
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">{t(role.description)}</p>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
