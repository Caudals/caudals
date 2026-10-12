import { sampleReportIndexed } from "@/lib/evals/example/flags";
import { SAMPLE_REPORT_PATH } from "@/lib/evals/example/public";
import { getIndexableMarketingRoutes } from "@/lib/seo";
import { localizedUrlEntries, renderUrlSet, xmlResponse } from "@/lib/sitemap-xml";

// Read per request: the sample report joins once SAMPLE_REPORT_INDEXED is on (launch L-33).
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
export function GET() {
  const routes = [
    ...getIndexableMarketingRoutes(),
    ...(sampleReportIndexed() ? [{ pathname: SAMPLE_REPORT_PATH, changeFrequency: "monthly" as const, priority: 0.7, lastModified: SAMPLE_REPORT_UPDATED }] : []),
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
