"use client";

import { CheckCircle } from "lucide-react";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { ContactForm } from "@/components/contact/contact-form";
import { landingModePublicNavigationLinks } from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";

const contactSteps = [
  {
    title: "Share your dataset goals",
    description:
      "Tell us what you need to collect, validate, or launch. We will review the scope, timing, and operational shape behind the request.",
  },
  {
    title: "Get a focused reply",
    description:
      "We respond by email with fit, open questions, and the best next step for the conversation, usually within 48 hours.",
  },
  {
    title: "Move to a working session",
    description:
      "If there is a fit, we schedule a focused call to talk through pilot scope, delivery model, and commercial path.",
  },
];

export function ContactPageContent() {
  const t = useTranslations();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        translucent
        hideActions
        links={[...landingModePublicNavigationLinks]}
      />
      <main className="flex-1">
        <section className="container mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8 lg:px-12 lg:pb-24 lg:pt-10">
          <div className="mb-8 space-y-4 lg:mb-12">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {t("Talk with Caudals")}
            </h1>
            <p className="text-lg text-slate-500">
              {t(
                "Use this contact flow to start a commercial conversation about dataset collection, review operations, or a first pilot with the Caudals team.",
              )}
            </p>
          </div>

          <div className="grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
            <div className="order-2 space-y-8 lg:order-1">
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-foreground">
                  {t("What happens next")}
                </h2>
                <div className="space-y-5">
                  {contactSteps.map((step, index) => (
                    <div key={step.title} className="flex gap-4">
                      <div className="flex h-8 w-8 min-w-[2rem] items-center justify-center rounded-full bg-accent/10 text-accent">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                          {t("Step {{index}}", { index: index + 1 })}
                        </p>
                        <h3 className="text-lg font-semibold text-foreground">
                          {t(step.title)}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {t(step.description)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/50 p-5">
                <p className="text-sm font-medium text-slate-500">
                  {t("Prefer direct email? Reach us at")}{" "}
                  <a
                    href="mailto:contact@caudals.com"
                    className="font-semibold text-primary hover:underline"
                  >
                    contact@caudals.com
                  </a>
                </p>
              </div>
            </div>

            <div className="order-1 lg:order-2 lg:sticky lg:top-24">
              <div className="rounded-2xl bg-white p-4 pt-2 shadow-xl">
                <ContactForm />
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter forceLandingMode />
    </div>
  );
}
