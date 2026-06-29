"use client";

import Link from "next/link";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { ContactForm } from "@/components/contact/contact-form";
import { landingModePublicNavigationLinks } from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";

type ContactPageContentProps = {
  catalogueListingId?: string;
  requestedDatasetId?: string;
};

export function ContactPageContent({
  catalogueListingId,
  requestedDatasetId,
}: ContactPageContentProps) {
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
          <p className="mt-4 text-sm text-gray-500">
            {t("Prefer to meet live?")}{" "}
            <Link
              href="/book"
              className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
            >
              {t("Book a meeting")}
            </Link>
          </p>
        </header>

        <section className="w-full">
          <ContactForm
            catalogueListingId={catalogueListingId}
            requestedDatasetId={requestedDatasetId}
          />
        </section>
      </main>
      <MarketingFooter forceLandingMode />
    </div>
  );
}
