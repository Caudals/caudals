import { describe, expect, it } from "vitest";

import { locales } from "@/lib/i18n/config";
import { createTranslator, type MessageKey } from "@/lib/i18n/messages";
import { newsletterFormSchema } from "@/lib/validators/newsletter";

describe("newsletterFormSchema", () => {
  it("accepts a valid address", () => {
    expect(newsletterFormSchema.safeParse({ email: "a@b.com" }).success).toBe(
      true,
    );
  });

  it("emits message keys that resolve in every locale", () => {
    // Zod runs where no locale is in scope. Any error it produces without an
    // explicit key falls back to its own English sentence, which would reach a
    // Spanish reader untranslated.
    for (const payload of [{}, { email: "not-an-email" }, { email: "a".repeat(330) }]) {
      const result = newsletterFormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (result.success) continue;

      const keys = Object.values(result.error.flatten().fieldErrors)
        .flat()
        .filter((message): message is string => typeof message === "string");

      expect(keys.length).toBeGreaterThan(0);
      for (const locale of locales) {
        const t = createTranslator(locale);
        for (const key of keys) {
          expect(t(key as MessageKey), `${locale}:${key}`).not.toBe(key);
        }
      }
    }
  });
});
