import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ContributorStatsCards } from "@/components/dashboard/contributor-stats-cards";
import { RecentContributions } from "@/components/dashboard/recent-contributions";
import { WalletOverview } from "@/components/dashboard/wallet-overview";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function ContributorDashboardPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Contributor Dashboard"
          description="Manage your contributions and earnings"
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <ContributorStatsCards />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="col-span-4">
              <WalletOverview />
            </div>
            <div className="col-span-3">
              <RecentContributions />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
