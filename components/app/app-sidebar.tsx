"use client";

import * as React from "react";
import {
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
  Settings,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wallet,
  BookOpen,
  UserPlus,
  Receipt,
} from "lucide-react";
import Link from "next/link";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavUser } from "@/components/app/nav-user";
import { RoleSwitcher } from "@/components/app/role-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { CommandPaletteButton } from "@/components/app/command-palette-button";
import { NotificationBell } from "@/components/app/notification-bell";

const requesterNav = [
  {
    group: "Overview",
    items: [{ title: "Dashboard", icon: LayoutDashboard, href: "/requester" }],
  },
  {
    group: "My Requests",
    items: [
      { title: "All Requests", icon: FileText, href: "/requester/datasets" },
      {
        title: "Active Requests",
        icon: CheckCircle,
        href: "/requester/datasets?status=active",
      },
      {
        title: "Completed",
        icon: CheckCircle,
        href: "/requester/datasets?status=completed",
      },
    ],
  },
  {
    group: "Contributors",
    items: [
      { title: "All Contributors", icon: Users, href: "/requester/analytics" },
      { title: "Top Performers", icon: Star, href: "/requester/analytics?sort=top" },
    ],
  },
  {
    group: "Analytics & Insights",
    items: [
      { title: "Analytics", icon: BarChart3, href: "/requester/analytics" },
      { title: "Performance", icon: TrendingUp, href: "/requester/analytics?tab=performance" },
    ],
  },
  {
    group: "Account",
    items: [
      { title: "Billing & Wallet", icon: CreditCard, href: "/requester/billing" },
      { title: "Settings", icon: Settings, href: "/requester/settings" },
    ],
  },
];

const contributorNav = [
  {
    group: "Overview",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, href: "/contributor" },
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
      { title: "My Contributions", icon: FileUp, href: "/contributor/contributions" },
      { title: "In Progress", icon: Clock, href: "/contributor/contributions?status=pending" },
    ],
  },
  {
    group: "Earnings",
    items: [
      { title: "Earnings Overview", icon: DollarSign, href: "/contributor/earnings" },
      { title: "Payouts", icon: Wallet, href: "/contributor/earnings?tab=payouts" },
      { title: "Transaction History", icon: Receipt, href: "/contributor/earnings?tab=transactions" },
    ],
  },
  {
    group: "Account",
    items: [
      { title: "Settings", icon: Settings, href: "/contributor/settings" },
      { title: "Payout Methods", icon: CreditCard, href: "/contributor/settings?tab=payout" },
    ],
  },
];

const adminNav = [
  {
    group: "Overview",
    items: [{ title: "Admin Console", icon: Shield, href: "/admin" }],
  },
  {
    group: "Admin",
    items: [
      { title: "Requests / Datasets", icon: Database, href: "/admin/datasets" },
      { title: "Requests", icon: FileText, href: "/admin/requests" },
      { title: "Submissions", icon: FileUp, href: "/admin/submissions" },
      { title: "Users", icon: Users, href: "/admin/users" },
      { title: "Payments & Payouts", icon: CreditCard, href: "/admin/payments" },
      { title: "Featured / Ads", icon: Megaphone, href: "/admin/featured" },
      { title: "Analytics", icon: BarChart3, href: "/admin/analytics" },
      { title: "Settings", icon: Settings, href: "/admin/settings" },
    ],
  },
];

const utilityLinksBase = [
  { title: "Documentation", icon: BookOpen, href: "/docs", external: true },
];

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { user, userRole, loading } = useAuth();
  const pathname = usePathname();
  const t = useTranslations();
  const router = useRouter();
  const supabase = createClient();
  const toast = useLocaleToast();

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
  const isContributorView = pathname.startsWith("/contributor");

  let navGroups = requesterNav;
  let viewLabel = "Requester";
  let homeHref = "/requester";

  if (userRole === "admin") {
    if (isAdminView) {
      navGroups = adminNav;
      viewLabel = "Admin";
      homeHref = "/admin";
    } else if (isContributorView) {
      navGroups = contributorNav;
      viewLabel = "Contributor";
      homeHref = "/contributor";
    } else {
      navGroups = requesterNav;
      viewLabel = "Requester";
      homeHref = "/requester";
    }
  } else if (userRole === "contributor") {
    navGroups = contributorNav;
    viewLabel = "Contributor";
    homeHref = "/contributor";
  } else if (userRole === "requester") {
    navGroups = requesterNav;
    viewLabel = "Requester";
    homeHref = "/requester";
  }

  const settingsHref =
    viewLabel === "Admin"
      ? "/admin/settings"
      : viewLabel === "Contributor"
        ? "/contributor/settings"
        : "/requester/settings";
  const supportHref =
    viewLabel === "Admin"
      ? "/admin/support"
      : viewLabel === "Contributor"
        ? "/contributor/settings"
        : "/requester/support";
  const utilityLinks = [
    ...utilityLinksBase,
    {
      title: "Invite Members",
      icon: UserPlus,
      href:
        viewLabel === "Admin"
          ? "/admin/users"
          : viewLabel === "Contributor"
            ? "/contributor/settings"
            : "/requester/settings?tab=members",
      external: false,
    },
    { title: "Support", icon: LifeBuoy, href: supportHref, external: false },
  ];

  return (
    <Sidebar variant="inset" className="bg-sidebar border-r-0" {...props}>
      <SidebarHeader className="pb-4 pt-6 px-4">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="h-10 rounded-lg hover:bg-transparent hover:text-foreground flex-1"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 rounded-lg">
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
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {user?.user_metadata?.full_name || workspaceTitle}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t("Profile & settings")}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="start"
                className="w-64 rounded-xl"
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {user?.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={settingsHref}>
                    {t("Profile & settings")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase.auth.signOut();
                    toast.success(t("Signed out"));
                    router.push("/auth/sign-in");
                    router.refresh();
                  }}
                >
                  {t("Log out")}
                </DropdownMenuItem>
                {userRole === "admin" && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1">
                      <RoleSwitcher
                        userRole={userRole}
                        currentView={viewLabel.toLowerCase()}
                      />
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationBell />
            <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 pt-3">
          <CommandPaletteButton />
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
        <div className="mt-3 border-t border-sidebar-border/60 pt-3">
          <NavUser />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
