"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Telescope,
  FileText,
  LayoutDashboard,
  Plus,
  Settings,
  Users,
  CreditCard,
  BarChart3,
  FileUp,
  DollarSign,
  Shield,
  Database,
} from "lucide-react";
import { useAuth } from "@/lib/auth/provider";

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

const requesterNav = [
  { title: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { title: "My Requests", icon: FileText, href: "/dashboard/requests" },
  { title: "Contributors", icon: Users, href: "/dashboard/contributors" },
  { title: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
  { title: "Billing", icon: CreditCard, href: "/dashboard/billing" },
  { title: "Settings", icon: Settings, href: "/dashboard/settings" },
];

const contributorNav = [
  { title: "Browse Datasets", icon: Database, href: "/browse" },
  { title: "My Contributions", icon: FileUp, href: "/dashboard/contributions" },
  { title: "Earnings", icon: DollarSign, href: "/dashboard/contributions" },
  { title: "Settings", icon: Settings, href: "/dashboard/settings" },
];

const adminNav = [
  { title: "Admin Dashboard", icon: Shield, href: "/admin" },
  { title: "Pending Requests", icon: FileText, href: "/admin/requests" },
  { title: "Pending Submissions", icon: FileUp, href: "/admin/submissions" },
  { title: "Users", icon: Users, href: "/admin/users" },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<string>("requester");
  const [userRole, setUserRole] = useState<string>("requester");

  useEffect(() => {
    // Load saved view preference
    const savedView = localStorage.getItem("dashboardView");
    if (savedView) {
      setCurrentView(savedView);
    }

    // Fetch user role from profile
    const fetchUserRole = async () => {
      if (user?.id) {
        const response = await fetch("/api/user/role");
        const data = await response.json();
        if (data.role) {
          setUserRole(data.role);
        }
      }
    };
    fetchUserRole();
  }, [user]);

  const navItems =
    currentView === "contributor"
      ? contributorNav
      : currentView === "admin"
      ? adminNav
      : requesterNav;

  const viewLabel =
    currentView === "contributor"
      ? "Contributor"
      : currentView === "admin"
      ? "Admin"
      : "Requester";

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                  <Telescope className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Collective</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {viewLabel} Dashboard
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="mt-3">
          <RoleSwitcher userRole={userRole} onRoleChange={setCurrentView} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {currentView === "requester" && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm"
                    variant="outline"
                  >
                    <Link href="/dashboard/requests/new">
                      <Plus className="size-4" />
                      <span>New Request</span>
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
