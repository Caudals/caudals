import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ContributorsTable } from "@/components/dashboard/contributors-table";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRequester } from "@/lib/auth/route-protection";

export default async function ContributorsPage() {
  // Protect this route - only requesters can access
  await requireRequester();
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Contributors"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Contributors" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Active Contributors
            </h2>
            <p className="text-muted-foreground">
              View and manage contributors working on your dataset requests
            </p>
          </div>
          <ContributorsTable />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
