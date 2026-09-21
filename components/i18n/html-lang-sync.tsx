"use client";

import { useEffect } from "react";

/**
 * Keeps `<html lang>` correct across client-side navigation.
 *
 * Switching language is a soft navigation: React swaps the page content but
 * the document shell, and the inline script that set `lang` on first load, are
 * not re-run. This re-applies the attribute whenever the locale changes.
 */
export function HtmlLangSync({ lang }: { lang: string }) {
  useEffect(() => {
    if (document.documentElement.lang !== lang) {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  return null;
}
