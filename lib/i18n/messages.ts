/**
 * The message catalogues and type-safe access to them.
 *
 * This module imports both `en.json` and `es.json`, so it is for the server
 * and for server-rendered components. Client components read messages through
 * `lib/i18n/context.tsx`, which holds only what the page sent them
 * (`pickMessages`, launch L-24b); importing this module from a client component
 * would put both catalogues back in every public page's script.
 *
 * `es.json` is checked against the shape of `en.json` at compile time, so a key
 * that exists in one locale and not the other is a type error rather than a
 * silent English fallback at runtime.
 */

import en from "./messages/en.json";
import es from "./messages/es.json";
import { defaultLocale, type Locale } from "./config";
import {
  mergeMessages,
  resolveGroup,
  scopeTranslator,
  translatorFrom,
  type MessagePath,
  type Messages,
  type PartialMessages,
  type ScopedTranslator,
  type Translator,
} from "./translate";

export {
  scopeTranslator,
  type MessageGroup,
  type MessageKey,
  type MessagePath,
  type Messages,
  type Namespace,
  type NamespaceKeys,
  type PartialMessages,
  type ScopedTranslator,
  type TranslationValues,
  type Translator,
} from "./translate";

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

/**
 * Builds a translator bound to one locale. A key missing from the requested
 * locale falls back to English, and a key missing everywhere returns the key
 * itself so the gap is obvious on screen rather than rendering blank.
 */
export function createTranslator(locale: Locale): Translator {
  return translatorFrom(getMessages(locale), dictionaries[defaultLocale]);
}

/**
 * A translator narrowed to one namespace or group, for components that render
 * on the server and in the UI harness alike (`lib/i18n/server.ts` holds the
 * request-cached server-only version).
 */
export function createScopedTranslator<N extends string>(locale: Locale, namespace: N): ScopedTranslator<N> {
  return scopeTranslator(createTranslator(locale), namespace);
}

/**
 * The part of one locale's catalogue that some client components read: whole
 * namespaces (`"demo"`) or groups inside them (`"steps.exam"`). Passed to
 * `LocaleProvider` or `ClientMessages`, it travels in the page's RSC payload
 * instead of both catalogues travelling in its script.
 */
export function pickMessages(locale: Locale, groups: readonly MessagePath[]): PartialMessages {
  const source = getMessages(locale);
  let picked: PartialMessages = {};
  for (const group of groups) {
    const segments = group.split(".");
    const value = resolveGroup(source, segments);
    if (value === undefined) continue;
    // `{ steps: { exam: … } }` for "steps.exam"; merging copies, so the catalogue is never mutated.
    const nested = segments.reduceRight<unknown>((inner, segment) => ({ [segment]: inner }), value);
    picked = mergeMessages(picked, nested as PartialMessages);
  }
  return picked;
}
