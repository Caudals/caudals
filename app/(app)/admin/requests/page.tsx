import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingDatasetRequests } from "@/lib/actions/admin-actions";
import { PendingRequestsTable } from "@/components/admin/pending-requests-table";

export default async function AdminRequestsPage() {
  await requireAdmin();
  const result = await getPendingDatasetRequests();

  if ("error" in result) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center">
        <p className="text-lg font-semibold text-destructive">
          Error loading requests
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Please try again later
        </p>
      </div>
    );
  }

  const requests = result.data || [];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Pending Dataset Requests</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve dataset requests from requesters
        </p>
      </div>
      <PendingRequestsTable requests={requests} />
    </div>
  );
}
