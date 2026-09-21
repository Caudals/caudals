import { getIndexableMarketingRoutes } from "@/lib/seo";
import { localizedUrlEntries, renderUrlSet, xmlResponse } from "@/lib/sitemap-xml";

/**
 * Static marketing pages, in every locale.
 *
 * Each page contributes one `<url>` entry per language, and every entry lists
 * the full `hreflang` set, so search engines index the English and Spanish
 * versions independently while understanding them as the same page.
 */
export function GET() {
  const entries = getIndexableMarketingRoutes().flatMap((route) =>
    localizedUrlEntries({
      pathname: route.pathname,
      changefreq: route.changeFrequency,
      priority: route.priority,
    }),
  );

  return xmlResponse(renderUrlSet(entries));
}
