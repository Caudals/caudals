/**
 * Locale contract for the public marketing site.
 *
 * Both locales are explicit in the URL (`/en/...`, `/es/...`). There is no
 * unprefixed default, so every public page has exactly one canonical URL and
 * search engines can index each language independently.
 *
 * This module is import-safe from the proxy (edge), server components and
 * client components: it holds no Node built-ins and no message data.
 */

export const locales = ["en", "es"] as const;

export type Locale = (typeof locales)[number];

/** Used for `x-default` hreflang and whenever negotiation yields nothing. */
export const defaultLocale: Locale = "en";

/** Remembers an explicit choice made with the language switcher. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** `lang`/`hreflang` attribute values. */
export const localeHtmlLang: Record<Locale, string> = {
  en: "en",
  es: "es",
};

/** Open Graph `og:locale` values. */
export const localeOpenGraph: Record<Locale, string> = {
  en: "en_US",
  es: "es_ES",
};

/** Endonyms for the language switcher — each language names itself. */
export const localeLabels: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

/** Compact labels for the switcher trigger. */
export const localeShortLabels: Record<Locale, string> = {
  en: "EN",
  es: "ES",
};

const localeSet = new Set<string>(locales);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && localeSet.has(value);
}

/**
 * Coerces a raw tag (`es`, `es-ES`, `ES`) to a supported locale, or null.
 */
export function normalizeLocale(value?: string | null): Locale | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  if (isLocale(lower)) return lower;
  const base = lower.split("-")[0];
  return isLocale(base) ? base : null;
}
