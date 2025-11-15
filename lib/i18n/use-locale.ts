"use client";

import { useContext } from "react";
import { TranslationContext } from "./translation-context";

export function useLocale() {
  const context = useContext(TranslationContext);

  if (!context) {
    throw new Error("useLocale must be used within a TranslationProvider");
  }

  return context.locale;
}
