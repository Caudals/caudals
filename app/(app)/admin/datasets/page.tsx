import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminDatasetRequests } from "@/lib/actions/admin-actions";
import { AdminDatasetsTable } from "@/components/admin/admin-datasets-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function AdminDatasetsPage() {
  await requireAdmin();

  const result = await getAdminDatasetRequests();

  if ("error" in result) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">
            Unable to load datasets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            {result.error || "Please try again later."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const datasets = result.data ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Dataset management"
        description="Maintain request quality, edit metadata, and keep the active catalog healthy."
        actions={
          <Button asChild variant="outline">
            <Link
              href="/admin/featured"
              data-dashboard-action="admin_datasets_open_featured"
            >
              Manage featured placements
            </Link>
          </Button>
        }
      />
      <AdminDatasetsTable datasets={datasets} />
    </div>
  );
}
