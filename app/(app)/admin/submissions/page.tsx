import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingSubmissions } from "@/lib/actions/admin-actions";
import { PendingSubmissionsTable } from "@/components/admin/pending-submissions-table";

export default async function AdminSubmissionsPage() {
  await requireAdmin();
  const result = await getPendingSubmissions();

  if ("error" in result) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center">
        <p className="text-lg font-semibold text-destructive">
          Error loading submissions
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Please try again later
        </p>
      </div>
    );
  }

  const submissions = result.data || [];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Pending Submissions</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve user contributions
        </p>
      </div>
      <PendingSubmissionsTable submissions={submissions} />
    </div>
  );
}
