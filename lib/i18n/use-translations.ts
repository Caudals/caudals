"use client";

import { useContext, useMemo } from "react";
import { createTranslator } from "./create-translator";
import { TranslationContext } from "./translation-context";

export function useTranslations() {
  const context = useContext(TranslationContext);

  if (!context) {
    throw new Error("useTranslations must be used within a TranslationProvider");
  }

  return useMemo(
    () =>
      createTranslator(context.locale, context.dictionary, context.placeholders),
    [context.locale, context.dictionary, context.placeholders],
  );
}
