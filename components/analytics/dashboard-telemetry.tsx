"use client";

import { useEffect, useRef } from "react";
import { trackProductEvent } from "@/lib/analytics/funnel-events";

type DashboardRole = "requester" | "contributor" | "admin";

type DashboardTelemetryProps = {
  role: DashboardRole;
  page?: string;
};

export function DashboardTelemetry({
  role,
  page = "home",
}: DashboardTelemetryProps) {
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    startedAtRef.current = performance.now();

    void trackProductEvent("dashboard_view", {
      role,
      page,
      path: window.location.pathname,
    });

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const actionable = target?.closest?.("[data-dashboard-action]");
      if (!actionable) {
        return;
      }

      const actionId = actionable.getAttribute("data-dashboard-action");
      if (!actionId) {
        return;
      }

      const elapsedMs = Math.max(
        0,
        Math.round(performance.now() - startedAtRef.current)
      );

      void trackProductEvent("dashboard_action_clicked", {
        role,
        page,
        action_id: actionId,
        time_to_action_ms: elapsedMs,
      });
    };

    document.addEventListener("click", onClick, { capture: true });

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [role, page]);

  return null;
}
