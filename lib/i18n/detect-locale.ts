import { defaultLocale, type Locale, locales } from "./config";

const supportedLocales = new Set<Locale>(locales);

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
