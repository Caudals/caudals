import type { MetadataRoute } from "next";
import { getAllBlogSlugs, getBlogPost } from "@/lib/blog/posts";
import { defaultLocale } from "@/lib/i18n/config";
import {
  buildMarketingUrl,
  getIndexableMarketingRoutes,
} from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = getIndexableMarketingRoutes().map((route) => ({
    url: buildMarketingUrl(route.pathname),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const blogSlugs = await getAllBlogSlugs();
  const blogEntries = await Promise.all(
    blogSlugs.map(async (slug) => {
      const post = await getBlogPost(slug, defaultLocale);

      return {
        url: buildMarketingUrl(`/blog/${slug}`),
        lastModified: post?.publishedAt,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      };
    })
  );

  return [...staticRoutes, ...blogEntries];
}
