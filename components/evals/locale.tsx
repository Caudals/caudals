"use client";

/**
 * Interface language. The layout reads the person's choice from a cookie and
 * publishes it before any bundle runs, so every module (including tables of
 * labels built at load time) reads the same language. English pages render
 * on the server as before; Spanish pages render once the browser has the
 * locale, so the server never sends English text a Spanish page would replace.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { Languages } from "lucide-react";
import { LOCALE_COOKIE, getLocale, t, type Locale } from "@/lib/evals/messages/en";

const subscribe = () => () => undefined;

export function LocaleRoot({ locale, children }: { locale: Locale; children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (locale === "en" || mounted) return <>{children}</>;
  return (
    <div className="p-root" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }} aria-busy="true">
      <span className="p-spinner" aria-hidden="true" />
    </div>
  );
}

/** Save the choice for a year and reload, so every label is built in the new language. */
export function setInterfaceLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  window.location.reload();
}

export function LocaleSwitch({ compact = false }: { compact?: boolean }) {
  const current = getLocale();
  return (
    <label className="p-inline-select" title={t("languageHelp")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Languages aria-hidden="true" width={15} />
      <span className={compact ? "sr-only" : "p-toolbar-label"}>{t("language")}</span>
      <select value={current} onChange={(event) => setInterfaceLocale(event.target.value as Locale)} aria-label={t("language")}>
        <option value="en">{t("languageEnglish")}</option>
        <option value="es">{t("languageSpanish")}</option>
      </select>
    </label>
  );
}
