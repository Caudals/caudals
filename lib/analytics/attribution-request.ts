import "server-only";
import { sanitizeAttribution } from "./events";
import { analyticsV2Enabled } from "./funnel-events-server";
export function requestAttribution(request: Request) {
  if (!analyticsV2Enabled()) return {};
  try {
    const cookie = request.headers.get("cookie")?.split(/;\s*/).find(part => part.startsWith("caudals_attribution_v2="));
    return sanitizeAttribution(cookie ? JSON.parse(decodeURIComponent(cookie.slice("caudals_attribution_v2=".length))) : {});
  } catch { return {}; }
}
