import { afterEach, describe, expect, it, vi } from "vitest";
import { detectPreferredLocale } from "@/lib/i18n/detect-locale";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("preferred locale detection", () => {
  it("uses Spanish for crawlers and clients without Accept-Language", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(
      detectPreferredLocale({ header: null, countryCode: "US" }),
    ).toBe("es");
  });

  it("keeps explicit English browser preference outside Spain", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(
      detectPreferredLocale({ header: "en-US,en;q=0.9", countryCode: "US" }),
    ).toBe("en");
  });

  it("uses Spanish for visitors in Spain", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(
      detectPreferredLocale({ header: "en-US", countryCode: "ES" }),
    ).toBe("es");
  });
});
