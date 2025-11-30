import { ReactNode } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppHeader } from "@/components/app/app-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar collapsible="icon" />
      <SidebarInset className="bg-sidebar overflow-hidden md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
        <AppHeader />
        <main className="flex-1 overflow-hidden bg-white md:rounded-tl-2xl shadow-sm m-3 relative">
          <div className="absolute inset-0 overflow-auto">
            <div className="flex flex-col gap-6 p-6 md:p-10 max-w-7xl mx-auto w-full min-h-full">
              {children}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
