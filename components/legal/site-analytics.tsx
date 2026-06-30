"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import {
  getCookieConsent,
  COOKIE_CONSENT_EVENT,
} from "@/lib/legal/cookie-consent";

// Self-hosted, privacy-friendly analytics. Loaded only after the visitor
// accepts optional cookies, and only in production.
const ANALYTICS_SRC = "https://analytics.caudals.com/script.js";
const ANALYTICS_WEBSITE_ID = "180a4b17-a999-474c-bf4b-bd3e96e5057f";

export function SiteAnalytics() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const sync = () => setAllowed(getCookieConsent() === "accepted");
    sync();
    window.addEventListener(COOKIE_CONSENT_EVENT, sync);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, sync);
  }, []);

  if (process.env.NODE_ENV !== "production" || !allowed) {
    return null;
  }

  return (
    <Script
      src={ANALYTICS_SRC}
      data-website-id={ANALYTICS_WEBSITE_ID}
      strategy="afterInteractive"
    />
  );
}
