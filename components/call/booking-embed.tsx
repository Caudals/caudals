"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";

// One inline scheduler on the page, so a single stable namespace is enough.
const CAL_NAMESPACE = "caudals-booking";
// Cal's accent var, mapped to the Caudals teal display accent (--ds-accent-teal / teal-700).
const CAL_BRAND_COLOR = "#0f766e";

/**
 * Cal's inline embed expects a bare `username/event` slug (resolved against
 * app.cal.com), not a full URL. Accept the forms a user is likely to paste —
 * "caudals/call", "caudals.com/call", "cal.com/caudals/call",
 * "https://app.cal.com/caudals/call" — and reduce them all to "caudals/call".
 * A wrong shape (e.g. passing a full domain) silently 404s to a blank iframe,
 * which is exactly the "white square" failure mode.
 */
export function normalizeCalLink(raw: string): string {
  let link = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");

  link = link.replace(/^app\.cal\.com\//i, "").replace(/^cal\.com\//i, "");

  // If the first path segment is a hostname (e.g. "caudals.com"), treat the
  // label before the first dot as the Cal username: "caudals.com/call" → "caudals/call".
  const [first, ...rest] = link.split("/");
  if (rest.length > 0 && first.includes(".")) {
    link = [first.split(".")[0], ...rest].join("/");
  }

  return link;
}

type BookingEmbedProps = {
  /** Public Cal.com booking link (no API key required). */
  calLink: string;
};

export function BookingEmbed({ calLink }: BookingEmbedProps) {
  const normalizedCalLink = normalizeCalLink(calLink);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cal = await getCalApi({ namespace: CAL_NAMESPACE });
      if (cancelled) {
        return;
      }

      // Light-mode only, brand-aligned, with event details visible to the client.
      // cssVarsPerTheme requires both themes; we force light but keep the brand
      // accent consistent if a client's OS ever forces dark.
      cal("ui", {
        theme: "light",
        cssVarsPerTheme: {
          light: { "cal-brand": CAL_BRAND_COLOR },
          dark: { "cal-brand": CAL_BRAND_COLOR },
        },
        hideEventTypeDetails: false,
        layout: "month_view",
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Cal
      namespace={CAL_NAMESPACE}
      calLink={normalizedCalLink}
      config={{ layout: "month_view", theme: "light" }}
      style={{ width: "100%", minHeight: "620px", overflow: "auto" }}
    />
  );
}
