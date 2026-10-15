"use client";

import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { ContactForm } from "@/components/contact/contact-form";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useFrontDoor } from "@/components/public/front-door";
import { Toaster } from "sonner";
import { useTranslations } from "@/lib/i18n/context";
import type {
  EvaluationRequestOffer,
  EvaluationSector,
} from "@/lib/validators/evaluation-request";

type ContactPageContentProps = {
  requestedOffer?: EvaluationRequestOffer;
  requestedSector?: EvaluationSector;
};

/**
 * `/contact`: the pilot request (launch L-30). The free test is offered first
 * for anyone who would rather try it themselves, and the call stays one link
 * away; the form asks for five things.
 */
export function ContactPageContent({ requestedOffer, requestedSector }: ContactPageContentProps) {
  const t = useTranslations("contact");
  const { demoPublic } = useFrontDoor();

  return (
    <div className="min-h-screen bg-background text-black font-mk-sans selection:bg-black selection:text-white">
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-24 pt-16 sm:px-8 lg:px-12 lg:pt-20">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-normal tracking-tight sm:text-5xl text-balance">
            {t("title")}
          </h1>
          <p className="mt-6 text-base text-gray-600 max-w-xl mx-auto leading-relaxed text-balance">
            {t("subtitle")}
          </p>
          {demoPublic ? (
            <p className="mt-6 text-base text-black">
              {t("tryYourself")}{" "}
              <Link
                href="/demo"
                className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
              >
                {t("runFreeTest")}
              </Link>
            </p>
          ) : null}
          <p className="mt-3 text-sm text-gray-500">
            {t("preferLive")}{" "}
            <Link
              href="/call"
              className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
            >
              {t("bookMeeting")}
            </Link>
          </p>
        </header>

        <section className="w-full">
          <ContactForm requestedOffer={requestedOffer} requestedSector={requestedSector} />
        </section>
      </main>
      <MarketingFooter />
      {/* The form's toasts. The public document has no toast host, so the other public pages do not load one (launch L-24b). */}
      <Toaster richColors position="top-right" closeButton={false} />
    </div>
  );
}
