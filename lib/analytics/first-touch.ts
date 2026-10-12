import { getCookieConsent } from "@/lib/legal/cookie-consent";
import { readAttributionJourney } from "./attribution";
import { ATTRIBUTION_KEYS, sanitizeAttribution, type Attribution } from "./events";
export const ATTRIBUTION_COOKIE = "caudals_attribution_v2";
export function readFirstTouch(): Attribution {
  if (typeof window === "undefined" || getCookieConsent() !== "accepted") return {};
  try {
    const old = document.cookie.split("; ").find(x => x.startsWith(`${ATTRIBUTION_COOKIE}=`));
    if (old) return sanitizeAttribution(JSON.parse(decodeURIComponent(old.slice(ATTRIBUTION_COOKIE.length + 1))));
    const params = new URL(window.location.href).searchParams;
    const touch = sanitizeAttribution(Object.fromEntries(ATTRIBUTION_KEYS.map(key => [key, params.get(key)])));
    const journey = readAttributionJourney();
    if (journey) Object.assign(touch, { attribution_parent_event_id: journey.parentEventId, attribution_visitor_id: journey.visitorId, attribution_short_code: journey.shortCode });
    const domain = /^(?:app\.)?caudals\.com$/.test(location.hostname) ? "; Domain=caudals.com" : "";
    document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(touch))}; Path=/; Max-Age=7776000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}${domain}`;
    return touch;
  } catch { return {}; }
}
export function clearFirstTouch() {
  document.cookie = `${ATTRIBUTION_COOKIE}=; Path=/; Max-Age=0`;
  if (/^(?:app\.)?caudals\.com$/.test(location.hostname)) document.cookie = `${ATTRIBUTION_COOKIE}=; Path=/; Max-Age=0; Domain=caudals.com`;
  try { sessionStorage.removeItem("caudals_first_party_attribution"); sessionStorage.removeItem("caudals_analytics_session_id"); } catch { /* unavailable storage */ }
}
