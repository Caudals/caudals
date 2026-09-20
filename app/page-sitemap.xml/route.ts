import { buildMarketingUrl } from "@/lib/seo";
import { renderUrlSet, xmlResponse } from "@/lib/sitemap-xml";

const pages = [
  { pathname: "/", changefreq: "weekly", priority: 1 },
  { pathname: "/blog", changefreq: "weekly", priority: 0.9 },
  { pathname: "/newsletter", changefreq: "weekly", priority: 0.85 },
  { pathname: "/contact", changefreq: "monthly", priority: 0.8 },
  { pathname: "/call", changefreq: "monthly", priority: 0.7 },
  { pathname: "/legal/cookies", changefreq: "yearly", priority: 0.2 },
  { pathname: "/legal/notice", changefreq: "yearly", priority: 0.2 },
  { pathname: "/legal/privacy", changefreq: "yearly", priority: 0.2 },
  { pathname: "/legal/terms", changefreq: "yearly", priority: 0.2 },
] as const;

export function GET() {
  return xmlResponse(
    renderUrlSet(
      pages.map(({ pathname, changefreq, priority }) => ({
        loc: buildMarketingUrl(pathname),
        changefreq,
        priority,
      })),
    ),
  );
}
