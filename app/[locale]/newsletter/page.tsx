import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/footer";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { Header } from "@/components/ui/header";
import { NewsletterSignupForm } from "@/components/newsletter/signup-form";
import { getPublishedIssues } from "@/lib/newsletter/client";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { locales, type Locale } from "@/lib/i18n/config";
import { buildPublicMetadata } from "@/lib/seo";

/**
 * The public archive.
 *
 * Two jobs, in this order: convert a reader into a subscriber, and give every
 * issue a permanent URL. The second one is the slower and larger of the two —
 * a couple of years of issues is a body of technical writing that search and
 * AI assistants can cite, which is the loop described in
 * `docs/growth/05-NEWSLETTER.md` §6.
 */

export const revalidate = 300;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type NewsletterIndexProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: NewsletterIndexProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const t = getScopedTranslator(locale, "newsletter");

  return buildPublicMetadata({
    title: t("metaTitle"),
    description: t("metaDescription"),
    pathname: "/newsletter",
    locale,
  });
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(locale === "en" ? "en-GB" : "es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function NewsletterPage({ params }: NewsletterIndexProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const t = getScopedTranslator(locale, "newsletter");
  const issues = await getPublishedIssues();

  return (
    <div className="min-h-screen bg-background text-black font-sans selection:bg-black selection:text-white">
      <Header />

      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:pt-20">
        <header className="mb-12">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-gray-600">
            {t("intro")}
          </p>
        </header>

        <section className="mb-16 rounded-2xl border border-black/[0.08] bg-background p-6 sm:p-8 shadow-xs">
          <NewsletterSignupForm source="archive" />
        </section>

        <section className="flex flex-col divide-y divide-gray-200">
          {issues.length === 0 ? (
            <p className="italic text-gray-500">
              {t("empty")}
            </p>
          ) : (
            issues.map((issue) => (
              <article key={issue.id} className="py-7 first:pt-0">
                <Link href={`/newsletter/${issue.slug}`} className="group block">
                  <p className="mb-2 text-sm text-gray-500">
                    {issue.number
                      ? `${t("issueNumber", { number: issue.number })} · `
                      : ""}
                    {formatDate(issue.sent_at, locale)}
                  </p>
                  <h2 className="text-2xl font-medium tracking-tight transition group-hover:text-black/60">
                    {issue.title}
                  </h2>
                  {issue.dek && (
                    <p className="mt-2 text-base leading-relaxed text-gray-600">{issue.dek}</p>
                  )}
                </Link>
              </article>
            ))
          )}
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
