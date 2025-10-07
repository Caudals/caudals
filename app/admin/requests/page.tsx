import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingDatasetRequests } from "@/lib/actions/admin-actions";
import { PendingRequestsTable } from "@/components/admin/pending-requests-table";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AdminRequestsPage() {
  await requireAdmin();
  const result = await getPendingDatasetRequests();

  if ("error" in result) {
    return (
      <SidebarProvider defaultOpen={true}>
        <AppSidebar collapsible="icon" />
        <SidebarInset>
          <DashboardHeader
            title="Pending Requests"
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Requests" },
            ]}
          />
          <div className="flex flex-1 flex-col gap-6 p-6">
            <div className="text-center p-12 border rounded-lg">
              <p className="text-lg font-semibold text-destructive">Error loading requests</p>
              <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const requests = result.data || [];

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Pending Dataset Requests"
          breadcrumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Requests" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div>
            <p className="text-muted-foreground">
              Review and approve dataset requests from requesters
            </p>
          </div>
          <PendingRequestsTable requests={requests} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
