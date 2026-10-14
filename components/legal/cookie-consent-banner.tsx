"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/context";
import {
  getCookieConsent,
  setCookieConsent,
  OPEN_COOKIE_PREFERENCES_EVENT,
  type CookieConsent,
} from "@/lib/legal/cookie-consent";

export function CookieConsentBanner() {
  const t = useTranslations("cookies");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Defer the first read of client-only storage out of the effect body so we
    // don't setState synchronously (and avoid an SSR mismatch). setTimeout is
    // used instead of rAF so it still fires in background/headless contexts.
    const timer = window.setTimeout(() => {
      if (!getCookieConsent()) {
        setVisible(true);
      }
    }, 0);
    const reopen = () => setVisible(true);
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, reopen);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, reopen);
    };
  }, []);

  const choose = (value: CookieConsent) => {
    setCookieConsent(value);
    setVisible(false);
  };

  // A CSS entrance (app/globals.css, `.cookie-banner`) instead of a motion
  // library: this banner is on every public page, so its script cost is paid
  // by every first visit (launch L-24). Under reduced motion it only fades.
  if (!visible) return null;
  return (
    <div className="cookie-banner fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-6 sm:pb-6">
      <div
        role="dialog"
        aria-label={t("title")}
        className="mx-auto flex max-w-5xl flex-col gap-3 rounded-xl border border-black/[0.08] bg-background/95 p-4 shadow-[var(--ds-shadow-overlay)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6"
      >
        <p className="text-[13px] leading-snug text-gray-600 sm:text-sm sm:leading-relaxed">
          {t("body")}{" "}
          {t("readOur")}{" "}
          <Link
            href="/legal/cookies"
            className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
          >
            {t("policy")}
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={() => choose("rejected")}
            className="h-9 flex-1 rounded-md border border-black/[0.12] px-5 font-bold text-black hover:bg-black/5 sm:h-10 sm:flex-none"
          >
            {t("decline")}
          </Button>
          <Button
            onClick={() => choose("accepted")}
            className="h-9 flex-1 rounded-md bg-black px-5 font-bold text-white hover:bg-black/90 sm:h-10 sm:flex-none"
          >
            {t("accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
