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
  FileText,
  FileUp,
  FolderArchive,
  LifeBuoy,
  Megaphone,
  Settings,
  Shield,
  UserPlus,
  Users,
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
import { NavUser } from "@/components/app/nav-user";
import { CommandPaletteButton } from "@/components/app/command-palette-button";

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

const adminNav: NavGroup[] = [
  {
    group: "Operator console",
    items: [
      {
        title: "Pipeline / Home",
        icon: Shield,
        href: "/admin",
        exact: true,
        clearQueryKeys: ["module"],
      },
      {
        title: "Leads & Opportunities",
        icon: FileText,
        href: "/admin?module=leads",
        query: { module: "leads" },
      },
      {
        title: "Suppliers",
        icon: Users,
        href: "/admin?module=suppliers",
        query: { module: "suppliers" },
      },
      {
        title: "Buyers",
        icon: UserPlus,
        href: "/admin?module=buyers",
        query: { module: "buyers" },
      },
    ],
  },
  {
    group: "Dataset operations",
    items: [
      {
        title: "Builds",
        icon: CheckCircle,
        href: "/admin?module=builds",
        query: { module: "builds" },
      },
      {
        title: "Datasets",
        icon: Database,
        href: "/admin?module=datasets",
        query: { module: "datasets" },
      },
      {
        title: "Quality",
        icon: BarChart3,
        href: "/admin?module=quality",
        query: { module: "quality" },
      },
      {
        title: "Privacy & Rights",
        icon: Shield,
        href: "/admin?module=privacy",
        query: { module: "privacy" },
      },
    ],
  },
  {
    group: "Business operations",
    items: [
      {
        title: "Catalogue & Offers",
        icon: Megaphone,
        href: "/admin?module=catalogue",
        query: { module: "catalogue" },
      },
      {
        title: "Commercials",
        icon: CreditCard,
        href: "/admin?module=commercials",
        query: { module: "commercials" },
      },
      {
        title: "Operations",
        icon: FileUp,
        href: "/admin?module=operations",
        query: { module: "operations" },
      },
      {
        title: "Audit",
        icon: CheckCircle,
        href: "/admin?module=audit",
        query: { module: "audit" },
      },
      {
        title: "Settings",
        icon: Settings,
        href: "/admin?module=settings",
        query: { module: "settings" },
      },
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
  const { userRole, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useSidebar();
  const t = useTranslations();
  const isCollapsed = state === "collapsed";

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

  const homeHref = "/admin";

  const footerLinks = baseFooterLinks.map(item => {
    if (item.title === "Support") {
      return { ...item, href: "/admin?module=operations" };
    }
    if (item.title === "Settings") {
      return { ...item, href: "/admin?module=settings" };
    }
    return item;
  });

  const sidebarGroups: NavGroup[] = [...adminNav, { group: "Workspace", items: footerLinks }];

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
            <SidebarTrigger className="h-8 w-8 text-slate-500 hover:text-foreground shrink-0 flex items-center justify-center" />
          </div>
        </div>

        <div className={`${isCollapsed ? "px-0 flex flex-col items-center" : "px-2"} pt-3 space-y-2`}>
          <CommandPaletteButton
            compact={isCollapsed}
            className={isCollapsed ? "mx-auto flex justify-center w-8 h-8 p-0" : "w-full justify-between rounded-lg"}
          />
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
