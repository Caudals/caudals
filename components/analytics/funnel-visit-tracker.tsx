"use client";

import { useEffect } from "react";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";

const SESSION_KEY = "caudals_funnel_visit_tracked";

export function FunnelVisitTracker() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) {
        return;
      }
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Ignore storage failures.
    }

    void trackFunnelEvent("funnel_visit", {
      source: "home",
    });
  }, []);

  return null;
}
