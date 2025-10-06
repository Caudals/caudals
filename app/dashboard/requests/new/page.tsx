import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { NewRequestForm } from "@/components/dashboard/new-request-form";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function NewRequestPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="New Request"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Requests", href: "/dashboard/requests" },
            { label: "New Request" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="mx-auto w-full max-w-5xl">
            <NewRequestForm />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
