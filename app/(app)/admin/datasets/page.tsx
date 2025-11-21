import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminDatasetRequests } from "@/lib/actions/admin-actions";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { AdminDatasetsTable } from "@/components/admin/admin-datasets-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminDatasetsPage() {
  await requireAdmin();

  const result = await getAdminDatasetRequests();

  if ("error" in result) {
    return (
      <>
        <DashboardHeader
          title="Dataset Management"
          breadcrumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Datasets" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <Card>
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
        </div>
      </>
    );
  }

  const datasets = result.data ?? [];

  return (
    <>
      <DashboardHeader
        title="Dataset Management"
        description="Edit active and pending dataset requests"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Datasets" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <AdminDatasetsTable datasets={datasets} />
      </div>
    </>
  );
}
