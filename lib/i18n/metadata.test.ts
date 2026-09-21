import { describe, expect, it } from "vitest";

import { buildAlternates } from "@/lib/i18n/metadata";

const toAbsoluteUrl = (path: string) => `https://caudals.com${path}`;

describe("buildAlternates", () => {
  it("makes the canonical self-referencing, in the page's own locale", () => {
    // Each language must be canonical to itself; pointing both at one URL is
    // what stops the second language from being indexed at all.
    expect(buildAlternates("/blog", "es", toAbsoluteUrl).canonical).toBe(
      "https://caudals.com/es/blog",
    );
    expect(buildAlternates("/blog", "en", toAbsoluteUrl).canonical).toBe(
      "https://caudals.com/en/blog",
    );
  });

  it("lists every locale plus x-default", () => {
    expect(buildAlternates("/contact", "en", toAbsoluteUrl).languages).toEqual({
      en: "https://caudals.com/en/contact",
      es: "https://caudals.com/es/contact",
      "x-default": "https://caudals.com/en/contact",
    });
  });

  it("gives both locales the identical alternates block", () => {
    // Google requires every page in an hreflang set to list the whole set,
    // including itself, and the sets must agree.
    expect(buildAlternates("/", "en", toAbsoluteUrl).languages).toEqual(
      buildAlternates("/", "es", toAbsoluteUrl).languages,
    );
  });

  it("handles the site root", () => {
    expect(buildAlternates("/", "es", toAbsoluteUrl).canonical).toBe(
      "https://caudals.com/es",
    );
  });
});
