import type { Locale } from "@/lib/i18n/config";

/**
 * Formatting for the public results pages (launch L-31). Dates are read in
 * Europe/Madrid and written in full ("14 October 2026", "14 de octubre de
 * 2026"); shares are whole percentages, as everywhere else on the public site.
 */
export function formatPublicDate(locale: Locale, value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(date);
}

/** Same calendar day in Madrid? */
export function sameDay(a: string, b: string): boolean {
  const day = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(value));
  return day(a) === day(b);
}

/** A share between 0 and 1 as a whole percentage number. */
export const wholePercent = (share: number) => Math.round(share * 100);

/** Language codes of the questions, named in the reader's language ("Spanish, English"). */
export function languageNames(locale: Locale, codes: readonly string[]): string {
  const names = new Intl.DisplayNames([locale === "es" ? "es-ES" : "en-GB"], { type: "language" });
  return codes.map((code) => {
    try {
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  }).join(", ");
}

/** `2026-Q4` → year and quarter number for the catalog template. */
export function quarterParts(quarter: string): { year: string; q: string } {
  return { year: quarter.slice(0, 4), q: quarter.slice(-1) };
}
