"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border/70 bg-background/95 px-3 backdrop-blur md:hidden">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="h-10 w-10 rounded-xl border border-border/70 bg-card text-foreground shadow-xs" />
        <span className="text-sm font-semibold">Caudals</span>
      </div>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
