"use client";

import { createContext } from "react";
import { type Locale } from "./config";
import { type PlaceholderDefinition } from "./placeholder-translations";

export interface TranslationContextValue {
  locale: Locale;
  dictionary: Record<string, string>;
  placeholders?: PlaceholderDefinition[];
}

export const TranslationContext =
  createContext<TranslationContextValue | null>(null);

interface TranslationProviderProps extends TranslationContextValue {
  children: React.ReactNode;
}

export function TranslationProvider({
  children,
  locale,
  dictionary,
  placeholders,
}: TranslationProviderProps) {
  return (
    <TranslationContext.Provider
      value={{ locale, dictionary, placeholders }}
    >
      {children}
    </TranslationContext.Provider>
  );
}
