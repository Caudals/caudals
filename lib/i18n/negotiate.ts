/**
 * Locale negotiation for a visitor's first request.
 *
 * Pure and synchronous: it reads only what the request already carries, so it
 * adds no latency and no third-party dependency to the critical path. The
 * previous implementation called out to ipapi.co from the proxy on every
 * request; that call is gone.
 *
 * Precedence, strongest signal first:
 *   1. An explicit choice the visitor made (the locale cookie).
 *   2. The browser's own Accept-Language preference.
 *   3. An edge/CDN country hint, but only as a tiebreaker when the browser
 *      expressed no usable preference.
 *   4. The default locale.
 *
 * A country hint never overrides an explicit choice or a stated language
 * preference: someone in Spain reading in English keeps English.
 */

import {
  defaultLocale,
  isLocale,
  locales,
  normalizeLocale,
  type Locale,
} from "./config";

/** Countries whose visitors get Spanish when the browser states no preference. */
const SPANISH_SPEAKING_COUNTRIES = new Set([
  "ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO",
  "HN", "PY", "SV", "NI", "CR", "PA", "UY", "GQ", "PR",
]);

/** Headers an edge/CDN may use to report the client country. */
const COUNTRY_HEADERS = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "x-country-code",
  "cloudfront-viewer-country",
  "x-forwarded-country",
] as const;

export function getCountryFromHeaders(headers: Headers): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = headers.get(name)?.trim();
    if (value && value !== "XX") {
      return value.slice(0, 2).toUpperCase();
    }
  }
  return null;
}

type ParsedLanguage = { tag: string; quality: number };

/** Parses an Accept-Language header into tags ordered by descending quality. */
export function parseAcceptLanguage(header?: string | null): ParsedLanguage[] {
  if (!header?.trim()) return [];

  return header
    .split(",")
    .map((part) => {
      const [rawTag, ...parameters] = part.trim().split(";");
      const tag = rawTag?.trim().toLowerCase();
      if (!tag) return null;

      const qParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));
      const parsed = qParameter
        ? Number.parseFloat(qParameter.slice(2))
        : Number.NaN;
      const quality = Number.isFinite(parsed) ? parsed : 1;

      return { tag, quality };
    })
    .filter((entry): entry is ParsedLanguage => entry !== null && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);
}

/**
 * Best supported locale for an Accept-Language header, or null when the header
 * is absent, unparseable, or names only unsupported languages.
 *
 * `*` is treated as "no preference" rather than a match, so a client sending
 * `*` falls through to the country hint and then the default.
 */
export function matchAcceptLanguage(header?: string | null): Locale | null {
  for (const { tag } of parseAcceptLanguage(header)) {
    if (tag === "*") continue;
    const match = normalizeLocale(tag);
    if (match) return match;
  }
  return null;
}

export function localeFromCountry(countryCode?: string | null): Locale | null {
  if (!countryCode) return null;
  const normalized = countryCode.trim().toUpperCase().slice(0, 2);
  return SPANISH_SPEAKING_COUNTRIES.has(normalized) ? "es" : null;
}

export type NegotiationInput = {
  /** Value of the locale cookie, if the visitor has chosen before. */
  cookie?: string | null;
  /** Raw Accept-Language header. */
  acceptLanguage?: string | null;
  /** Country hint from the edge, used only as a tiebreaker. */
  countryCode?: string | null;
};

export type NegotiationResult = {
  locale: Locale;
  /** Which signal decided the outcome — useful for diagnostics and tests. */
  source: "cookie" | "accept-language" | "country" | "default";
};

export function negotiateLocale({
  cookie,
  acceptLanguage,
  countryCode,
}: NegotiationInput): NegotiationResult {
  const explicit = normalizeLocale(cookie);
  if (explicit) {
    return { locale: explicit, source: "cookie" };
  }

  const fromHeader = matchAcceptLanguage(acceptLanguage);
  if (fromHeader) {
    return { locale: fromHeader, source: "accept-language" };
  }

  const fromCountry = localeFromCountry(countryCode);
  if (fromCountry) {
    return { locale: fromCountry, source: "country" };
  }

  return { locale: defaultLocale, source: "default" };
}

export { locales, isLocale };
