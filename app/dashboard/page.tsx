import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentRequests } from "@/components/dashboard/recent-requests";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function RequesterDashboardPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Requester Dashboard"
          description="Manage your dataset requests and track collection progress"
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <StatsCards />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="col-span-4">
              <ActivityChart />
            </div>
            <div className="col-span-3">
              <RecentRequests />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
