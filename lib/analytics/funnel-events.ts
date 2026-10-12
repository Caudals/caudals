import { getCookieConsent } from "@/lib/legal/cookie-consent";
import { readFirstTouch } from "./first-touch";
import { analyticsPath, sanitizePayload, type ClientEventName, type ProductEventPayload } from "./events";
export { CLIENT_EVENT_NAMES as PRODUCT_EVENT_NAMES } from "./events";
export type { ProductEventName, ProductEventPayload } from "./events";
let enabled: Promise<boolean> | undefined;
const mirrorQueue: Array<{name: ClientEventName; metadata: unknown}> = [];
export function flushAnalyticsMirror() {
  if (typeof window === "undefined") return;
  if (getCookieConsent() !== "accepted") { mirrorQueue.length = 0; return; }
  const track = (window as unknown as { umami?: { track?: (name: string, data: unknown) => void } }).umami?.track;
  if (!track) return;
  for (const item of mirrorQueue.splice(0)) { try { track(item.name, item.metadata); } catch { /* Best effort. */ } }
}
export function analyticsEnabled() {
  return enabled ??= fetch("/api/analytics/config", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => data?.enabled === true).catch(() => false);
}
export async function trackProductEvent(eventName: ClientEventName, payload?: ProductEventPayload) {
  if (typeof window === "undefined" || getCookieConsent() !== "accepted" || !await analyticsEnabled() || getCookieConsent() !== "accepted") return;
  const metadata = sanitizePayload(eventName, payload);
  const attribution = readFirstTouch();
  let sessionId: string | null = null;
  try {
    sessionId = sessionStorage.getItem("caudals_analytics_session_id") ?? crypto.randomUUID();
    sessionStorage.setItem("caudals_analytics_session_id", sessionId);
  } catch { /* No storage, still count the consented event. */ }
  const body = JSON.stringify({ eventName, payload: metadata, attribution, path: analyticsPath(location.pathname), sessionId, consent: true });
  if (mirrorQueue.length < 50) mirrorQueue.push({ name: eventName, metadata: { ...metadata, ...attribution } });
  flushAnalyticsMirror();
  try { if (navigator.sendBeacon?.("/api/analytics/track", new Blob([body], { type: "application/json" }))) return; } catch { /* Fall back. */ }
  try { await fetch("/api/analytics/track", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true, body }); } catch { /* Best effort. */ }
}
