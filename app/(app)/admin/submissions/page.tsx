import { requireAdmin } from "@/lib/middleware/admin-check";
import { getPendingSubmissions } from "@/lib/actions/admin-actions";
import { PendingSubmissionsTable } from "@/components/admin/pending-submissions-table";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export default async function AdminSubmissionsPage() {
  await requireAdmin();
  const result = await getPendingSubmissions();

  if ("error" in result) {
    return (
      <>
        <DashboardHeader
          title="Pending Submissions"
          breadcrumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Submissions" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="rounded-lg border p-12 text-center">
            <p className="text-lg font-semibold text-destructive">
              Error loading submissions
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Please try again later
            </p>
          </div>
        </div>
      </>
    );
  }

  const submissions = result.data || [];

  return (
    <>
      <DashboardHeader
        title="Pending Submissions"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Submissions" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <p className="text-muted-foreground">
          Review and approve user contributions
        </p>
        <PendingSubmissionsTable submissions={submissions} />
      </div>
    </>
  );
}
