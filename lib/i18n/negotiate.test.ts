import { describe, expect, it } from "vitest";

import {
  getCountryFromHeaders,
  localeFromCountry,
  matchAcceptLanguage,
  negotiateLocale,
  parseAcceptLanguage,
} from "@/lib/i18n/negotiate";

describe("parseAcceptLanguage", () => {
  it("orders tags by quality, strongest first", () => {
    expect(
      parseAcceptLanguage("en;q=0.4,es;q=0.9,fr;q=0.7").map((e) => e.tag),
    ).toEqual(["es", "fr", "en"]);
  });

  it("defaults a tag with no q to the highest quality", () => {
    expect(parseAcceptLanguage("es,en;q=0.5").map((e) => e.tag)).toEqual([
      "es",
      "en",
    ]);
  });

  it("drops q=0, which explicitly refuses a language", () => {
    expect(parseAcceptLanguage("es;q=0,en").map((e) => e.tag)).toEqual(["en"]);
  });

  it("returns nothing for an absent or blank header", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("   ")).toEqual([]);
  });
});

describe("matchAcceptLanguage", () => {
  it("matches a regional tag to its base locale", () => {
    expect(matchAcceptLanguage("es-419,es;q=0.9")).toBe("es");
    expect(matchAcceptLanguage("en-GB")).toBe("en");
  });

  it("skips unsupported languages and takes the best supported one", () => {
    expect(matchAcceptLanguage("fr;q=0.9,de;q=0.8,es;q=0.7")).toBe("es");
  });

  it("treats a wildcard as no preference rather than a match", () => {
    expect(matchAcceptLanguage("*")).toBeNull();
  });

  it("returns null when nothing is supported", () => {
    expect(matchAcceptLanguage("fr,de,it")).toBeNull();
  });
});

describe("localeFromCountry", () => {
  it("maps Spanish-speaking countries to Spanish", () => {
    expect(localeFromCountry("ES")).toBe("es");
    expect(localeFromCountry("mx")).toBe("es");
  });

  it("returns null elsewhere, leaving the default to apply", () => {
    expect(localeFromCountry("DE")).toBeNull();
    expect(localeFromCountry(null)).toBeNull();
  });
});

describe("getCountryFromHeaders", () => {
  it("reads the first edge header that carries a country", () => {
    const headers = new Headers({ "cf-ipcountry": "es" });
    expect(getCountryFromHeaders(headers)).toBe("ES");
  });

  it("ignores the XX placeholder some CDNs send", () => {
    const headers = new Headers({ "cf-ipcountry": "XX" });
    expect(getCountryFromHeaders(headers)).toBeNull();
  });

  it("returns null when no country header is present", () => {
    expect(getCountryFromHeaders(new Headers())).toBeNull();
  });
});

describe("negotiateLocale", () => {
  it("honours an explicit choice above every other signal", () => {
    // The regression this guards: a visitor in Spain who chose English used to
    // have that choice overwritten on every single request.
    expect(
      negotiateLocale({
        cookie: "en",
        acceptLanguage: "es-ES,es;q=0.9",
        countryCode: "ES",
      }),
    ).toEqual({ locale: "en", source: "cookie" });
  });

  it("uses the browser's stated preference when there is no cookie", () => {
    expect(
      negotiateLocale({ acceptLanguage: "es-ES,es;q=0.9", countryCode: "US" }),
    ).toEqual({ locale: "es", source: "accept-language" });
  });

  it("does not let a country hint override a stated preference", () => {
    expect(
      negotiateLocale({ acceptLanguage: "en-GB,en;q=0.9", countryCode: "ES" }),
    ).toEqual({ locale: "en", source: "accept-language" });
  });

  it("falls back to the country only when no language was stated", () => {
    expect(negotiateLocale({ countryCode: "ES" })).toEqual({
      locale: "es",
      source: "country",
    });
  });

  it("serves the default locale to a client that states nothing", () => {
    // Crawlers commonly send no Accept-Language. They must get the default
    // locale, not an arbitrary one, so the language they index is predictable.
    expect(negotiateLocale({})).toEqual({ locale: "en", source: "default" });
  });

  it("ignores a cookie holding an unsupported locale", () => {
    expect(
      negotiateLocale({ cookie: "fr", acceptLanguage: "es" }),
    ).toEqual({ locale: "es", source: "accept-language" });
  });
});
