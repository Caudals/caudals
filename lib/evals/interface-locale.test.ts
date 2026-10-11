import { describe, expect, it } from "vitest";
import { resolveInterfaceLocale } from "@/lib/evals/interface-locale";

describe("app interface locale", () => {
  it("keeps an explicit choice over the browser language", () => {
    expect(resolveInterfaceLocale("en", "es-ES,es;q=0.9")).toBe("en");
    expect(resolveInterfaceLocale("es", "en-US,en;q=0.9")).toBe("es");
  });

  it("opens in Spanish for a Spanish browser without a saved choice", () => {
    expect(resolveInterfaceLocale(undefined, "es-ES,es;q=0.9,en;q=0.8")).toBe("es");
    expect(resolveInterfaceLocale(undefined, "es-MX")).toBe("es");
  });

  it("falls back to English for other or missing languages and unknown cookies", () => {
    expect(resolveInterfaceLocale(undefined, "en-GB,en;q=0.9")).toBe("en");
    expect(resolveInterfaceLocale(undefined, "fr-FR,fr;q=0.9")).toBe("en");
    expect(resolveInterfaceLocale(undefined, null)).toBe("en");
    expect(resolveInterfaceLocale("de", "es-ES")).toBe("es");
  });
});
