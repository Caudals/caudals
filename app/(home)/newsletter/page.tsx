import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";
import { NewsletterSignupForm } from "@/components/newsletter/signup-form";
import { getPublishedIssues } from "@/lib/newsletter/client";
import { getRequestLocale, getServerTranslator } from "@/lib/i18n/server";
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

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata({
    title: "Data Unfiltered, la newsletter de Caudals",
    description:
      "Análisis periódico sobre herramientas de IA y sobre cómo se obtienen, licencian, limpian y evalúan los datos con los que se entrenan los modelos.",
    pathname: "/newsletter",
  });
}

function formatDate(value: string | null, locale: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(locale === "en" ? "en-GB" : "es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function NewsletterPage() {
  const locale = await getRequestLocale();
  const t = await getServerTranslator();
  const issues = await getPublishedIssues();

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      <Header />

      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:pt-20">
        <header className="mb-12">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl">Data Unfiltered</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-gray-600">
            {t(
              "Every week: AI tools we have actually tested, techniques you can use the same day, and what really happens when you source, license and clean the data models train on."
            )}
          </p>
        </header>

        <section className="mb-16 rounded-2xl border border-gray-200 bg-gray-50/60 p-6 sm:p-8">
          <NewsletterSignupForm source="archive" />
        </section>

        <section className="flex flex-col divide-y divide-gray-200">
          {issues.length === 0 ? (
            <p className="italic text-gray-500">
              {t("The first issue is on its way. Subscribe above and you will get it.")}
            </p>
          ) : (
            issues.map((issue) => (
              <article key={issue.id} className="py-7 first:pt-0">
                <Link href={`/newsletter/${issue.slug}`} className="group block">
                  <p className="mb-2 text-sm text-gray-500">
                    {issue.number ? `Nº ${issue.number} · ` : ""}
                    {formatDate(issue.sent_at, locale)}
                  </p>
                  <h2 className="text-2xl font-medium tracking-tight transition group-hover:text-emerald-700">
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
