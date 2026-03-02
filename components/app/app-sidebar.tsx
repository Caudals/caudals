"use client";

import * as React from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NavUser } from "@/components/app/nav-user";
import { RoleSwitcher } from "@/components/app/role-switcher";
import { CommandPaletteButton } from "@/components/app/command-palette-button";
import { NotificationBell } from "@/components/app/notification-bell";

type ViewKey = "requester" | "contributor" | "admin";

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
    items: [{ title: "Dashboard", icon: LayoutDashboard, href: "/requester", exact: true }],
  },
  {
    group: "Datasets",
    items: [
      {
        title: "All datasets",
        icon: FileText,
        href: "/requester/datasets",
        clearQueryKeys: ["status", "filter"],
      },
      {
        title: "Review queue",
        icon: CheckCircle,
        href: "/requester/datasets?filter=pending_review",
        query: { filter: "pending_review" },
      },
      {
        title: "Funding needed",
        icon: Wallet,
        href: "/requester/datasets?filter=needs_funding",
        query: { filter: "needs_funding" },
      },
      { title: "New dataset", icon: FilePlus2, href: "/requester/datasets/new" },
    ],
  },
  {
    group: "Operations",
    items: [
      { title: "Files & exports", icon: FolderArchive, href: "/requester/files" },
      { title: "Analytics", icon: BarChart3, href: "/requester/analytics" },
    ],
  },
  {
    group: "Workspace",
    items: [
      { title: "Billing", icon: CreditCard, href: "/requester/billing" },
      { title: "Support", icon: LifeBuoy, href: "/requester/support" },
      { title: "Onboarding", icon: UserPlus, href: "/requester/onboarding" },
      { title: "Settings", icon: Settings, href: "/requester/settings" },
    ],
  },
];

const contributorNav: NavGroup[] = [
  {
    group: "Overview",
    items: [{ title: "Dashboard", icon: LayoutDashboard, href: "/contributor", exact: true }],
  },
  {
    group: "Work",
    items: [
      { title: "My contributions", icon: FileUp, href: "/contributor/contributions" },
      { title: "Browse opportunities", icon: Database, href: "/browse" },
    ],
  },
  {
    group: "Earnings",
    items: [{ title: "Earnings & payouts", icon: Wallet, href: "/contributor/earnings" }],
  },
  {
    group: "Workspace",
    items: [{ title: "Settings", icon: Settings, href: "/contributor/settings" }],
  },
];

const adminNav: NavGroup[] = [
  {
    group: "Overview",
    items: [{ title: "Control center", icon: Shield, href: "/admin", exact: true }],
  },
  {
    group: "Moderation",
    items: [
      { title: "Requests", icon: FileText, href: "/admin/requests" },
      { title: "Datasets", icon: Database, href: "/admin/datasets" },
      { title: "Submissions", icon: FileUp, href: "/admin/submissions" },
      { title: "Users", icon: Users, href: "/admin/users" },
    ],
  },
  {
    group: "Operations",
    items: [
      { title: "Payments", icon: CreditCard, href: "/admin/payments" },
      { title: "Support", icon: LifeBuoy, href: "/admin/support" },
      { title: "Activity", icon: CheckCircle, href: "/admin/activity" },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { title: "Analytics", icon: BarChart3, href: "/admin/analytics" },
      { title: "Featured", icon: Megaphone, href: "/admin/featured" },
      { title: "Settings", icon: Settings, href: "/admin/settings" },
    ],
  },
];

const utilityLinksBase: NavItem[] = [
  { title: "Documentation", icon: BookOpen, href: "/docs", external: true },
];

function parseHref(href: string): { path: string; params: URLSearchParams } {
  const url = new URL(href, "https://app.caudals.local");
  return { path: url.pathname, params: url.searchParams };
}

function resolveView(pathname: string, userRole: string): ViewKey {
  if (pathname.startsWith("/admin")) {
    return "admin";
  }
  if (pathname.startsWith("/contributor")) {
    return "contributor";
  }
  if (pathname.startsWith("/requester")) {
    return "requester";
  }

  if (userRole === "admin") {
    return "admin";
  }
  if (userRole === "contributor") {
    return "contributor";
  }
  return "requester";
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { user, userRole, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useSidebar();
  const t = useTranslations();
  const isCollapsed = state === "collapsed";

  const workspaceTitle =
    user?.user_metadata?.workspace ||
    user?.user_metadata?.full_name ||
    user?.email ||
    "Caudals";

  if (loading || !userRole) {
    return (
      <Sidebar variant="inset" className="bg-sidebar border-r-0" {...props}>
        <SidebarHeader className="pb-4 pt-6 px-6">
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
        <SidebarFooter className="pb-6 px-6">
          <NavUser />
        </SidebarFooter>
      </Sidebar>
    );
  }

  const viewKey = resolveView(pathname, userRole);

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

  const settingsHref =
    viewKey === "admin"
      ? "/admin/settings"
      : viewKey === "contributor"
        ? "/contributor/settings"
        : "/requester/settings";

  const supportHref =
    viewKey === "admin"
      ? "/admin/support"
      : viewKey === "contributor"
        ? "/contributor/settings"
        : "/requester/support";

  const utilityLinks: NavItem[] = [
    ...utilityLinksBase,
    {
      title: "Invite members",
      icon: UserPlus,
      href:
        viewKey === "admin"
          ? "/admin/users"
          : viewKey === "contributor"
            ? "/contributor/settings"
            : "/requester/settings",
    },
    { title: "Support", icon: LifeBuoy, href: supportHref },
  ];

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
      <SidebarHeader className="pb-4 pt-6 px-4">
        <div className="flex items-center gap-2 px-2">
          <Avatar className="h-9 w-9 rounded-lg">
            <AvatarImage
              src={
                user?.user_metadata?.avatar_url ||
                user?.user_metadata?.picture ||
                undefined
              }
              alt={workspaceTitle}
            />
            <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
              {workspaceTitle.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {user?.user_metadata?.full_name || workspaceTitle}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">
                {t(`${viewLabel} view`)}
              </Badge>
              <Link
                href={settingsHref}
                className="truncate text-[11px] text-muted-foreground hover:text-foreground"
              >
                {t("Profile & settings")}
              </Link>
            </div>
          </div>
          <NotificationBell />
          <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
        </div>

        <div className="px-2 pt-3 space-y-2">
          <CommandPaletteButton />
          {userRole === "admin" && !isCollapsed ? (
            <div className="rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-2 py-2">
              <RoleSwitcher userRole={userRole} currentView={viewKey} />
            </div>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel className="px-2 text-xs font-medium text-muted-foreground/70">
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
                      className="h-8 text-sm font-medium text-muted-foreground hover:text-foreground data-[active=true]:text-[var(--accent-foreground)] data-[active=true]:bg-[var(--accent)]/10"
                    >
                      <Link
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noopener noreferrer" : undefined}
                      >
                        <item.icon className="size-4" />
                        <span>{t(item.title)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="pb-4 px-4">
        <SidebarMenu>
          {utilityLinks.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                size="sm"
                className="h-8 text-muted-foreground hover:text-foreground"
                tooltip={t(item.title)}
              >
                <Link
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                >
                  <item.icon className="size-4" />
                  <span>{t(item.title)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <div className="mt-3 border-t border-sidebar-border/60 pt-3">
          <NavUser />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
