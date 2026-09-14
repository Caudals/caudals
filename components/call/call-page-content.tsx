"use client";

import Link from "next/link";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { Button } from "@/components/ui/button";
import { BookingEmbed } from "@/components/call/booking-embed";
import { useTranslations } from "@/lib/i18n/use-translations";
import type { Translator } from "@/lib/i18n/create-translator";

type CallPageContentProps = {
  /** Public Cal.com booking link (e.g. "caudals/call"). Absent → graceful fallback. */
  calLink?: string;
};

export function CallPageContent({ calLink }: CallPageContentProps) {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-background text-black font-sans selection:bg-black selection:text-white">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:px-12 lg:pt-20">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl">
            {t("Book a meeting")}
          </h1>
          <p className="mt-6 text-base text-gray-600 max-w-xl mx-auto leading-relaxed">
            {t(
              "Pick a time that works for you. We'll look at what your AI system answers, how you test it today and what an evaluation would cover.",
            )}
          </p>
        </header>

        <section className="w-full" aria-label={t("Meeting scheduler")}>
          {calLink ? (
            <BookingEmbed calLink={calLink} />
          ) : (
            <SchedulerNotConfigured t={t} />
          )}

          <p className="mt-8 text-center text-sm leading-relaxed text-gray-500">
            {t("Prefer to write first?")}{" "}
            <Link
              href="/contact"
              className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
            >
              {t("Describe your system")}
            </Link>{" "}
            {t("or email")}{" "}
            <a
              href="mailto:hello@caudals.com"
              className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
            >
              hello@caudals.com
            </a>
            .
          </p>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function SchedulerNotConfigured({ t }: { t: Translator }) {
  return (
    <div className="flex min-h-[480px] flex-col items-center justify-center px-6 text-center">
      <h2 className="text-lg font-bold text-black">
        {t("Scheduling is being set up")}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
        {t(
          "Our live scheduler isn't connected yet. Tell us about your system and we'll reply within 24 hours to find a time.",
        )}
      </p>
      <Button
        asChild
        className="mt-6 rounded-md bg-black px-6 font-bold text-white hover:bg-black/90"
      >
        <Link href="/contact">{t("Contact us")}</Link>
      </Button>
    </div>
  );
}
