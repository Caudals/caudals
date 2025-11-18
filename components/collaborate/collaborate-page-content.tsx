"use client";

import { CheckCircle } from "lucide-react";

import { Header } from "@/components/ui/header";
import { CollaborateForm } from "@/components/collaborate/collaborate-form";
import { MarketingFooter } from "@/components/marketing/footer";
import { useTranslations } from "@/lib/i18n/use-translations";

const partnershipSteps = [
  {
    title: "Share your initiative",
    description:
      "Tell us about your data needs, target outcomes, and timeline. We'll map the modalities, contributor personas, and quality criteria that match your goals.",
  },
  {
    title: "Co-design the program",
    description:
      "Our team works with you to build a tailored contributor brief, QA protocols, and payout structure. We handle recruitment, training, and device verification.",
  },
  {
    title: "Launch and scale",
    description:
      "Go live in days with certified contributor pods. Track progress through real-time dashboards while Stripe Connect handles payouts and compliance automatically.",
  },
];

export function CollaboratePageContent() {
  const t = useTranslations();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header translucent />
      <main className="flex-1 bg-gradient-to-b from-background via-background to-primary/5">
        <section className="container mx-auto w-full max-w-7xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8 sm:pb-20 lg:px-12 lg:pt-10 lg:pb-24">
          {/* Title - Always on top */}
          <div className="mb-8 space-y-4 lg:mb-12">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {t("Partner with Caudals")}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t(
                "Work with our team to co-create responsible AI datasets, launch global contributor programs, and unlock new collaboration models.",
              )}
            </p>
          </div>

          <div className="grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
            {/* Left side on desktop, bottom on mobile */}
            <div className="order-2 space-y-8 lg:order-1">
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-foreground">
                  {t("How partnerships work")}
                </h2>
                <div className="space-y-5">
                  {partnershipSteps.map((step, index) => (
                    <div key={step.title} className="flex gap-4">
                      <div className="flex h-8 w-8 min-w-[2rem] items-center justify-center rounded-full bg-accent/10 text-accent">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("Step {{index}}", { index: index + 1 })}
                        </p>
                        <h3 className="text-lg font-semibold text-foreground">{t(step.title)}</h3>
                        <p className="text-sm text-muted-foreground">{t(step.description)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/50 p-5">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("Questions? Reach us at")}{" "}
                  <a
                    href="mailto:contact@caudals.com"
                    className="font-semibold text-primary hover:underline"
                  >
                    contact@caudals.com
                  </a>
                </p>

              </div>
            </div>

            {/* Right side on desktop, top on mobile (after title) */}
            <div className="order-1 lg:order-2 lg:sticky lg:top-24">
              <div className="rounded-2xl bg-white p-4 pt-2 shadow-xl">
                <CollaborateForm />
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
