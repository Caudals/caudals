import { describe, expect, it } from "vitest";

import {
  hasUnsupportedLocalePrefix,
  isNonLocalizedPath,
  localizePathname,
  normalizePathname,
  splitLocale,
  switchLocalePathname,
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
