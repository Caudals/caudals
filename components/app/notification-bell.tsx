"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslations } from "@/lib/i18n/use-translations";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getNotificationFeed,
  markNotificationsRead,
  type NotificationItem,
} from "@/lib/actions/notification-actions";

export function NotificationBell() {
  const t = useTranslations();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const loadFeed = async () => {
    setLoading(true);
    const result = await getNotificationFeed(20);
    if ("error" in result) {
      console.error("Notification feed error", result.error);
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setItems(result.data.items);
    setUnreadCount(result.data.unreadCount);
    setLoading(false);
  };

  useEffect(() => {
    const bootstrap = setTimeout(() => {
      void loadFeed();
    }, 0);

    const interval = setInterval(() => {
      void loadFeed();
    }, 60_000);

    return () => {
      clearTimeout(bootstrap);
      clearInterval(interval);
    };
  }, []);

  const markAllRead = async () => {
    setMarking(true);
    const result = await markNotificationsRead();
    if ("error" in result) {
      console.error("Unable to mark notifications as read", result.error);
      setMarking(false);
      return;
    }

    setUnreadCount(0);
    setMarking(false);
  };

  const severityClass = (severity: NotificationItem["severity"]) => {
    if (severity === "critical") {
      return "bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]";
    }
    if (severity === "warning") {
      return "bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]";
    }
    return "bg-[var(--ds-info-soft)] text-[var(--ds-info)]";
  };

  return (
    <Popover onOpenChange={(open) => open && void loadFeed()}>
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
      <PopoverContent
        align="end"
        className="w-[calc(100vw-2rem)] max-w-96 p-0"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold text-sm">{t("Notifications")}</h4>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs"
            disabled={marking || unreadCount === 0}
            onClick={markAllRead}
          >
            {marking ? t("Saving...") : t("Mark all as read")}
          </Button>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("Loading...")}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {t("No new notifications")}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${severityClass(item.severity)}`}
                    >
                      {item.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {item.body}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
