import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ContributorsTable } from "@/components/dashboard/contributors-table";
export default async function ContributorsPage() {
  return (
    <>
      <DashboardHeader
        title="Contributors"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Contributors" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Active Contributors
          </h2>
          <p className="text-muted-foreground">
            View and manage contributors working on your dataset requests
          </p>
        </div>
        <ContributorsTable />
      </div>
    </>
  );
}
