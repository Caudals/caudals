"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackProductEvent, flushAnalyticsMirror } from "@/lib/analytics/funnel-events";
import { COOKIE_CONSENT_EVENT, getCookieConsent } from "@/lib/legal/cookie-consent";
import { clearFirstTouch } from "@/lib/analytics/first-touch";
export function FunnelVisitTracker() {
  const pathname = usePathname();
  useEffect(() => {
    let sent = false;
    const sync = () => {
      if (getCookieConsent() !== "accepted") { if (getCookieConsent() === "rejected") { clearFirstTouch(); flushAnalyticsMirror(); } return; }
      if (sent) return;
      sent = true;
      const locale = /^\/es(?:\/|$)/.test(pathname) ? "es" : "en";
      let referrer: string | undefined;
      try { referrer = document.referrer ? new URL(document.referrer).hostname : undefined; } catch { /* malformed */ }
      void trackProductEvent("page_view", { locale, referrer });
      if (/^\/(?:en|es)\/demo\/?$/.test(pathname)) void trackProductEvent("demo_viewed", { locale });
    };
    const click = (event: MouseEvent) => {
      const href = (event.target as Element)?.closest?.("a")?.getAttribute("href");
      if (!href) return;
      let destination: URL;
      try { destination = new URL(href, location.origin); } catch { return; }
      if (![location.hostname, "caudals.com", "app.caudals.com"].includes(destination.hostname)) return;
      const surface = pathname.startsWith("/workspace") || pathname.startsWith("/ops") ? "workspace" : pathname.includes("/demo") ? "demo" : "public";
      if (/^\/(en|es)\/call\/?$/.test(destination.pathname)) void trackProductEvent("readout_link_clicked", { surface });
      if (/^\/(en|es)\/contact\/?$/.test(destination.pathname)) void trackProductEvent("pilot_requested", { surface });
    };
    document.addEventListener("click", click);
    sync(); window.addEventListener(COOKIE_CONSENT_EVENT, sync);
    return () => { window.removeEventListener(COOKIE_CONSENT_EVENT, sync); document.removeEventListener("click", click); };
  }, [pathname]);
  return null;
}
