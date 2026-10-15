"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import {
  mergeMessages,
  scopeTranslator,
  translatorFrom,
  type PartialMessages,
  type ScopedTranslator,
  type Translator,
} from "./translate";

/**
 * Client-side locale and message access.
 *
 * The client gets only the messages it reads, in one language (launch L-24b).
 * The public layout sends the namespaces of the shared frame through
 * `LocaleProvider` (`PUBLIC_SHELL_MESSAGES` in `lib/i18n/client-messages.ts`),
 * and a page adds the ones its own client components read with
 * `ClientMessages` (`components/i18n/client-messages.tsx`). Both travel in the
 * page's RSC payload. This module never imports the catalogues: bundling both
 * of them into every public page cost ~31 KB of compressed script before the
 * first paint.
 *
 * A key whose namespace the page did not send renders as the key itself, and
 * development logs which namespace is missing.
 */

const LocaleContext = createContext<Locale | null>(null);
const MessagesContext = createContext<PartialMessages>({});

const reported = new Set<string>();
function reportMissing(key: string) {
  if (process.env.NODE_ENV === "production" || reported.has(key)) return;
  reported.add(key);
  console.error(
    `Missing message "${key}": send its namespace to the client with LocaleProvider or ClientMessages (lib/i18n/context.tsx).`,
  );
}

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  /** The messages the page's client components read, from `pickMessages`. */
  messages: PartialMessages;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>
      <MessagesContext.Provider value={messages}>{children}</MessagesContext.Provider>
    </LocaleContext.Provider>
  );
}

/** Adds messages for the client components below it to those already provided. */
export function MessagesProvider({
  messages,
  children,
}: {
  messages: PartialMessages;
  children: React.ReactNode;
}) {
  const parent = useContext(MessagesContext);
  const merged = useMemo(() => mergeMessages(parent, messages), [parent, messages]);
  return <MessagesContext.Provider value={merged}>{children}</MessagesContext.Provider>;
}

export function useLocale(): Locale {
  const locale = useContext(LocaleContext);
  if (!locale) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return locale;
}

export function useTranslator(): Translator {
  const messages = useContext(MessagesContext);
  return useMemo(() => translatorFrom(messages, undefined, reportMissing), [messages]);
}

/**
 * Translator when a locale is in scope, null otherwise.
 *
 * Used by primitives shared between the public tree and the internal surfaces,
 * which render outside any `LocaleProvider`.
 */
export function useOptionalTranslator(): Translator | null {
  const locale = useContext(LocaleContext);
  const messages = useContext(MessagesContext);
  return useMemo(
    () => (locale ? translatorFrom(messages, undefined, reportMissing) : null),
    [locale, messages],
  );
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
