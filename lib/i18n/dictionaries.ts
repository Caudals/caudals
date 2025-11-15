import esTranslations from "./es.json";
import { defaultLocale, type Locale } from "./config";

export type LocaleDictionary = Record<string, string>;

const dictionaries: Record<Locale, LocaleDictionary> = {
  en: {},
  es: esTranslations as LocaleDictionary,
};

export function getDictionary(locale: Locale): LocaleDictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

export { dictionaries };
