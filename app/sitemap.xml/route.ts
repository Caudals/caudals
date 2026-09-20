import { buildMarketingUrl } from "@/lib/seo";
import { renderSitemapIndex, xmlResponse } from "@/lib/sitemap-xml";

export function GET() {
  return xmlResponse(
    renderSitemapIndex([
      buildMarketingUrl("/post-sitemap.xml"),
      buildMarketingUrl("/page-sitemap.xml"),
    ]),
  );
}
