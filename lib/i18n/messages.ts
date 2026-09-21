/**
 * Type-safe message access.
 *
 * `en.json` is the single source of truth for the shape of the dictionary: its
 * nested structure generates `MessageKey`, a union of every valid dotted path
 * (`"hero.headline"`, `"contact.submit"`, …). `es.json` is checked against that
 * same shape at compile time, so a key that exists in one locale and not the
 * other is a type error rather than a silent English fallback at runtime.
 *
 * Interpolation uses single braces — `"© {year} Caudals."` — and missing values
 * are left as-is rather than blanked, which makes an unfilled slot visible in
 * review instead of shipping an empty string.
 */

import en from "./messages/en.json";
import es from "./messages/es.json";
import { defaultLocale, type Locale } from "./config";

/** The canonical dictionary shape, derived from the English messages. */
export type Messages = typeof en;

/** Recursively builds the union of dotted paths that resolve to a string. */
type DottedKeys<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DottedKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = DottedKeys<Messages>;

export type TranslationValues = Record<string, string | number>;

/**
 * Every locale must supply exactly the English key set. `es.json` is typed
 * against this, so adding an English key without its Spanish counterpart fails
 * `tsc` rather than degrading silently in production.
 */
const dictionaries: Record<Locale, Messages> = {
  en,
  es: es satisfies Messages,
};

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

const INTERPOLATION = /\{(\w+)\}/g;

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(INTERPOLATION, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

function resolve(messages: Messages, key: string): string | undefined {
  let current: unknown = messages;
  for (const segment of key.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

export type Translator = (key: MessageKey, values?: TranslationValues) => string;

/**
 * Builds a translator bound to one locale. A key missing from the requested
 * locale falls back to English, and a key missing everywhere returns the key
 * itself so the gap is obvious on screen rather than rendering blank.
 */
export function createTranslator(locale: Locale): Translator {
  const messages = getMessages(locale);
  const fallback = dictionaries[defaultLocale];

  return (key, values) => {
    const template = resolve(messages, key) ?? resolve(fallback, key);
    return template === undefined ? key : interpolate(template, values);
  };
}

/**
 * Narrows a translator to one namespace, so a component reads
 * `t("headline")` instead of repeating `"hero."` at every call site.
 */
export type NamespaceKeys<N extends string> = MessageKey extends infer K
  ? K extends `${N}.${infer Rest}`
    ? Rest
    : never
  : never;

export type ScopedTranslator<N extends string> = (
  key: NamespaceKeys<N>,
  values?: TranslationValues,
) => string;

export function scopeTranslator<N extends string>(
  translate: Translator,
  namespace: N,
): ScopedTranslator<N> {
  return (key, values) =>
    translate(`${namespace}.${key}` as MessageKey, values);
}
