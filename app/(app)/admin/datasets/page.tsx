import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminDatasetRequests } from "@/lib/actions/admin-actions";
import { AdminDatasetsTable } from "@/components/admin/admin-datasets-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
          <p className="text-sm text-muted-foreground">
            {result.error || "Please try again later."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const datasets = result.data ?? [];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Dataset Management</h1>
        <p className="text-sm text-muted-foreground">
          Edit active and pending dataset requests
        </p>
      </div>
      <AdminDatasetsTable datasets={datasets} />
    </div>
  );
}
