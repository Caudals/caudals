/**
 * Locale-aware canonical and hreflang construction.
 *
 * Every public page declares:
 *   - a canonical URL that includes its own locale prefix,
 *   - one `hreflang` alternate per supported locale,
 *   - an `x-default` alternate pointing at the default locale.
 *
 * Google treats the alternates as a set, so each language can be indexed on its
 * own URL while still being understood as the same page.
 */

import type { Metadata } from "next";
import { defaultLocale, localeHtmlLang, locales, type Locale } from "./config";
import { localizePathname } from "./routing";

/**
 * Builds the `alternates` block for a locale-free pathname.
 *
 * `pathname` is the path without any locale prefix (`"/blog"`), and `locale`
 * is the language of the page being rendered.
 */
export function buildAlternates(
  pathname: string,
  locale: Locale,
  toAbsoluteUrl: (path: string) => string,
): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};

  for (const candidate of locales) {
    languages[localeHtmlLang[candidate]] = toAbsoluteUrl(
      localizePathname(pathname, candidate),
    );
  }

  languages["x-default"] = toAbsoluteUrl(
    localizePathname(pathname, defaultLocale),
  );

  return {
    canonical: toAbsoluteUrl(localizePathname(pathname, locale)),
    languages,
  };
}
