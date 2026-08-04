import { getAllBlogSlugs, getBlogPost } from "@/lib/blog/posts";
import { getPublishedIssues } from "@/lib/newsletter/client";
import { defaultLocale } from "@/lib/i18n/config";
import { buildMarketingUrl } from "@/lib/seo";
import { renderUrlSet, xmlResponse } from "@/lib/sitemap-xml";

export const revalidate = 3600;

export async function GET() {
  const slugs = await getAllBlogSlugs();
  const [blogEntries, issues] = await Promise.all([
    Promise.all(
      slugs.map(async (slug) => {
        const post = await getBlogPost(slug, defaultLocale);
        return {
          loc: buildMarketingUrl(`/blog/${slug}`),
          lastmod: post?.publishedAt,
          changefreq: "monthly" as const,
          priority: 0.75,
        };
      }),
    ),
    getPublishedIssues(100),
  ]);

  const newsletterEntries = issues.map((issue) => ({
    loc: buildMarketingUrl(`/newsletter/${issue.slug}`),
    lastmod: issue.sent_at,
    changefreq: "monthly" as const,
    priority: 0.7,
  }));

  return xmlResponse(renderUrlSet([...blogEntries, ...newsletterEntries]));
}
