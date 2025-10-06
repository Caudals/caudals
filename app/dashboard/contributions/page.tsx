import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  getUserContributionsDetailed,
  getUserEarnings,
} from "@/lib/actions/contributor-actions";
import { ContributionsView } from "@/components/dashboard/contributions-view";

export default async function ContributionsPage() {
  const contributionsResult = await getUserContributionsDetailed();
  const earnings = await getUserEarnings();

  const contributions =
    "error" in contributionsResult ? [] : contributionsResult.data || [];

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="My Contributions"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Contributions" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <ContributionsView
            contributions={contributions}
            earnings={earnings}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
