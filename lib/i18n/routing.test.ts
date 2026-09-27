import { describe, expect, it } from "vitest";

import {
  findInternalPathnameInAnyLocale,
  hasUnsupportedLocalePrefix,
  isNonLocalizedPath,
  localizePathname,
  normalizePathname,
  splitLocale,
  switchLocalePathname,
  toInternalPathname,
  toPublicPathname,
} from "@/lib/i18n/routing";

describe("normalizePathname", () => {
  it("adds a leading slash and drops trailing ones", () => {
    expect(normalizePathname("blog/")).toBe("/blog");
    expect(normalizePathname("/blog//")).toBe("/blog");
  });

  it("keeps the root as a bare slash", () => {
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname("")).toBe("/");
  });
});

describe("isNonLocalizedPath", () => {
  it("keeps the internal surfaces out of the locale tree", () => {
    // AGENTS.md requires public marketing pages and the Operator Console to
    // stay strictly separate; these must never take a locale prefix.
    for (const pathname of [
      "/admin",
      "/admin/requests",
      "/auth/sign-in",
      "/api/newsletter",
      "/ops/runs",
      "/workspace/reports",
    ]) {
      expect(isNonLocalizedPath(pathname), pathname).toBe(true);
    }
  });

  it("keeps machine-readable files at the root", () => {
    for (const pathname of [
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/manifest.webmanifest",
    ]) {
      expect(isNonLocalizedPath(pathname), pathname).toBe(true);
    }
  });

  it("treats public marketing pages as localizable", () => {
    for (const pathname of ["/", "/blog", "/contact", "/legal/privacy"]) {
      expect(isNonLocalizedPath(pathname), pathname).toBe(false);
    }
  });
});

describe("splitLocale", () => {
  it("separates a locale prefix from the rest of the path", () => {
    expect(splitLocale("/es/blog")).toEqual({ locale: "es", pathname: "/blog" });
    expect(splitLocale("/en")).toEqual({ locale: "en", pathname: "/" });
  });

  it("reports no locale when the path carries none", () => {
    expect(splitLocale("/blog")).toEqual({ locale: null, pathname: "/blog" });
  });

  it("does not mistake an unsupported language tag for a locale", () => {
    expect(splitLocale("/fr/blog")).toEqual({
      locale: null,
      pathname: "/fr/blog",
    });
  });
});

describe("localizePathname", () => {
  it("prefixes public paths", () => {
    expect(localizePathname("/blog", "es")).toBe("/es/blog");
    expect(localizePathname("/", "en")).toBe("/en");
  });

  it("leaves internal and machine-readable paths untouched", () => {
    expect(localizePathname("/admin", "es")).toBe("/admin");
    expect(localizePathname("/sitemap.xml", "es")).toBe("/sitemap.xml");
  });
});

describe("switchLocalePathname", () => {
  it("swaps the locale while staying on the same page", () => {
    expect(switchLocalePathname("/es/legal/privacy", "en")).toBe(
      "/en/legal/privacy",
    );
  });

  it("is idempotent for the locale already in the path", () => {
    expect(switchLocalePathname("/en/blog", "en")).toBe("/en/blog");
  });

  it("handles the localized root", () => {
    expect(switchLocalePathname("/es", "en")).toBe("/en");
  });
});

describe("hasUnsupportedLocalePrefix", () => {
  it("flags a language we do not publish", () => {
    expect(hasUnsupportedLocalePrefix("/fr/blog")).toBe(true);
    expect(hasUnsupportedLocalePrefix("/de")).toBe(true);
  });

  it("does not flag supported locales or ordinary paths", () => {
    expect(hasUnsupportedLocalePrefix("/es/blog")).toBe(false);
    expect(hasUnsupportedLocalePrefix("/blog")).toBe(false);
    expect(hasUnsupportedLocalePrefix("/contact")).toBe(false);
  });
});

describe("translated paths", () => {
  it("localizes sector pages with each language's own slug", () => {
    expect(localizePathname("/sectors", "es")).toBe("/es/sectores");
    expect(localizePathname("/sectors", "en")).toBe("/en/sectors");
    expect(localizePathname("/sectors/insurance", "es")).toBe("/es/sectores/seguros");
    expect(localizePathname("/sectors/insurance", "en")).toBe("/en/sectors/insurance");
    expect(localizePathname("/sectors/industrial-after-sales", "es")).toBe(
      "/es/sectores/posventa-industrial",
    );
  });

  it("maps public slugs back to the internal route", () => {
    expect(toInternalPathname("/sectores/seguros", "es")).toBe("/sectors/insurance");
    expect(toInternalPathname("/sectores", "es")).toBe("/sectors");
    // Untranslated and already-internal paths pass through.
    expect(toInternalPathname("/blog", "es")).toBe("/blog");
    expect(toInternalPathname("/sectors/insurance", "es")).toBe("/sectors/insurance");
    expect(toPublicPathname("/blog", "es")).toBe("/blog");
  });

  it("recognises a slug typed under the wrong language", () => {
    expect(findInternalPathnameInAnyLocale("/sectores/banca")).toBe("/sectors/banking");
    expect(findInternalPathnameInAnyLocale("/blog")).toBeNull();
  });

  it("keeps the reader on the same sector when switching language", () => {
    expect(switchLocalePathname("/es/sectores/seguros", "en")).toBe("/en/sectors/insurance");
    expect(switchLocalePathname("/en/sectors/insurance", "es")).toBe("/es/sectores/seguros");
    // The internal form (what a rewritten request may report) switches the same way.
    expect(switchLocalePathname("/es/sectors/insurance", "en")).toBe("/en/sectors/insurance");
  });
});

describe("translated funnel and legal paths", () => {
  it("uses Spanish words for the Spanish funnel and legal pages", () => {
    expect(localizePathname("/contact", "es")).toBe("/es/contacto");
    expect(localizePathname("/contact", "en")).toBe("/en/contact");
    expect(localizePathname("/call", "es")).toBe("/es/llamada");
    expect(localizePathname("/legal/privacy", "es")).toBe("/es/legal/privacidad");
    expect(localizePathname("/legal/terms", "es")).toBe("/es/legal/terminos");
    expect(localizePathname("/legal/notice", "es")).toBe("/es/legal/aviso-legal");
    expect(localizePathname("/legal/cookies", "es")).toBe("/es/legal/cookies");
  });

  it("maps the Spanish paths back to their routes", () => {
    expect(toInternalPathname("/contacto", "es")).toBe("/contact");
    expect(toInternalPathname("/legal/aviso-legal", "es")).toBe("/legal/notice");
    expect(switchLocalePathname("/es/llamada", "en")).toBe("/en/call");
    expect(switchLocalePathname("/en/legal/privacy", "es")).toBe("/es/legal/privacidad");
  });
});
