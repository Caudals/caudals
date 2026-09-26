import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";
import { getAdjacentBlogPosts, getAllBlogSlugs, getBlogPost } from "@/lib/blog/posts";
import { formatBlogDate, formatReadTime } from "@/lib/blog/shared";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { localeHtmlLang, locales } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";

/** Pre-renders every post in every locale, so both languages ship as static HTML. */
export async function generateStaticParams() {
  const slugs = await getAllBlogSlugs();
  return locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

type BlogPostParams = { locale: string; slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<BlogPostParams>;
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const t = getScopedTranslator(locale, "blog");
  const post = await getBlogPost(slug, locale);

  if (!post) {
    return buildPublicMetadata({
      title: t("title"),
      description: t("notFoundDescription"),
      pathname: "/blog",
      locale,
      noIndex: true,
    });
  }

  return buildPublicMetadata({
    title: post.title,
    description: post.excerpt,
    pathname: `/blog/${post.slug}`,
    locale,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.publishedAt,
    authors: [post.author],
    keywords: post.tags,
    section: post.category,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<BlogPostParams>;
}) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const t = getScopedTranslator(locale, "blog");
  const post = await getBlogPost(slug, locale);

  if (!post) {
    notFound();
  }

  const adjacentPosts = await getAdjacentBlogPosts(slug, locale);
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    url: buildMarketingUrl(localizePathname(`/blog/${post.slug}`, locale)),
    image: buildMarketingUrl("/brand.png"),
    author: {
      "@type": "Organization",
      "@id": `${buildMarketingUrl("/")}#organization`,
      name: post.author,
      url: buildMarketingUrl("/"),
    },
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    description: post.excerpt,
    headline: post.title,
    inLanguage: localeHtmlLang[locale],
    keywords: post.tags.join(", "),
    articleSection: post.category,
    mainEntityOfPage: buildMarketingUrl(
      localizePathname(`/blog/${post.slug}`, locale),
    ),
    publisher: {
      "@type": "Organization",
      "@id": `${buildMarketingUrl("/")}#organization`,
      name: "Caudals",
      logo: {
        "@type": "ImageObject",
        url: buildMarketingUrl("/apple-touch-icon.png"),
      },
    },
  };

  return (
    <div className="min-h-screen bg-background text-black font-sans selection:bg-black selection:text-white">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-col px-6 pb-24 pt-24 sm:px-8 lg:px-12 lg:pt-32">
        <Link
          href="/blog"
          className="mb-12 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>
        
        <article>
          <header className="mb-16">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
              <span className="font-medium text-gray-900">{post.category}</span>
              <span>&middot;</span>
              <span>{formatBlogDate(post.publishedAt, post.locale)}</span>
              <span>&middot;</span>
              <span>{formatReadTime(post.readTimeMinutes, post.locale)}</span>
            </div>
            <h1 className="text-4xl font-normal tracking-tight sm:text-6xl leading-[1.1]">
              {post.title}
            </h1>
            <p className="mt-8 text-xl text-gray-600 leading-relaxed">
              {post.excerpt}
            </p>
            <div className="mt-8 flex items-center gap-4 border-t border-gray-200 pt-8">
              <div>
                <p className="text-sm font-medium">{post.author}</p>
                <p className="text-sm text-gray-500">{post.authorRole}</p>
              </div>
            </div>
          </header>

          <div className="prose prose-lg prose-gray max-w-none prose-headings:font-normal prose-a:font-normal prose-a:underline-offset-4 hover:prose-a:text-gray-500 transition-colors">
            {post.content}
          </div>
        </article>

        {(adjacentPosts.previous || adjacentPosts.next) ? (
          <section className="mt-24 border-t border-gray-200 pt-16 flex flex-col md:flex-row justify-between gap-12">
            <h2 className="text-sm text-gray-500 md:w-1/3">
              {t("furtherReading")}
            </h2>
            <div className="flex flex-col items-end gap-12 text-right md:w-2/3">
              {adjacentPosts.next ? (
                <div className="max-w-md">
                  <p className="text-xs text-gray-400 mb-2">{t("next")}</p>
                  <Link href={`/blog/${adjacentPosts.next.slug}`} className="block group">
                    <h3 className="text-2xl font-normal text-black group-hover:text-gray-600 transition-colors">
                      {adjacentPosts.next.title}
                    </h3>
                  </Link>
                </div>
              ) : null}
              {adjacentPosts.previous ? (
                <div className="max-w-md">
                  <p className="text-xs text-gray-400 mb-2">{t("previous")}</p>
                  <Link href={`/blog/${adjacentPosts.previous.slug}`} className="block group">
                    <h3 className="text-2xl font-normal text-black group-hover:text-gray-600 transition-colors">
                      {adjacentPosts.previous.title}
                    </h3>
                  </Link>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <MarketingFooter />
    </div>
  );
}
