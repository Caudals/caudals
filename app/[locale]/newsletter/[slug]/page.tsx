import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";
import { NewsletterBlockView } from "@/components/newsletter/blocks";
import { NewsletterSignupForm } from "@/components/newsletter/signup-form";
import { getPublishedIssue, getPublishedIssues } from "@/lib/newsletter/client";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { localeHtmlLang, locales } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";

/** One issue, permanently. Only issues that were actually sent are readable. */

export const revalidate = 300;

export async function generateStaticParams() {
  const issues = await getPublishedIssues(50);
  return locales.flatMap((locale) =>
    issues.map((issue) => ({ locale, slug: issue.slug })),
  );
}

type IssueParams = { locale: string; slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<IssueParams>;
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const t = getScopedTranslator(locale, "newsletter");
  const issue = await getPublishedIssue(slug);

  if (!issue) {
    return buildPublicMetadata({
      title: t("title"),
      description: t("fallbackDescription"),
      pathname: `/newsletter/${slug}`,
      locale,
      noIndex: true,
    });
  }

  return buildPublicMetadata({
    title: `${issue.title} — ${t("title")}`,
    description: issue.dek ?? t("fallbackDescription"),
    pathname: `/newsletter/${issue.slug}`,
    locale,
    type: "article",
    publishedTime: issue.sent_at ?? undefined,
    modifiedTime: issue.sent_at ?? undefined,
    authors: [t("author")],
    section: t("title"),
  });
}

export default async function NewsletterIssuePage({
  params,
}: {
  params: Promise<IssueParams>;
}) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const t = getScopedTranslator(locale, "newsletter");
  const issue = await getPublishedIssue(slug);

  if (!issue) notFound();

  let sent = "";
  if (issue.sent_at) {
    try {
      const date = new Date(issue.sent_at);
      if (!isNaN(date.getTime())) {
        sent = date.toLocaleDateString(locale === "en" ? "en-GB" : "es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }
    } catch {
      sent = "";
    }
  }

  const blocks = Array.isArray(issue.blocks) ? issue.blocks : [];
  const articleStructuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${buildMarketingUrl(
      localizePathname(`/newsletter/${issue.slug}`, locale),
    )}#article`,
    url: buildMarketingUrl(localizePathname(`/newsletter/${issue.slug}`, locale)),
    headline: issue.title,
    description: issue.dek ?? t("fallbackDescription"),
    datePublished: issue.sent_at ?? undefined,
    dateModified: issue.sent_at ?? undefined,
    inLanguage: localeHtmlLang[locale],
    image: buildMarketingUrl("/brand.png"),
    author: {
      "@type": "Organization",
      "@id": `${buildMarketingUrl("/")}#organization`,
      name: t("author"),
      url: buildMarketingUrl("/"),
    },
    publisher: {
      "@type": "Organization",
      "@id": `${buildMarketingUrl("/")}#organization`,
      name: "Caudals",
      url: buildMarketingUrl("/"),
      logo: {
        "@type": "ImageObject",
        url: buildMarketingUrl("/apple-touch-icon.png"),
      },
    },
    mainEntityOfPage: buildMarketingUrl(
      localizePathname(`/newsletter/${issue.slug}`, locale),
    ),
  };

  return (
    <div className="min-h-screen bg-background text-black font-sans selection:bg-black selection:text-white">
      <Header />

      <main className="mx-auto flex w-full max-w-2xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:pt-20">
        <Link
          href="/newsletter"
          className="mb-8 text-sm text-gray-500 transition hover:text-black"
        >
          ← {t("title")}
        </Link>

        <header className="mb-10">
          <p className="mb-3 text-sm text-gray-500">
            {issue.number
              ? `${t("issueNumber", { number: issue.number })} · `
              : ""}
            {sent}
          </p>
          <h1 className="text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            {issue.title}
          </h1>
          {issue.dek && (
            <p className="mt-4 text-lg leading-relaxed text-gray-600">{issue.dek}</p>
          )}
        </header>

        <article>
          {blocks.map((block) => (
            <NewsletterBlockView key={block.id} block={block} />
          ))}
        </article>

        <section className="mt-16 rounded-2xl border border-black/[0.08] bg-background p-6 sm:p-8 shadow-xs">
          <p className="mb-1 text-lg font-semibold text-slate-900">
            {t("forwarded")}
          </p>
          <p className="mb-4 text-sm text-slate-600">
            {t("getNext")}
          </p>
          <NewsletterSignupForm source="archive_issue" compact />
        </section>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleStructuredData) }}
      />

      <MarketingFooter />
    </div>
  );
}
