import { ReactNode } from "react";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true} className="bg-background">
      <AppSidebar collapsible="icon" />
      <SidebarInset className="bg-background">{children}</SidebarInset>
    </SidebarProvider>
  );
}

