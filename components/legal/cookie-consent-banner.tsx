"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import {
  getCookieConsent,
  setCookieConsent,
  OPEN_COOKIE_PREFERENCES_EVENT,
  type CookieConsent,
} from "@/lib/legal/cookie-consent";

export function CookieConsentBanner() {
  const t = useTranslations();
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

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 sm:px-6 sm:pb-6"
        >
          <div
            role="dialog"
            aria-label={t("Cookie notice")}
            className="mx-auto flex max-w-5xl flex-col gap-4 rounded-xl border border-gray-200 bg-white/95 p-5 shadow-[var(--ds-shadow-overlay)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6"
          >
            <p className="text-sm leading-relaxed text-gray-600">
              {t(
                "We use essential cookies to run this site and optional analytics to improve it.",
              )}{" "}
              {t("Read our")}{" "}
              <Link
                href="/legal/cookies"
                className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
              >
                {t("Cookie Policy")}
              </Link>
              .
            </p>
            <div className="flex shrink-0 gap-3">
              <Button
                variant="outline"
                onClick={() => choose("rejected")}
                className="rounded-md border-gray-200 px-5 font-bold text-black hover:bg-gray-50"
              >
                {t("Decline")}
              </Button>
              <Button
                onClick={() => choose("accepted")}
                className="rounded-md bg-black px-5 font-bold text-white hover:bg-black/90"
              >
                {t("Accept")}
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
