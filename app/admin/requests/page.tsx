import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingDatasetRequests } from "@/lib/actions/admin-actions";
import { PendingRequestsTable } from "@/components/admin/pending-requests-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function AdminRequestsPage() {
  await requireAdmin();
  const result = await getPendingDatasetRequests();

  if ("error" in result) {
    return <div>Error loading requests</div>;
  }

  const requests = result.data || [];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              Pending Dataset Requests
            </h1>
            <p className="text-muted-foreground">
              Review and approve dataset requests from requesters
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
        </div>

        <PendingRequestsTable requests={requests} />
      </div>
    </div>
  );
}
