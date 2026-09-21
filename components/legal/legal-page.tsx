import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import type { Locale } from "@/lib/i18n/config";
import { getLegalDocument, type LegalDocumentId } from "@/lib/legal/documents";

type LegalPageProps = {
  document: LegalDocumentId;
  locale: Locale;
};

// Minimal, card-free document layout matching the /contact and /blog surfaces:
// white canvas, landing navigation, a hairline-divided title, and quiet prose.
// The copy is read from `content/legal/<locale>.json`, already in the reader's
// language, so nothing is translated at render time.
export function LegalPage({ document, locale }: LegalPageProps) {
  const { title, description, sections } = getLegalDocument(document, locale);

  return (
    <div className="min-h-screen bg-background text-black font-sans selection:bg-black selection:text-white">
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:px-12 lg:pt-24">
        <header className="mb-12 border-b border-gray-200 pb-10">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-gray-500">
            {description}
          </p>
        </header>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-lg font-bold tracking-tight text-black">
                {section.title}
              </h2>
              <p className="text-base leading-relaxed text-gray-600">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
