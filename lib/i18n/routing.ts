/**
 * Pure path helpers for locale-prefixed public routes.
 *
 * Every public marketing URL is `/{locale}{pathname}`. These helpers are the
 * single place that shape is encoded, and they are edge-safe so the proxy and
 * the rendering layers cannot drift apart.
 */

import { isLocale, type Locale } from "./config";

/**
 * Header the proxy stamps with the resolved request pathname, so the document
 * shell can label `<html lang>` from the URL without reading cookies.
 */
export const PATHNAME_HEADER = "x-caudals-pathname";

/** Public prefixes that are never locale-prefixed. */
const NON_LOCALIZED_PREFIXES = [
  "/admin",
  "/auth",
  "/api",
  "/ops",
  "/workspace",
  "/share",
  "/evaluation-entry",
  "/r/",
  "/pwa",
  "/requester",
  "/contributor",
  "/markdown-for-agents",
  "/_next",
  "/monitoring",
] as const;

/** Exact public paths served at the root, outside the locale tree. */
const NON_LOCALIZED_EXACT = new Set([
  "/robots.txt",
  "/llms.txt",
  "/sitemap.xml",
  "/page-sitemap.xml",
  "/post-sitemap.xml",
  "/manifest.webmanifest",
]);

/**
 * True when a pathname must stay outside `/[locale]` — the Operator Console,
 * auth, APIs and machine-readable files. Keeping this list authoritative is
 * what preserves the public/internal separation mandated by AGENTS.md.
 */
export function isNonLocalizedPath(pathname: string): boolean {
  if (NON_LOCALIZED_EXACT.has(pathname)) return true;
  if (pathname.includes(".")) return true; // static asset with an extension
  return NON_LOCALIZED_PREFIXES.some(
    (prefix) =>
      pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
  );
}

/** Normalizes to a leading slash with no trailing slash (root stays "/"). */
export function normalizePathname(pathname: string): string {
  const withLeading = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const trimmed = withLeading.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * True when a path's first segment looks like a language tag but is not one we
 * support — `/fr/blog`, `/de`. Such a request is a miss, not a page that needs
 * a locale prefix, so it is answered with a 404 rather than being rewritten to
 * `/en/fr/blog`.
 */
const LANGUAGE_TAG = /^[a-z]{2}(-[a-z0-9]{2,8})?$/i;

export function hasUnsupportedLocalePrefix(pathname: string): boolean {
  const [, first] = normalizePathname(pathname).split("/");
  if (!first || isLocale(first)) return false;
  return LANGUAGE_TAG.test(first);
}

/**
 * Splits a request pathname into its locale prefix (if any) and the remaining
 * locale-free pathname. `/es/blog` → `{ locale: "es", pathname: "/blog" }`.
 */
export function splitLocale(pathname: string): {
  locale: Locale | null;
  pathname: string;
} {
  const normalized = normalizePathname(pathname);
  const [, first, ...rest] = normalized.split("/");

  if (isLocale(first)) {
    const remainder = rest.length > 0 ? `/${rest.join("/")}` : "/";
    return { locale: first, pathname: normalizePathname(remainder) };
  }

  return { locale: null, pathname: normalized };
}

/**
 * Builds the locale-prefixed path for a locale-free pathname.
 * `("/blog", "es")` → `"/es/blog"`; `("/", "en")` → `"/en"`.
 */
export function localizePathname(pathname: string, locale: Locale): string {
  if (isNonLocalizedPath(pathname)) return normalizePathname(pathname);
  const normalized = normalizePathname(pathname);
  return normalized === "/" ? `/${locale}` : `/${locale}${normalized}`;
}

/**
 * Rewrites a full path (which may already carry a locale) to another locale,
 * preserving the rest of the path. Used by the language switcher so a visitor
 * stays on the page they are reading.
 */
export function switchLocalePathname(
  currentPathname: string,
  nextLocale: Locale,
): string {
  const { pathname } = splitLocale(currentPathname);
  return localizePathname(pathname, nextLocale);
}
