import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { landingModePublicNavigationLinks } from "@/lib/landing-mode";
import { getServerTranslator } from "@/lib/i18n/server";

type LegalSection = {
  title: string;
  body: string;
};

type LegalPageProps = {
  /** English source strings; translated here so each page stays declarative. */
  title: string;
  description: string;
  sections: LegalSection[];
};

// Minimal, card-free document layout matching the /contact and /blog surfaces:
// white canvas, landing navigation, a hairline-divided title, and quiet prose.
export async function LegalPage({ title, description, sections }: LegalPageProps) {
  const t = await getServerTranslator();

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      <Header links={[...landingModePublicNavigationLinks]} hideActions />
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:px-12 lg:pt-24">
        <header className="mb-12 border-b border-gray-200 pb-10">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl">
            {t(title)}
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-gray-500">
            {t(description)}
          </p>
        </header>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-lg font-bold tracking-tight text-black">
                {t(section.title)}
              </h2>
              <p className="text-base leading-relaxed text-gray-600">
                {t(section.body)}
              </p>
            </section>
          ))}
        </div>
      </main>
      <MarketingFooter forceLandingMode />
    </div>
  );
}
