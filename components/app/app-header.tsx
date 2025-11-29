"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPaletteButton } from "./command-palette-button";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 flex-1">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2">
        <CommandPaletteButton />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
