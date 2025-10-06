import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingSubmissions } from "@/lib/actions/admin-actions";
import { PendingSubmissionsTable } from "@/components/admin/pending-submissions-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function AdminSubmissionsPage() {
  await requireAdmin();
  const result = await getPendingSubmissions();

  if ("error" in result) {
    return <div>Error loading submissions</div>;
  }

  const submissions = result.data || [];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Pending Submissions</h1>
            <p className="text-muted-foreground">
              Review and approve user contributions
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
        </div>

        <PendingSubmissionsTable submissions={submissions} />
      </div>
    </div>
  );
}
