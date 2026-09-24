import { getAllBlogSlugs, getBlogPost } from "@/lib/blog/posts";
import { getPublishedIssues } from "@/lib/newsletter/client";
import { defaultLocale } from "@/lib/i18n/config";
import { localizedUrlEntries, renderUrlSet, xmlResponse } from "@/lib/sitemap-xml";

export const revalidate = 3600;

/** Blog posts and newsletter issues, each published in every locale. */
export async function GET() {
  const slugs = await getAllBlogSlugs();
  const [blogEntries, issues] = await Promise.all([
    Promise.all(
      slugs.map(async (slug) => {
        // Publication dates do not vary by language, so the default locale is
        // enough to read `lastmod`.
        const post = await getBlogPost(slug, defaultLocale);
        return localizedUrlEntries({
          pathname: `/blog/${slug}`,
          lastmod: post?.publishedAt,
          changefreq: "monthly",
          priority: 0.75,
        });
      }),
    ),
    getPublishedIssues(100),
  ]);

  const newsletterEntries = issues.flatMap((issue) =>
    localizedUrlEntries({
      pathname: `/newsletter/${issue.slug}`,
      lastmod: issue.sent_at,
      changefreq: "monthly",
      priority: 0.7,
    }),
  );

  // Blog posts and newsletter issues are temporarily hidden.
  return xmlResponse(
    renderUrlSet([]),
  );
}
