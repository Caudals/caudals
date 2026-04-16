"use client";

import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { ContactForm } from "@/components/contact/contact-form";
import { landingModePublicNavigationLinks } from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";

export function ContactPageContent() {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      <Header links={[...landingModePublicNavigationLinks]} hideActions />
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:px-12 lg:pt-20">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl">
            {t("Talk with Caudals")}
          </h1>
          <p className="mt-6 text-base text-gray-600 max-w-xl mx-auto leading-relaxed">
            {t(
              "Tell us what data your company needs or what data you can offer. We'll get back to you within 24 hours.",
            )}
          </p>
        </header>

        <section className="w-full">
          <ContactForm />
        </section>
      </main>
      <MarketingFooter forceLandingMode />
    </div>
  );
}
