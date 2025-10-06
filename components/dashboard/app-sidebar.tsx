"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
  Telescope,
  FileText,
  LayoutDashboard,
  Plus,
  Settings,
  Users,
  CreditCard,
  BarChart3,
  Wallet,
  Upload,
  Search,
} from "lucide-react";

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
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { UserRole } from "@/types/database";

const requesterNav = [
  {
    title: "Overview",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    title: "Requests",
    icon: FileText,
    href: "/dashboard/requests",
  },
  {
    title: "Contributors",
    icon: Users,
    href: "/dashboard/contributors",
  },
  {
    title: "Analytics",
    icon: BarChart3,
    href: "/dashboard/analytics",
  },
  {
    title: "Billing",
    icon: CreditCard,
    href: "/dashboard/billing",
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/dashboard/settings",
  },
];

const contributorNav = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard/contributor",
  },
  {
    title: "Browse Projects",
    icon: Search,
    href: "/browse",
  },
  {
    title: "My Contributions",
    icon: Upload,
    href: "/dashboard/contributor/contributions",
  },
  {
    title: "Wallet",
    icon: Wallet,
    href: "/dashboard/contributor/wallet",
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/dashboard/settings",
  },
];

// Removed bothNav - users can only be contributor or requester

const requesterProjects = [
  {
    title: "New Request",
    icon: Plus,
    href: "/dashboard/requests/new",
  },
  {
    title: "Browse Datasets",
    icon: Telescope,
    href: "/browse",
  },
];

const contributorProjects = [
  {
    title: "Browse Projects",
    icon: Telescope,
    href: "/browse",
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserRole() {
      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
          
          setUserRole(profile?.role || null);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchUserRole();
  }, []);

  const getNavItems = () => {
    switch (userRole) {
      case 'contributor':
        return contributorNav;
      case 'requester':
        return requesterNav;
      case 'both':
        // Temporary: show contributor nav for 'both' users
        return contributorNav;
      default:
        return requesterNav; // Default fallback
    }
  };

  const getProjectItems = () => {
    switch (userRole) {
      case 'contributor':
        return contributorProjects;
      case 'requester':
        return requesterProjects;
      case 'both':
        // Temporary: show contributor projects for 'both' users
        return contributorProjects;
      default:
        return requesterProjects; // Default fallback
    }
  };

  const navMain = getNavItems();
  const navProjects = getProjectItems();

  if (loading) {
    return (
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </SidebarHeader>
        <SidebarContent>
          <div className="space-y-4">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={userRole === 'contributor' || userRole === 'both' ? "/dashboard/contributor" : "/dashboard"}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                  <Telescope className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">DataCollect</span>
                  <span className="truncate text-xs">
                    {userRole === 'contributor' ? 'Contributor' : 
                     userRole === 'requester' ? 'Requester' : 
                     userRole === 'both' ? 'Contributor' : 'Dashboard'}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navProjects.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}