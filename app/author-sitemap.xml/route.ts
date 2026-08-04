import { CAUDALS_AUTHORS } from "@/lib/authors";
import { buildMarketingUrl } from "@/lib/seo";
import { renderUrlSet, xmlResponse } from "@/lib/sitemap-xml";

export function GET() {
  return xmlResponse(
    renderUrlSet(
      CAUDALS_AUTHORS.map((author) => ({
        loc: buildMarketingUrl(`/equipo/${author.slug}`),
        changefreq: "yearly",
        priority: 0.6,
      })),
    ),
  );
}
