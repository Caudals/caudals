"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslations } from "@/lib/i18n/use-translations";

export function NotificationBell() {
  const t = useTranslations();
  const unreadCount = 0; // TODO: Get from context/hook

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <span className="sr-only">{t("Notifications")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold text-sm">{t("Notifications")}</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs">
              {t("Mark all as read")}
            </Button>
          )}
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {unreadCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {t("No new notifications")}
              </p>
            </div>
          ) : (
            // TODO: Map notifications here
            <div className="p-4">
              <p className="text-sm text-muted-foreground">
                {t("Notifications will appear here")}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
