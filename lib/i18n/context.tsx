"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import {
  createTranslator,
  scopeTranslator,
  type ScopedTranslator,
  type Translator,
} from "./messages";

/**
 * Client-side locale access.
 *
 * The provider carries only the locale. Messages are imported directly by
 * `createTranslator`, so the dictionary is part of the client bundle and is
 * shared by every component — no per-request dictionary is serialised into the
 * RSC payload, which is what the previous implementation did with a 264 KB
 * JSON blob.
 */

const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  const locale = useContext(LocaleContext);
  if (!locale) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return locale;
}

export function useTranslator(): Translator {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale), [locale]);
}

/**
 * Translator when a locale is in scope, null otherwise.
 *
 * Used by primitives shared between the public tree and the internal surfaces,
 * which render outside any `LocaleProvider`.
 */
export function useOptionalTranslator(): Translator | null {
  const locale = useContext(LocaleContext);
  return useMemo(() => (locale ? createTranslator(locale) : null), [locale]);
}

/** Namespace-scoped translator: `const t = useTranslations("hero")`. */
export function useTranslations<N extends string>(
  namespace: N,
): ScopedTranslator<N> {
  const translate = useTranslator();
  return useMemo(
    () => scopeTranslator(translate, namespace),
    [translate, namespace],
  );
}
