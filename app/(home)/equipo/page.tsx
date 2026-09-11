import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";
import { CAUDALS_AUTHORS } from "@/lib/authors";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Equipo fundador",
  description:
    "Conoce a los ingenieros que fundaron Caudals y evalúan asistentes y agentes de IA con pruebas trazables, construidas con la documentación y los expertos de cada empresa.",
  pathname: "/equipo",
});

const teamStructuredData = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": `${buildMarketingUrl("/equipo")}#page`,
  url: buildMarketingUrl("/equipo"),
  name: "Equipo de Caudals",
  inLanguage: "es",
  description:
    "Equipo fundador de Caudals, especializado en ingeniería de telecomunicación, inteligencia artificial y evaluación de sistemas de IA.",
  about: CAUDALS_AUTHORS.map((author) => ({
    "@type": "Person",
    "@id": `${buildMarketingUrl(`/equipo/${author.slug}`)}#person`,
    name: author.name,
    url: buildMarketingUrl(`/equipo/${author.slug}`),
  })),
};

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-white text-black">
      <Header />
      <main lang="es" className="mx-auto w-full max-w-5xl px-6 pb-24 pt-16 sm:px-8 lg:px-12 lg:pt-20">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold text-teal-700">Equipo fundador</p>
          <h1 className="mt-3 text-4xl font-normal tracking-tight sm:text-6xl">
            Ingenieros detrás de las evaluaciones de Caudals
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-gray-600">
            Construimos conjuntos de pruebas con la documentación y los expertos de cada empresa, medimos dónde falla su IA y convertimos cada evaluación en los datos que la hacen más fiable.
          </p>
        </header>

        <section className="mt-16 grid gap-6 md:grid-cols-2" aria-label="Fundadores de Caudals">
          {CAUDALS_AUTHORS.map((author) => (
            <article key={author.slug} className="rounded-2xl border border-gray-200 p-7">
              <p className="text-sm font-medium text-teal-700">{author.role}</p>
              <h2 className="mt-2 text-2xl font-medium tracking-tight">{author.name}</h2>
              <p className="mt-4 leading-relaxed text-gray-600">{author.headline}</p>
              <Link
                href={`/equipo/${author.slug}`}
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-teal-700"
              >
                Ver perfil
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </section>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(teamStructuredData) }}
      />
      <MarketingFooter />
    </div>
  );
}
