import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";
import { CAUDALS_AUTHORS, getCaudalsAuthor } from "@/lib/authors";
import { landingModePublicNavigationLinks } from "@/lib/landing-mode";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return CAUDALS_AUTHORS.map((author) => ({ slug: author.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = getCaudalsAuthor(slug);

  if (!author) {
    return buildPublicMetadata({
      title: "Equipo de Caudals",
      description: "Perfiles del equipo fundador de Caudals.",
      pathname: "/equipo",
      noIndex: true,
    });
  }

  return buildPublicMetadata({
    title: `${author.name}, ingeniero de telecomunicación`,
    description: author.description,
    pathname: `/equipo/${author.slug}`,
    authors: [author.name],
  });
}

function publicFileExists(publicPath: string) {
  const relativePath = publicPath.replace(/^\/+/, "");
  return fs.existsSync(path.join(process.cwd(), "public", relativePath));
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const author = getCaudalsAuthor(slug);

  if (!author) notFound();

  const credentialAvailable = publicFileExists(author.credentialPdfPath);
  const personId = `${buildMarketingUrl(`/equipo/${author.slug}`)}#person`;
  const personStructuredData = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${buildMarketingUrl(`/equipo/${author.slug}`)}#profile`,
    url: buildMarketingUrl(`/equipo/${author.slug}`),
    name: `${author.name}, ingeniero de telecomunicación y cofundador de Caudals`,
    inLanguage: "es",
    mainEntity: {
      "@type": "Person",
      "@id": personId,
      name: author.name,
      url: buildMarketingUrl(`/equipo/${author.slug}`),
      jobTitle: author.role,
      description: author.headline,
      sameAs: [author.linkedInUrl, author.githubUrl],
      worksFor: {
        "@type": "Organization",
        "@id": `${buildMarketingUrl("/")}#organization`,
        name: "Caudals",
        url: buildMarketingUrl("/"),
      },
      alumniOf: {
        "@type": "CollegeOrUniversity",
        name: "Universidad de Valladolid",
        sameAs: "https://www.uva.es/",
      },
      ...(credentialAvailable
        ? {
            hasCredential: {
              "@type": "EducationalOccupationalCredential",
              credentialCategory: "degree",
              name: author.education,
              url: buildMarketingUrl(author.credentialPdfPath),
            },
          }
        : {}),
    },
  };

  return (
    <div className="min-h-screen bg-white text-black">
      <Header links={[...landingModePublicNavigationLinks]} hideActions />
      <main lang="es" className="mx-auto w-full max-w-3xl px-6 pb-24 pt-16 sm:px-8 lg:pt-20">
        <Link
          href="/equipo"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Equipo de Caudals
        </Link>

        <article className="mt-10">
          <header className="border-b border-gray-200 pb-10">
            <p className="text-sm font-semibold text-teal-700">{author.role}</p>
            <h1 className="mt-3 text-4xl font-normal tracking-tight sm:text-6xl">
              {author.name}
            </h1>
            <p className="mt-6 text-xl leading-relaxed text-gray-600">{author.headline}</p>
          </header>

          <section className="py-10" aria-labelledby="biografia">
            <h2 id="biografia" className="text-2xl font-medium tracking-tight">
              Biografía
            </h2>
            <div className="mt-5 space-y-4 leading-relaxed text-gray-700">
              {author.bio.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="border-t border-gray-200 py-10" aria-labelledby="formacion">
            <h2 id="formacion" className="text-2xl font-medium tracking-tight">
              Formación y perfiles profesionales
            </h2>
            <p className="mt-5 leading-relaxed text-gray-700">{author.education}</p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                href={author.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer me"
                className="inline-flex items-center gap-2 text-sm font-semibold hover:text-teal-700"
              >
                LinkedIn <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={author.githubUrl}
                target="_blank"
                rel="noopener noreferrer me"
                className="inline-flex items-center gap-2 text-sm font-semibold hover:text-teal-700"
              >
                GitHub <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
              {credentialAvailable ? (
                <Link
                  href={author.credentialPdfPath}
                  className="inline-flex items-center gap-2 text-sm font-semibold hover:text-teal-700"
                >
                  Título universitario (PDF)
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </section>
        </article>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personStructuredData) }}
      />
      <MarketingFooter forceLandingMode />
    </div>
  );
}
