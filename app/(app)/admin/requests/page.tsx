import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingDatasetRequests } from "@/lib/actions/admin-actions";
import { PendingRequestsTable } from "@/components/admin/pending-requests-table";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function AdminRequestsPage() {
  await requireAdmin();
  const result = await getPendingDatasetRequests();

  if ("error" in result) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center">
        <p className="text-lg font-semibold text-destructive">
          Error loading requests
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Please try again later
        </p>
      </div>
    );
  }

  const requests = result.data || [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pending dataset requests"
        description="Review requester briefs, validate compliance, and approve high-quality dataset demand."
        actions={
          <Button asChild variant="outline">
            <Link
              href="/admin/submissions"
              data-dashboard-action="admin_requests_open_submissions"
            >
              Open submissions queue
            </Link>
          </Button>
        }
      />
      <PendingRequestsTable requests={requests} />
    </div>
  );
}
