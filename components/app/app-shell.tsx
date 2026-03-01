import { ReactNode } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppHeader } from "@/components/app/app-header";
import { CommandPalette } from "@/components/app/command-palette";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar collapsible="icon" />
      <CommandPalette />
      <SidebarInset className="bg-background overflow-hidden md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
        <AppHeader />
        <main className="relative m-2 flex flex-1 overflow-hidden rounded-[14px] border border-border/80 bg-card shadow-xs sm:m-3">
          <div className="absolute inset-0 overflow-auto">
            <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 md:p-8">
              {children}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
