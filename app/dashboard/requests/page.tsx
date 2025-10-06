import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getUserDatasetRequests } from "@/lib/actions/dataset-actions";


export default async function RequestsPage() {
  const requests = await getUserDatasetRequests();
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Dataset Requests"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Requests" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Your Requests
              </h2>
              <p className="text-muted-foreground">
                Manage and monitor your dataset collection requests
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/dashboard/requests/new">
                <Plus className="mr-2 h-4 w-4" />
                New Request
              </Link>
            </Button>
          </div>
          <RequestsTable requests={requests} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
