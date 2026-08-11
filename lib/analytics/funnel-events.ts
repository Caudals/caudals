import { readAttributionJourney } from "@/lib/analytics/attribution";

export const FUNNEL_EVENT_NAMES = [
  "funnel_visit",
  "funnel_signup",
  "funnel_dataset_created",
  "funnel_fund",
] as const;

export const DASHBOARD_EVENT_NAMES = [
  "dashboard_view",
  "dashboard_action_clicked",
] as const;

export const PRODUCT_EVENT_NAMES = [
  ...FUNNEL_EVENT_NAMES,
  ...DASHBOARD_EVENT_NAMES,
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];
export type DashboardEventName = (typeof DASHBOARD_EVENT_NAMES)[number];
export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export type ProductEventPayload = Record<
  string,
  string | number | boolean | null | undefined
>;

export type FunnelEventPayload = ProductEventPayload;

function sanitizePayload(payload?: ProductEventPayload) {
  if (!payload) {
    return {};
  }

  return Object.entries(payload).reduce<Record<string, string | number | boolean | null>>(
    (acc, [key, value]) => {
      if (value === undefined) {
        return acc;
      }
      if (!key || key.length > 80) {
        return acc;
      }
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );
}

function getSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storageKey = "caudals_analytics_session_id";
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) {
      return existing;
    }

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    window.sessionStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return null;
  }
}

export async function trackProductEvent(
  eventName: ProductEventName,
  payload?: ProductEventPayload
) {
  if (typeof window === "undefined") {
    return;
  }

  const metadata = sanitizePayload(payload);
  const attribution = readAttributionJourney();
  if (attribution) {
    metadata["attribution_parent_event_id"] = attribution.parentEventId;
    metadata["attribution_visitor_id"] = attribution.visitorId;
    metadata["attribution_short_code"] = attribution.shortCode;
  }
  const sessionId = getSessionId();
  const requestBody = JSON.stringify({
    eventName,
    payload: metadata,
    path: window.location.pathname,
    sessionId,
  });

  try {
    // Best-effort custom event call to self-hosted analytics, when available.
    const umamiTrack = (window as unknown as { umami?: { track?: (event: string, data?: Record<string, unknown>) => void } })
      .umami?.track;

    if (typeof umamiTrack === "function") {
      umamiTrack(eventName, metadata);
    }
  } catch {
    // Ignore analytics bridge errors.
  }

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([requestBody], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/analytics/track", blob);
      if (ok) {
        return;
      }
    }
  } catch {
    // Fall back to fetch below.
  }

  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      body: requestBody,
    });
  } catch {
    // Best effort.
  }
}

export async function trackFunnelEvent(
  eventName: FunnelEventName,
  payload?: FunnelEventPayload
) {
  await trackProductEvent(eventName, payload);
}
