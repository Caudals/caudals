import { defaultLocale, type Locale, locales } from "./config";

const supportedLocales = new Set<Locale>(locales);
const SPAIN_COUNTRY_CODES = new Set(["ES", "ESP"]);

function toLocale(value?: string | null): Locale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (supportedLocales.has(lower as Locale)) return lower as Locale;

  const base = lower.split("-")[0];
  if (supportedLocales.has(base as Locale)) return base as Locale;

  return null;
}

export function detectLocaleFromHeader(header?: string | null): Locale {
  if (!header) return defaultLocale;

  const languages = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [lang, qValue] = part.split(";q=");
      const q = qValue ? Number.parseFloat(qValue) : 1;
      return { lang, q: Number.isFinite(q) ? q : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of languages) {
    const match = toLocale(lang);
    if (match) {
      return match;
    }
  }

  return defaultLocale;
}

function normalizeCountryCode(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length === 2) return trimmed.toUpperCase();
  if (trimmed.length === 3 && trimmed.toUpperCase().startsWith("ES")) {
    // Handle variations like "ESP"
    return "ES";
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function detectLocaleFromCountry(
  countryCode?: string | null,
): Locale | null {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return null;

  if (SPAIN_COUNTRY_CODES.has(normalized)) {
    return "es";
  }

  return null;
}

export function detectPreferredLocale({
  header,
  countryCode,
}: {
  header?: string | null;
  countryCode?: string | null;
}): Locale {
  const headerLocale = detectLocaleFromHeader(header);

  if (headerLocale !== defaultLocale) {
    return headerLocale;
  }

  const countryLocale = detectLocaleFromCountry(countryCode);
  if (countryLocale) {
    return countryLocale;
  }

  return headerLocale;
}
