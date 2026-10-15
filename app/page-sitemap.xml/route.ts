import { sampleReportIndexed } from "@/lib/evals/example/flags";
import { SAMPLE_REPORT_PATH } from "@/lib/evals/example/public";
import { RESULTS_PATH } from "@/lib/publication/contracts";
import { indexedPublicResultPages } from "@/lib/publication/indexed";
import { getIndexableMarketingRoutes } from "@/lib/seo";
import { localizedUrlEntries, renderUrlSet, xmlResponse } from "@/lib/sitemap-xml";

// Read per request: the sample report joins once SAMPLE_REPORT_INDEXED is on
// (launch L-33), and published results pages once PUBLIC_RESULTS_INDEXED is
// on (launch L-31, gap G3): only live pages with the owner's standing consent.
export const dynamic = "force-dynamic";

/** Content date of the sample report (lib/evals/example/source/company.ts EXAMPLE_VERSION). */
const SAMPLE_REPORT_UPDATED = "2026-10-12";

/**
 * Static marketing pages, in every locale.
 *
 * Each page contributes one `<url>` entry per language, and every entry lists
 * the full `hreflang` set, so search engines index the English and Spanish
 * versions independently while understanding them as the same page.
 */
export async function GET() {
  const results = await indexedPublicResultPages();
  const routes = [
    ...getIndexableMarketingRoutes(),
    ...(sampleReportIndexed() ? [{ pathname: SAMPLE_REPORT_PATH, changeFrequency: "monthly" as const, priority: 0.7, lastModified: SAMPLE_REPORT_UPDATED }] : []),
    ...results.map((page) => ({ pathname: `${RESULTS_PATH}/${page.slug}`, changeFrequency: "monthly" as const, priority: 0.5, lastModified: page.publishedAt.slice(0, 10) })),
  ];
  const entries = routes.flatMap((route) =>
    localizedUrlEntries({
      pathname: route.pathname,
      changefreq: route.changeFrequency,
      priority: route.priority,
      lastmod: route.lastModified,
    }),
  );

  return xmlResponse(renderUrlSet(entries));
}
