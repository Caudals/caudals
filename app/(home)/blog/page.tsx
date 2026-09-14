// app/(home)/blog/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { BlogPostCard } from "@/components/blog/blog-card";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";
import { normalizeTopicKey } from "@/lib/blog/shared";
import { getBlogPosts } from "@/lib/blog/posts";
import { getRequestLocale, getServerTranslator } from "@/lib/i18n/server";
import { buildPublicMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}): Promise<Metadata> {
  const t = await getServerTranslator();
  const { topic } = await searchParams;

  return {
    ...buildPublicMetadata({
      title: t("Blog"),
      description: t(
        "Notes on how to evaluate AI systems and the data that makes them reliable."
      ),
      pathname: "/blog",
      noIndex: Boolean(normalizeTopicKey(topic)),
    }),
  };
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const locale = await getRequestLocale();
  const t = await getServerTranslator();
  const posts = await getBlogPosts(locale);
  const { topic } = await searchParams;
  const selectedTopic = normalizeTopicKey(topic);
  
  const topics = posts.reduce<Array<{ key: string; label: string }>>((accumulator, post) => {
    if (!accumulator.some((item) => item.key === post.categoryKey)) {
      accumulator.push({ key: post.categoryKey, label: post.category });
    }
    return accumulator;
  }, []);

  const filteredPosts = selectedTopic
    ? posts.filter((post) => post.categoryKey === selectedTopic)
    : posts;

  return (
    <div className="min-h-screen bg-background text-black font-sans selection:bg-black selection:text-white">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:px-12 lg:pt-20">
        <header className="mb-16">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl">
            {t("Blog")}
          </h1>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/blog"
              className={cn(
                "text-base transition-opacity hover:opacity-100",
                !selectedTopic ? "opacity-100 font-medium" : "opacity-50"
              )}
            >
              {t("All")}
            </Link>
            {topics.map((topicOption) => (
              <Link
                key={topicOption.key}
                href={`/blog?topic=${topicOption.key}`}
                className={cn(
                  "text-base transition-opacity hover:opacity-100",
                  selectedTopic === topicOption.key ? "opacity-100 font-medium" : "opacity-50"
                )}
              >
                {topicOption.label}
              </Link>
            ))}
          </div>
        </header>

        <section className="flex flex-col gap-12">
          {filteredPosts.length > 0 ? (
            filteredPosts.map((post) => (
              <BlogPostCard key={post.slug} post={post} />
            ))
          ) : (
            <p className="text-gray-500 italic">{t("No entries found.")}</p>
          )}
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
