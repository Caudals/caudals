import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingDatasetRequests } from "@/lib/actions/admin-actions";
import { PendingRequestsTable } from "@/components/admin/pending-requests-table";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export default async function AdminRequestsPage() {
  await requireAdmin();
  const result = await getPendingDatasetRequests();

  if ("error" in result) {
    return (
      <>
        <DashboardHeader
          title="Pending Requests"
          breadcrumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Requests" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="rounded-lg border p-12 text-center">
            <p className="text-lg font-semibold text-destructive">
              Error loading requests
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Please try again later
            </p>
          </div>
        </div>
      </>
    );
  }

  const requests = result.data || [];

  return (
    <>
      <DashboardHeader
        title="Pending Dataset Requests"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Requests" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <p className="text-muted-foreground">
          Review and approve dataset requests from requesters
        </p>
        <PendingRequestsTable requests={requests} />
      </div>
    </>
  );
}
