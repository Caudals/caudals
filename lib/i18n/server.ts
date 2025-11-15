import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE,
  type Locale,
  locales,
} from "./config";
import { detectLocaleFromHeader } from "./detect-locale";
import { getDictionary } from "./dictionaries";
import { createTranslator } from "./create-translator";
import { placeholderTranslations } from "./placeholder-translations";

const dictionariesCache = cache(async (locale: Locale) => getDictionary(locale));

function ensureLocale(value?: string | null): Locale | null {
  if (!value) return null;
  return locales.includes(value as Locale) ? (value as Locale) : null;
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
  const headerLocale = detectLocaleFromHeader(
    headerStore.get("accept-language"),
  );

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
