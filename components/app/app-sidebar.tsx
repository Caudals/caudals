"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CheckCircle,
  CreditCard,
  Database,
  FilePlus2,
  FileText,
  FileUp,
  FolderArchive,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Settings,
  Shield,
  UserPlus,
  Users,
  Wallet,
  LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth/provider";
import { useTranslations } from "@/lib/i18n/use-translations";
import { resolveViewKey, type ViewKey } from "@/lib/navigation/role-view";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { NavUser } from "@/components/app/nav-user";
import { RoleSwitcher } from "@/components/app/role-switcher";
import { CommandPaletteButton } from "@/components/app/command-palette-button";
import { NotificationBell } from "@/components/app/notification-bell";

type NavItem = {
  title: string;
  icon: LucideIcon;
  href: string;
  external?: boolean;
  exact?: boolean;
  query?: Record<string, string>;
  clearQueryKeys?: string[];
};

type NavGroup = {
  group: string;
  items: NavItem[];
};

const requesterNav: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, href: "/requester", exact: true },
      { title: "Analytics", icon: BarChart3, href: "/requester/analytics" },
    ],
  },
  {
    group: "Execution queues",
    items: [
      {
        title: "Review queue",
        icon: CheckCircle,
        href: "/requester/datasets?filter=pending_review",
        query: { filter: "pending_review" },
      },
    ],
  },
  {
    group: "Dataset ops",
    items: [
      {
        title: "All datasets",
        icon: FileText,
        href: "/requester/datasets",
        exact: true,
        clearQueryKeys: ["status", "filter"],
      },
      { title: "New dataset", icon: FilePlus2, href: "/requester/datasets/new" },
      { title: "Files & exports", icon: FolderArchive, href: "/requester/files" },
    ],
  },
  {
    group: "Finance & billing",
    items: [
      { title: "Billing & payouts", icon: CreditCard, href: "/requester/billing" },
    ],
  },
];

const contributorNav: NavGroup[] = [
  {
    group: "Overview",
    items: [{ title: "Dashboard", icon: LayoutDashboard, href: "/contributor", exact: true }],
  },
  {
    group: "Work queue",
    items: [
      { title: "My contributions", icon: FileUp, href: "/contributor/contributions" },
      { title: "Browse opportunities", icon: Database, href: "/contributor/browse" },
    ],
  },
  {
    group: "Finance & earnings",
    items: [{ title: "Earnings & payouts", icon: Wallet, href: "/contributor/earnings" }],
  },
];

const adminNav: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { title: "Control center", icon: Shield, href: "/admin", exact: true },
      { title: "Analytics", icon: BarChart3, href: "/admin/analytics" },
      { title: "Activity", icon: CheckCircle, href: "/admin/activity" },
    ],
  },
  {
    group: "Operations",
    items: [
      { title: "Requests", icon: FileText, href: "/admin/requests" },
      { title: "Submissions", icon: FileUp, href: "/admin/submissions" },
      { title: "Datasets", icon: Database, href: "/admin/datasets" },
      { title: "Users", icon: Users, href: "/admin/users" },
      { title: "Featured", icon: Megaphone, href: "/admin/featured" },
    ],
  },
  {
    group: "Finance & risk",
    items: [
      { title: "Payments", icon: CreditCard, href: "/admin/payments" },
    ],
  },
];

const baseFooterLinks: NavItem[] = [
  { title: "Support", icon: LifeBuoy, href: "" }, // Href resolved dynamically
  { title: "Settings", icon: Settings, href: "" }, // Href resolved dynamically
  { title: "Documentation", icon: BookOpen, href: "/docs", external: true },
];

function parseHref(href: string): { path: string; params: URLSearchParams } {
  const url = new URL(href, "https://app.caudals.local");
  return { path: url.pathname, params: url.searchParams };
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { user, userRole, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useSidebar();
  const t = useTranslations();
  const isCollapsed = state === "collapsed";

  const workspaceTitle = user?.user_metadata?.workspace || "Caudals";

  if (loading || !userRole) {
    return (
      <Sidebar variant="inset" className="bg-sidebar border-r-0" {...props}>
        <SidebarHeader className="pb-2 pt-4 px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="px-4">
          <SidebarMenu>
            {Array.from({ length: 8 }).map((_, idx) => (
              <SidebarMenuItem key={idx}>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="pb-2 px-2">
        </SidebarFooter>
      </Sidebar>
    );
  }

  const viewKey = resolveViewKey(pathname, userRole);

  let navGroups: NavGroup[] = requesterNav;
  let viewLabel = "Requester";
  let homeHref = "/requester";

  if (viewKey === "admin") {
    navGroups = adminNav;
    viewLabel = "Admin";
    homeHref = "/admin";
  } else if (viewKey === "contributor") {
    navGroups = contributorNav;
    viewLabel = "Contributor";
    homeHref = "/contributor";
  }

  const footerLinks = baseFooterLinks.map(item => {
    if (item.title === "Support") {
      return { ...item, href: `/${viewKey}/support` };
    }
    if (item.title === "Settings") {
      return { ...item, href: `/${viewKey}/settings` };
    }
    return item;
  });

  const sidebarGroups: NavGroup[] = [...navGroups, { group: "Workspace", items: footerLinks }];

  const isItemActive = (item: NavItem) => {
    const { path: itemPath, params } = parseHref(item.href);
    const samePath = pathname === itemPath;
    const nestedPath = pathname.startsWith(`${itemPath}/`);

    const pathMatches = item.exact
      ? samePath
      : samePath || (itemPath !== homeHref && nestedPath);

    if (!pathMatches) {
      return false;
    }

    if (item.clearQueryKeys?.some((key) => searchParams.has(key))) {
      return false;
    }

    if (item.query) {
      return Object.entries(item.query).every(
        ([key, value]) => searchParams.get(key) === value,
      );
    }

    if (params.size > 0) {
      return Array.from(params.entries()).every(
        ([key, value]) => searchParams.get(key) === value,
      );
    }

    return true;
  };

  return (
    <Sidebar variant="inset" className="bg-sidebar border-r-0" {...props}>
      <SidebarHeader className="pb-2 pt-4 px-2">
        <div className={`flex items-center w-full ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className={`overflow-hidden transition-all ${isCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'}`}>
             <NavUser />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isCollapsed && <NotificationBell />}
            <SidebarTrigger className="h-8 w-8 text-slate-500 hover:text-foreground shrink-0 flex items-center justify-center" />
          </div>
        </div>

        <div className={`${isCollapsed ? "px-0 flex flex-col items-center" : "px-2"} pt-3 space-y-2`}>
          <CommandPaletteButton
            compact={isCollapsed}
            className={isCollapsed ? "mx-auto flex justify-center w-8 h-8 p-0" : "w-full justify-between rounded-lg"}
          />
          {userRole === "admin" ? (
            <div className="flex justify-center">
              <RoleSwitcher userRole={userRole} currentView={viewKey} isCollapsed={isCollapsed} />
            </div>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 gap-0">
        {sidebarGroups.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel className="px-2 text-xs font-medium text-slate-500/70 group-data-[collapsible=icon]:sr-only">
              {t(group.group)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isItemActive(item)}
                      tooltip={t(item.title)}
                      className={`h-8 text-sm font-medium text-slate-500 hover:text-foreground data-[active=true]:text-[var(--accent-foreground)] data-[active=true]:bg-[var(--accent)]/10 ${isCollapsed ? 'justify-center' : ''}`}
                    >
                      <Link
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noopener noreferrer" : undefined}
                        className={isCollapsed ? "flex items-center justify-center w-full" : ""}
                      >
                        <item.icon className="size-4 shrink-0" />
                        {!isCollapsed && <span>{t(item.title)}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="pb-2 px-2">
      </SidebarFooter>
    </Sidebar>
  );
}
