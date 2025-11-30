"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  Bookmark,
  CheckCircle,
  ChevronDown,
  Clock,
  CreditCard,
  Database,
  DollarSign,
  FileText,
  FileUp,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Receipt,
  Settings,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wallet,
  BookOpen,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/dashboard/nav-user";
import { RoleSwitcher } from "@/components/dashboard/role-switcher";

const requesterNav = [
  {
    group: "Overview",
    items: [{ title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" }],
  },
  {
    group: "My Requests",
    items: [
      { title: "All Requests", icon: FileText, href: "/dashboard/requests" },
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
      { title: "Top Performers", icon: Star, href: "/dashboard/contributors?sort=top" },
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
      { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard/contributor" },
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
      { title: "My Contributions", icon: FileUp, href: "/dashboard/contributions" },
      { title: "In Progress", icon: Clock, href: "/dashboard/contributions?status=pending" },
    ],
  },
  {
    group: "Earnings",
    items: [
      { title: "Earnings Overview", icon: DollarSign, href: "/dashboard/earnings" },
      { title: "Payouts", icon: Wallet, href: "/dashboard/earnings?tab=payouts" },
      { title: "Transaction History", icon: Receipt, href: "/dashboard/earnings?tab=transactions" },
    ],
  },
  {
    group: "Account",
    items: [
      { title: "Settings", icon: Settings, href: "/dashboard/settings" },
      { title: "Payout Methods", icon: CreditCard, href: "/dashboard/settings?tab=payout" },
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
      { title: "Pending Requests", icon: FileText, href: "/admin/requests" },
      { title: "Pending Submissions", icon: FileUp, href: "/admin/submissions" },
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
    items: [{ title: "Payment Overview", icon: CreditCard, href: "/admin/payments" }],
  },
  {
    group: "Analytics",
    items: [{ title: "Analytics", icon: BarChart3, href: "/admin/analytics" }],
  },
  {
    group: "System",
    items: [
      { title: "Settings", icon: Settings, href: "/admin/settings" }
    ],
  },
];

const utilityLinks = [
  { title: "Documentation", icon: BookOpen, href: "/docs", external: true },
  { title: "Invite Members", icon: UserPlus, href: "/dashboard/settings?tab=members" },
  { title: "Support", icon: LifeBuoy, href: "/support" },
];

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { user, userRole, loading } = useAuth();
  const pathname = usePathname();
  const t = useTranslations();

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
            {Array.from({ length: 6 }).map((_, idx) => (
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

  const isAdminView = pathname.startsWith("/admin");
  const contributorRoutes = [
    "/dashboard/contributor",
    "/dashboard/contributions",
    "/dashboard/earnings",
  ];
  const isContributorView = contributorRoutes.some((route) =>
    pathname.startsWith(route),
  );

  let navGroups = requesterNav;
  let viewLabel = "Requester";
  let homeHref = "/dashboard";

  if (userRole === "admin") {
    if (isAdminView) {
      navGroups = adminNav;
      viewLabel = "Admin";
      homeHref = "/admin";
    } else if (isContributorView) {
      navGroups = contributorNav;
      viewLabel = "Contributor";
      homeHref = "/dashboard/contributor";
    } else {
      navGroups = requesterNav;
      viewLabel = "Requester";
      homeHref = "/dashboard";
    }
  } else if (userRole === "contributor") {
    navGroups = contributorNav;
    viewLabel = "Contributor";
    homeHref = "/dashboard/contributor";
  } else if (userRole === "requester") {
    navGroups = requesterNav;
    viewLabel = "Requester";
    homeHref = "/dashboard";
  }

  return (
    <Sidebar variant="inset" className="bg-sidebar border-r-0" {...props}>
      <SidebarHeader className="pb-4 pt-6 px-4">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              asChild
              size="lg"
              className="h-10 rounded-lg hover:bg-transparent hover:text-foreground flex-1"
            >
              <Link href="/dashboard/settings">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Image
                    src="/caudals_logo_black.svg"
                    alt="Caudals logo"
                    width={16}
                    height={16}
                    className="h-4 w-4"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{workspaceTitle}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t("Workspace settings")}
                  </span>
                </div>
                <ChevronDown className="size-4 text-muted-foreground" />
              </Link>
            </SidebarMenuButton>
            <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
          </SidebarMenuItem>
        </SidebarMenu>

        {userRole === "admin" && (
          <div className="px-1 mt-2">
            <RoleSwitcher
              userRole={userRole}
              currentView={viewLabel.toLowerCase()}
            />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel className="px-2 text-xs font-medium text-muted-foreground/70">
              {t(group.group)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== homeHref && pathname.startsWith(item.href));

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={t(item.title)}
                        className="h-8 text-sm font-medium text-muted-foreground hover:text-foreground data-[active=true]:text-[var(--accent-foreground)] data-[active=true]:bg-[var(--accent)]/10"
                      >
                        <Link href={item.href}>
                          <item.icon className="size-4" />
                          <span>{t(item.title)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
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
      </SidebarFooter>
    </Sidebar>
  );
}
