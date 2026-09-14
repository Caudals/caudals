import Link from "next/link";
import { formatBlogDate, formatReadTime } from "@/lib/blog/shared";
import type { BlogPostSummary } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type BlogPostCardProps = {
  className?: string;
  post: BlogPostSummary;
};

export function BlogPostCard({ className, post }: BlogPostCardProps) {
  return (
    <article className={cn("group flex flex-col items-start justify-between sm:flex-row sm:items-baseline gap-4 py-8 border-t border-black/[0.08] first:border-t-0", className)}>
      <div className="flex-1">
        <Link href={`/blog/${post.slug}`} className="block">
          <h3 className="text-2xl font-normal tracking-tight text-black group-hover:underline decoration-1 underline-offset-4">
            {post.title}
          </h3>
          <p className="mt-3 text-base text-gray-600 leading-relaxed max-w-2xl">
            {post.excerpt}
          </p>
        </Link>
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium text-gray-900">{post.category}</span>
          <span>&middot;</span>
          <span>{formatReadTime(post.readTimeMinutes, post.locale)}</span>
        </div>
      </div>
      <div className="text-sm text-gray-500 whitespace-nowrap">
        {formatBlogDate(post.publishedAt, post.locale)}
      </div>
    </article>
  );
}

export function FeaturedBlogCard({ post }: { eyebrowLabel: string; post: BlogPostSummary; readArticleLabel: string }) {
  // Fallback for any other usages
  return <BlogPostCard post={post} />;
}
