import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SettingsForms } from "@/components/dashboard/settings-forms";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function SettingsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Settings"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Settings" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Account Settings
            </h2>
            <p className="text-muted-foreground">
              Manage your account preferences and settings
            </p>
          </div>
          <SettingsForms />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
