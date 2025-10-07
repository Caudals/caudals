import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingSubmissions } from "@/lib/actions/admin-actions";
import { PendingSubmissionsTable } from "@/components/admin/pending-submissions-table";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AdminSubmissionsPage() {
  await requireAdmin();
  const result = await getPendingSubmissions();

  if ("error" in result) {
    return (
      <SidebarProvider defaultOpen={true}>
        <AppSidebar collapsible="icon" />
        <SidebarInset>
          <DashboardHeader
            title="Pending Submissions"
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Submissions" },
            ]}
          />
          <div className="flex flex-1 flex-col gap-6 p-6">
            <div className="text-center p-12 border rounded-lg">
              <p className="text-lg font-semibold text-destructive">Error loading submissions</p>
              <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const submissions = result.data || [];

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Pending Submissions"
          breadcrumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Submissions" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div>
            <p className="text-muted-foreground">
              Review and approve user contributions
            </p>
          </div>
          <PendingSubmissionsTable submissions={submissions} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
