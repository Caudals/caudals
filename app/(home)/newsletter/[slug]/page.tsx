import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";
import { NewsletterBlockView } from "@/components/newsletter/blocks";
import { NewsletterSignupForm } from "@/components/newsletter/signup-form";
import { getPublishedIssue, getPublishedIssues } from "@/lib/newsletter/client";
import { getServerTranslator } from "@/lib/i18n/server";
import { landingModePublicNavigationLinks } from "@/lib/landing-mode";
import { buildPublicMetadata } from "@/lib/seo";

/** One issue, permanently. Only issues that were actually sent are readable. */

export const revalidate = 300;

export async function generateStaticParams() {
  const issues = await getPublishedIssues(50);
  return issues.map((issue) => ({ slug: issue.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const issue = await getPublishedIssue(slug);

  if (!issue) {
    return buildPublicMetadata({
      title: "Data Unfiltered",
      description: "Caudals newsletter.",
      pathname: `/newsletter/${slug}`,
      noIndex: true,
    });
  }

  return buildPublicMetadata({
    title: `${issue.title} — Data Unfiltered`,
    description: issue.dek ?? "Caudals newsletter.",
    pathname: `/newsletter/${issue.slug}`,
  });
}

export default async function NewsletterIssuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getServerTranslator();
  const issue = await getPublishedIssue(slug);

  if (!issue) notFound();

  let sent = "";
  if (issue.sent_at) {
    try {
      const date = new Date(issue.sent_at);
      if (!isNaN(date.getTime())) {
        sent = date.toLocaleDateString("es-ES", {
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

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      <Header links={[...landingModePublicNavigationLinks]} hideActions />

      <main className="mx-auto flex w-full max-w-2xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:pt-20">
        <Link
          href="/newsletter"
          className="mb-8 text-sm text-gray-500 transition hover:text-black"
        >
          ← Data Unfiltered
        </Link>

        <header className="mb-10">
          <p className="mb-3 text-sm text-gray-500">
            {issue.number ? `Nº ${issue.number} · ` : ""}
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

        <section className="mt-16 rounded-2xl border border-gray-200 bg-gray-50/60 p-6 sm:p-8">
          <p className="mb-1 text-lg font-semibold text-slate-900">
            {t("Someone forwarded you this?")}
          </p>
          <p className="mb-4 text-sm text-slate-600">
            {t("Get the next one straight to your inbox.")}
          </p>
          <NewsletterSignupForm source="archive_issue" compact />
        </section>
      </main>

      <MarketingFooter forceLandingMode />
    </div>
  );
}
