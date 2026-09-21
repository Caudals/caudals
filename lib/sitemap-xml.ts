import {
  defaultLocale,
  localeHtmlLang,
  locales,
} from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { buildMarketingUrl } from "@/lib/seo";

type SitemapAlternate = {
  /** `hreflang` value, e.g. "en", "es" or "x-default". */
  hreflang: string;
  href: string;
};

type SitemapUrl = {
  loc: string;
  lastmod?: string | null;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  /**
   * Language alternates for this URL. Google requires every page in a set to
   * list the whole set, including itself, so each localized URL is emitted as
   * its own `<url>` entry carrying the same alternates block.
   */
  alternates?: readonly SitemapAlternate[];
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderAlternates(alternates?: readonly SitemapAlternate[]) {
  if (!alternates?.length) return "";
  return alternates
    .map(
      ({ hreflang, href }) => `
    <xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}"/>`,
    )
    .join("");
}

export function renderUrlSet(entries: SitemapUrl[]) {
  const urls = entries
    .map(
      ({ loc, lastmod, changefreq, priority, alternates }) => `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod ? `
    <lastmod>${escapeXml(lastmod)}</lastmod>` : ""}${changefreq ? `
    <changefreq>${changefreq}</changefreq>` : ""}${priority !== undefined ? `
    <priority>${priority}</priority>` : ""}${renderAlternates(alternates)}
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>\n`;
}

export function renderSitemapIndex(locations: string[]) {
  const sitemaps = locations
    .map((loc) => `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n  </sitemap>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps}
</sitemapindex>\n`;
}

export function xmlResponse(body: string) {
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

/**
 * Expands one locale-free pathname into one `<url>` entry per locale, each
 * carrying the full set of `hreflang` alternates plus `x-default`.
 */
export function localizedUrlEntries({
  pathname,
  changefreq,
  priority,
  lastmod,
}: {
  pathname: string;
  changefreq?: SitemapUrl["changefreq"];
  priority?: number;
  lastmod?: string | null;
}): SitemapUrl[] {
  const alternates = [
    ...locales.map((locale) => ({
      hreflang: localeHtmlLang[locale],
      href: buildMarketingUrl(localizePathname(pathname, locale)),
    })),
    {
      hreflang: "x-default",
      href: buildMarketingUrl(localizePathname(pathname, defaultLocale)),
    },
  ];

  return locales.map((locale) => ({
    loc: buildMarketingUrl(localizePathname(pathname, locale)),
    changefreq,
    priority,
    lastmod,
    alternates,
  }));
}
