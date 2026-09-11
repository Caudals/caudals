"use client";

import Link from "next/link";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { ContactForm } from "@/components/contact/contact-form";
import { useTranslations } from "@/lib/i18n/use-translations";
import type { EvaluationRequestOffer } from "@/lib/validators/evaluation-request";

type ContactPageContentProps = {
  requestedOffer?: EvaluationRequestOffer;
};

export function ContactPageContent({ requestedOffer }: ContactPageContentProps) {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:px-12 lg:pt-20">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl">
            {t("Request an evaluation")}
          </h1>
          <p className="mt-6 text-base text-gray-600 max-w-xl mx-auto leading-relaxed">
            {t(
              "Tell us which AI system you run and what it answers. We'll reply within 24 hours with the right starting point, often a free Reality Check.",
            )}
          </p>
          <p className="mt-4 text-sm text-gray-500">
            {t("Prefer to meet live?")}{" "}
            <Link
              href="/call"
              className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
            >
              {t("Book a meeting")}
            </Link>
          </p>
        </header>

        <section className="w-full">
          <ContactForm requestedOffer={requestedOffer} />
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
