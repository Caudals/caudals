/**
 * Pure path helpers for locale-prefixed public routes.
 *
 * Every public marketing URL is `/{locale}{pathname}`. These helpers are the
 * single place that shape is encoded, and they are edge-safe so the proxy and
 * the rendering layers cannot drift apart.
 */

import {
  SECTOR_IDS,
  SECTOR_SLUGS,
  SECTORS_HUB_PATH,
  SECTORS_HUB_SEGMENT,
  sectorPath,
} from "@/lib/public/sectors";
import { isLocale, locales, type Locale } from "./config";

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
 * Pages whose public path is translated per locale.
 *
 * Code always names a page by its internal, locale-free pathname — the folder
 * under `app/[locale]` (`/sectors/insurance`). Visitors and crawlers see the
 * translated form (`/es/sectores/seguros`); the proxy rewrites it back to the
 * internal path. Pages not listed here use the same path in every locale.
 */
/** Funnel and legal pages whose Spanish path is its own word. */
const PAGE_PATHS: readonly (readonly [string, Record<Locale, string>])[] = [
  ["/contact", { en: "/contact", es: "/contacto" }],
  ["/call", { en: "/call", es: "/llamada" }],
  ["/legal/privacy", { en: "/legal/privacy", es: "/legal/privacidad" }],
  ["/legal/terms", { en: "/legal/terms", es: "/legal/terminos" }],
  ["/legal/notice", { en: "/legal/notice", es: "/legal/aviso-legal" }],
];

const TRANSLATED_PATHS: ReadonlyMap<string, Record<Locale, string>> = new Map([
  ...PAGE_PATHS,
  [
    SECTORS_HUB_PATH,
    Object.fromEntries(
      locales.map((locale) => [locale, `/${SECTORS_HUB_SEGMENT[locale]}`]),
    ) as Record<Locale, string>,
  ],
  ...SECTOR_IDS.map(
    (id) =>
      [
        sectorPath(id),
        Object.fromEntries(
          locales.map((locale) => [
            locale,
            `/${SECTORS_HUB_SEGMENT[locale]}/${SECTOR_SLUGS[id][locale]}`,
          ]),
        ) as Record<Locale, string>,
      ] as const,
  ),
]);

/** Public path → internal path, per locale. */
function buildInternalPaths(locale: Locale): ReadonlyMap<string, string> {
  return new Map(
    [...TRANSLATED_PATHS].map(([internal, byLocale]) => [byLocale[locale], internal]),
  );
}

const INTERNAL_PATHS: Record<Locale, ReadonlyMap<string, string>> = {
  en: buildInternalPaths("en"),
  es: buildInternalPaths("es"),
};

/**
 * The public, locale-free form of an internal pathname in a given locale.
 * `("/sectors/insurance", "es")` → `"/sectores/seguros"`.
 */
export function toPublicPathname(pathname: string, locale: Locale): string {
  const normalized = normalizePathname(pathname);
  return TRANSLATED_PATHS.get(normalized)?.[locale] ?? normalized;
}

/**
 * The internal pathname behind a public, locale-free path in a given locale.
 * `("/sectores/seguros", "es")` → `"/sectors/insurance"`. Paths that are not
 * translated, or are already internal, come back unchanged.
 */
export function toInternalPathname(pathname: string, locale: Locale): string {
  const normalized = normalizePathname(pathname);
  return INTERNAL_PATHS[locale].get(normalized) ?? normalized;
}

/**
 * The internal pathname a public path names in *another* locale — for a
 * visitor who kept `/sectores/seguros` but switched the prefix to `/en`.
 */
export function findInternalPathnameInAnyLocale(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  for (const locale of locales) {
    const internal = INTERNAL_PATHS[locale].get(normalized);
    if (internal) return internal;
  }
  return null;
}

/**
 * Builds the locale-prefixed public path for an internal, locale-free pathname.
 * `("/blog", "es")` → `"/es/blog"`; `("/", "en")` → `"/en"`;
 * `("/sectors/insurance", "es")` → `"/es/sectores/seguros"`.
 */
export function localizePathname(pathname: string, locale: Locale): string {
  if (isNonLocalizedPath(pathname)) return normalizePathname(pathname);
  const normalized = toPublicPathname(pathname, locale);
  return normalized === "/" ? `/${locale}` : `/${locale}${normalized}`;
}

/**
 * Rewrites a full path (which may already carry a locale) to another locale,
 * preserving the rest of the path. Used by the language switcher so a visitor
 * stays on the page they are reading, including pages whose slug is
 * translated. Accepts either the public or the internal form of the path.
 */
export function switchLocalePathname(
  currentPathname: string,
  nextLocale: Locale,
): string {
  const { locale, pathname } = splitLocale(currentPathname);
  const internal = locale ? toInternalPathname(pathname, locale) : pathname;
  return localizePathname(internal, nextLocale);
}
