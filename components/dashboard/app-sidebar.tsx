"use client";

import * as React from "react";
import {
  FileText,
  LayoutDashboard,
  Plus,
  Settings,
  Users,
  CreditCard,
  BarChart3,
  FileUp,
  Shield,
  Database,
} from "lucide-react";
import { useAuth } from "@/lib/auth/provider";
import { usePathname } from "next/navigation";
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
} from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";
import { RoleSwitcher } from "./role-switcher";
import Link from "next/link";
import Image from "next/image";

const requesterNav = [
  { title: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { title: "My Requests", icon: FileText, href: "/dashboard/requests" },
  { title: "Contributors", icon: Users, href: "/dashboard/contributors" },
  { title: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
  { title: "Billing", icon: CreditCard, href: "/dashboard/billing" },
  { title: "Settings", icon: Settings, href: "/dashboard/settings" },
];

const contributorNav = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard/contributor" },
  { title: "Browse Datasets", icon: Database, href: "/browse" },
  { title: "My Contributions", icon: FileUp, href: "/dashboard/contributions" },
  {
    title: "Earnings & Payouts",
    icon: CreditCard,
    href: "/dashboard/earnings",
  },
  { title: "Settings", icon: Settings, href: "/dashboard/settings" },
];

const adminNav = [
  { title: "Admin Dashboard", icon: Shield, href: "/admin" },
  { title: "Datasets", icon: Database, href: "/admin/datasets" },
  { title: "Pending Requests", icon: FileText, href: "/admin/requests" },
  { title: "Pending Submissions", icon: FileUp, href: "/admin/submissions" },
  { title: "Users", icon: Users, href: "/admin/users" },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { userRole, loading } = useAuth();
  const pathname = usePathname();
  const t = useTranslations();

  // Show loading state while fetching user role
  if (loading || !userRole) {
    return (
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" disabled>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-background">
                  <Image
                    src="/caudals_logo_black.svg"
                    alt="Caudals logo"
                    width={24}
                    height={24}
                    className="h-5 w-5"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Caudals</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t("Loading...")}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {t("Loading sidebar...")}
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </Sidebar>
    );
  }

  // Determine navigation based on current path and user role
  const isAdminView = pathname.startsWith("/admin");
  const contributorRoutes = [
    "/dashboard/contributor",
    "/dashboard/contributions",
    "/dashboard/earnings",
  ];
  const isContributorView = contributorRoutes.some((route) =>
    pathname.startsWith(route)
  );

  let navItems = requesterNav;
  let viewLabel = "Requester";
  let homeHref = "/";

  // Admin users can switch between views
  if (userRole === "admin") {
    if (isAdminView) {
      navItems = adminNav;
      viewLabel = "Admin";
      homeHref = "/admin";
    } else if (isContributorView) {
      navItems = contributorNav;
      viewLabel = "Contributor";
      homeHref = "/dashboard/contributor";
    } else {
      navItems = requesterNav;
      viewLabel = "Requester";
      homeHref = "/dashboard";
    }
  }
  // Contributors only see contributor nav
  else if (userRole === "contributor") {
    navItems = contributorNav;
    viewLabel = "Contributor";
    homeHref = "/dashboard/contributor";
  }
  // Requesters only see requester nav
  else if (userRole === "requester") {
    navItems = requesterNav;
    viewLabel = "Requester";
    homeHref = "/dashboard";
  }
  const localizedViewLabel = t(viewLabel);

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={homeHref}>
                <div className="flex aspect-square size-8 items-center justify-center">
                  <Image
                    src="/caudals_logo_black.svg"
                    alt="Caudals logo"
                    width={24}
                    height={24}
                    className="h-5 w-5"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Caudals</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {localizedViewLabel} {t("Dashboard")}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* Only show role switcher for admins */}
        {userRole === "admin" && (
          <div className="mt-2">
            <RoleSwitcher
              userRole={userRole}
              currentView={viewLabel.toLowerCase()}
            />
          </div>
        )}
        {/* Show badge for non-admin users */}
        {userRole !== "admin" && (
          <div className="mt-2">
            <div className="text-xs font-medium text-muted-foreground">
              {t("{{role}} Account", { role: localizedViewLabel })}
            </div>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("Navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{t(item.title)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* Show "New Request" button only for requesters and admins in requester view */}
        {(userRole === "requester" ||
          (userRole === "admin" && !isAdminView && !isContributorView)) && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="rounded-sm"
                    variant="outline"
                  >
                    <Link href="/dashboard/requests/new">
                      <Plus className="size-4" />
                      <span>{t("New Request")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
