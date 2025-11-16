import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, type Locale, locales } from "./config";
import { detectPreferredLocale } from "./detect-locale";
import { getDictionary } from "./dictionaries";
import { createTranslator } from "./create-translator";
import { placeholderTranslations } from "./placeholder-translations";

const dictionariesCache = cache(async (locale: Locale) => getDictionary(locale));

function ensureLocale(value?: string | null): Locale | null {
  if (!value) return null;
  return locales.includes(value as Locale) ? (value as Locale) : null;
}

async function getCountryCodeFromHeaders(headersStore: Headers): Promise<string | null> {
  // Try platform-specific headers first
  const headerCountry = 
    headersStore.get("x-vercel-ip-country") ??
    headersStore.get("cf-ipcountry") ??
    headersStore.get("x-country-code") ??
    headersStore.get("cloudfront-viewer-country") ??
    headersStore.get("x-forwarded-country");

  if (headerCountry) {
    return headerCountry;
  }

  // Fallback to IP-based geolocation for self-hosted environments
  const { getClientIP, getCountryFromIP } = await import("./geolocation");
  const clientIP = getClientIP(headersStore);
  
  if (clientIP) {
    const country = await getCountryFromIP(clientIP);
    if (country) {
      return country;
    }
  }

  return null;
}

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = ensureLocale(
    cookieStore.get(LOCALE_COOKIE)?.value ?? null,
  );
  if (cookieLocale) {
    return cookieLocale;
  }

  const headerStore = await headers();
  const countryCode = await getCountryCodeFromHeaders(headerStore);
  const headerLocale = detectPreferredLocale({
    header: headerStore.get("accept-language"),
    countryCode,
  });

  return headerLocale;
}

export async function getServerTranslationBundle() {
  const locale = await getRequestLocale();
  const dictionary = await dictionariesCache(locale);
  const placeholders = placeholderTranslations[locale] ?? [];
  const translator = createTranslator(locale, dictionary, placeholders);

  return {
    locale,
    dictionary,
    placeholders,
    translator,
  };
}

export async function getServerTranslator() {
  const bundle = await getServerTranslationBundle();
  return bundle.translator;
}
