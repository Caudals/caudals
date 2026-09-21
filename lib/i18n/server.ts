import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "./config";
import {
  createTranslator,
  getMessages,
  scopeTranslator,
  type Messages,
  type ScopedTranslator,
  type Translator,
} from "./messages";

/**
 * Server-side locale access for the `/[locale]` tree.
 *
 * The locale comes from the URL segment, never from a cookie or a header, so a
 * page is a pure function of its URL. That is what allows these routes to be
 * statically rendered and cached, and what lets a crawler fetch each language
 * deterministically.
 */

/**
 * Validates a `[locale]` route param, 404ing on anything unsupported so
 * `/fr/blog` does not silently render English at a non-canonical URL.
 */
export function resolveLocale(value: string): Locale {
  if (!isLocale(value)) {
    notFound();
  }
  return value;
}

/** Per-request memoised translator, so one render builds it once. */
export const getTranslator = cache((locale: Locale): Translator =>
  createTranslator(locale),
);

export function getScopedTranslator<N extends string>(
  locale: Locale,
  namespace: N,
): ScopedTranslator<N> {
  return scopeTranslator(getTranslator(locale), namespace);
}

export function getLocaleMessages(locale: Locale): Messages {
  return getMessages(locale);
}
