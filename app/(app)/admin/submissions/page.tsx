import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingSubmissions } from "@/lib/actions/admin-actions";
import { PendingSubmissionsTable } from "@/components/admin/pending-submissions-table";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Moderation queue"
        title="Pending submissions"
        description="Validate contributor evidence, enforce quality standards, and keep SLA targets under control."
        actions={
          <Button asChild variant="outline">
            <Link
              href="/admin/requests"
              data-dashboard-action="admin_submissions_open_requests"
            >
              Open request approvals
            </Link>
          </Button>
        }
      />
      <PendingSubmissionsTable submissions={submissions} />
    </div>
  );
}
