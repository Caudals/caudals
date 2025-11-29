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
  CheckCircle,
  Clock,
  Star,
  TrendingUp,
  DollarSign,
  Wallet,
  Receipt,
  Bookmark,
  Sparkles,
  Flag,
  Megaphone,
  Mail,
  BookOpen,
  HelpCircle,
  Activity,
  Users2,
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
import { NavUser } from "@/components/dashboard/nav-user";
import { RoleSwitcher } from "@/components/dashboard/role-switcher";
import Link from "next/link";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";

// Enhanced navigation structure with groups
const requesterNav = [
  {
    group: "Overview",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    ],
  },
  {
    group: "My Requests",
    items: [
      {
        title: "All Requests",
        icon: FileText,
        href: "/dashboard/requests",
        badge: undefined,
      },
      {
        title: "Active Requests",
        icon: CheckCircle,
        href: "/dashboard/requests?status=active",
      },
      {
        title: "Completed",
        icon: CheckCircle,
        href: "/dashboard/requests?status=completed",
      },
    ],
  },
  {
    group: "Contributors",
    items: [
      { title: "All Contributors", icon: Users, href: "/dashboard/contributors" },
      {
        title: "Top Performers",
        icon: Star,
        href: "/dashboard/contributors?sort=top",
      },
    ],
  },
  {
    group: "Analytics & Insights",
    items: [
      { title: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
      { title: "Performance", icon: TrendingUp, href: "/dashboard/analytics?tab=performance" },
    ],
  },
  {
    group: "Account",
    items: [
      { title: "Billing & Wallet", icon: CreditCard, href: "/dashboard/billing" },
      { title: "Settings", icon: Settings, href: "/dashboard/settings" },
    ],
  },
];

const contributorNav = [
  {
    group: "Overview",
    items: [
      {
        title: "Dashboard",
        icon: LayoutDashboard,
        href: "/dashboard/contributor",
      },
    ],
  },
  {
    group: "Datasets",
    items: [
      { title: "Browse All", icon: Database, href: "/browse" },
      { title: "Recommended", icon: Sparkles, href: "/browse?filter=recommended" },
      { title: "Saved", icon: Bookmark, href: "/browse?filter=saved" },
    ],
  },
  {
    group: "My Activity",
    items: [
      {
        title: "My Contributions",
        icon: FileUp,
        href: "/dashboard/contributions",
      },
      {
        title: "In Progress",
        icon: Clock,
        href: "/dashboard/contributions?status=pending",
      },
    ],
  },
  {
    group: "Earnings",
    items: [
      {
        title: "Earnings Overview",
        icon: DollarSign,
        href: "/dashboard/earnings",
      },
      { title: "Payouts", icon: Wallet, href: "/dashboard/earnings?tab=payouts" },
      {
        title: "Transaction History",
        icon: Receipt,
        href: "/dashboard/earnings?tab=transactions",
      },
    ],
  },
  {
    group: "Account",
    items: [
      { title: "Settings", icon: Settings, href: "/dashboard/settings" },
      {
        title: "Payout Methods",
        icon: CreditCard,
        href: "/dashboard/settings?tab=payout",
      },
    ],
  },
];

const adminNav = [
  {
    group: "Overview",
    items: [{ title: "Admin Console", icon: Shield, href: "/admin" }],
  },
  {
    group: "Moderation",
    items: [
      {
        title: "Pending Requests",
        icon: FileText,
        href: "/admin/requests",
        badge: undefined,
      },
      {
        title: "Pending Submissions",
        icon: FileUp,
        href: "/admin/submissions",
        badge: undefined,
      },
      {
        title: "Flagged Content",
        icon: Flag,
        href: "/admin/flagged",
        badge: undefined,
      },
    ],
  },
  {
    group: "Management",
    items: [
      { title: "All Datasets", icon: Database, href: "/admin/datasets" },
      { title: "All Users", icon: Users, href: "/admin/users" },
      { title: "Featured Ads", icon: Megaphone, href: "/admin/featured" },
    ],
  },
  {
    group: "Financial",
    items: [
      { title: "Payment Overview", icon: CreditCard, href: "/admin/payments" },
      { title: "Payouts & Commissions", icon: Wallet, href: "/admin/payouts" },
      { title: "Generate Invoices", icon: Receipt, href: "/admin/invoices" },
    ],
  },
  {
    group: "Analytics",
    items: [
      { title: "User Analytics", icon: Users2, href: "/admin/analytics/users" },
      { title: "Dataset Analytics", icon: BarChart3, href: "/admin/analytics/datasets" },
      { title: "Revenue Analytics", icon: TrendingUp, href: "/admin/analytics/revenue" },
      { title: "Platform Health", icon: Activity, href: "/admin/analytics/health" },
    ],
  },
  {
    group: "System",
    items: [
      { title: "Settings", icon: Settings, href: "/admin/settings" },
      { title: "Email Templates", icon: Mail, href: "/admin/emails" },
    ],
  },
];

// Secondary navigation (bottom)
const secondaryNav = [
  { title: "Documentation", icon: BookOpen, href: "/docs", external: true },
  { title: "Help & Support", icon: HelpCircle, href: "/support" },
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
                    className="h-6 w-6"
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

  let navGroups = requesterNav;
  let viewLabel = "Requester";
  let homeHref = "/dashboard";
  let quickActionHref = "/dashboard/requests/new";
  let quickActionLabel = "New Request";

  // Admin users can switch between views
  if (userRole === "admin") {
    if (isAdminView) {
      navGroups = adminNav;
      viewLabel = "Admin";
      homeHref = "/admin";
      quickActionHref = "/admin/requests";
      quickActionLabel = "Pending Reviews";
    } else if (isContributorView) {
      navGroups = contributorNav;
      viewLabel = "Contributor";
      homeHref = "/dashboard/contributor";
      quickActionHref = "/browse";
      quickActionLabel = "Browse Datasets";
    } else {
      navGroups = requesterNav;
      viewLabel = "Requester";
      homeHref = "/dashboard";
      quickActionHref = "/dashboard/requests/new";
      quickActionLabel = "New Request";
    }
  }
  // Contributors only see contributor nav
  else if (userRole === "contributor") {
    navGroups = contributorNav;
    viewLabel = "Contributor";
    homeHref = "/dashboard/contributor";
    quickActionHref = "/browse";
    quickActionLabel = "Browse Datasets";
  }
  // Requesters only see requester nav
  else if (userRole === "requester") {
    navGroups = requesterNav;
    viewLabel = "Requester";
    homeHref = "/dashboard";
    quickActionHref = "/dashboard/requests/new";
    quickActionLabel = "New Request";
  }

  const localizedViewLabel = t(viewLabel);

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center">
                  <Image
                    src="/caudals_logo_black.svg"
                    alt="Caudals logo"
                    width={32}
                    height={32}
                    className="h-6 w-6"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Caudals</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {localizedViewLabel}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Role switcher for admins */}
        {userRole === "admin" && (
          <div className="mt-2 px-2">
            <RoleSwitcher
              userRole={userRole}
              currentView={viewLabel.toLowerCase()}
            />
          </div>
        )}

        {/* Account badge for non-admins */}
        {userRole !== "admin" && (
          <div className="mt-2 px-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t("{{role}} Account", { role: localizedViewLabel })}
            </p>
          </div>
        )}

        {/* Quick Action Button */}
        <div className="mt-3 px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Link href={quickActionHref}>
                  <Plus className="size-4" />
                  <span>{t(quickActionLabel)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Primary Navigation Groups */}
        {navGroups.map((group, groupIndex) => (
          <SidebarGroup key={groupIndex}>
            <SidebarGroupLabel>{t(group.group)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== homeHref && pathname.startsWith(item.href));

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{t(item.title)}</span>
                          {item.badge && (
                            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/* Secondary Navigation */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    size="sm"
                    className="text-muted-foreground"
                  >
                    <Link
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                    >
                      <item.icon />
                      <span>{t(item.title)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {/* Wallet/Earnings Widget - TODO: Implement */}
        {/* <WalletWidget /> */}

        <Separator className="my-2" />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
