"use client";

import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { landingModePublicEnabled } from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";

const REQUESTER_ONBOARDING_CTA = "/auth/sign-up?role=requester&next=/requester/onboarding";

export function CTASection() {
  const t = useTranslations();
  const isLandingMode = landingModePublicEnabled;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-6 rounded-[2.4rem] border border-border/80 bg-card px-8 py-12 text-center">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {t("Next steps")}
          </p>
          <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
            {isLandingMode
              ? t("Ready to scope your first dataset conversation?")
              : t("Ready to launch your next dataset program?")}
          </h2>
          <p className="mx-auto max-w-3xl text-base text-slate-500">
            {isLandingMode
              ? t(
                  "Tell us what you need to collect, review, or validate and we will route you to the right next step.",
                )
              : t(
                  "Start in the dashboard or contact the Caudals team to shape a tailored rollout for your operation.",
                )}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="h-12 min-w-[220px]" asChild>
              <Link href={isLandingMode ? "/contact" : REQUESTER_ONBOARDING_CTA}>
                {isLandingMode ? t("Contact Caudals") : t("Start collecting data")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 min-w-[220px] border-border/80"
              asChild
            >
              <Link href={isLandingMode ? "/blog" : "/contact"}>
                {isLandingMode ? t("Read the blog") : t("Go to Contact")}
              </Link>
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 text-sm text-slate-500 sm:flex-row sm:gap-6">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" />
              {t("Payment, QA, and compliance rails included")}
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              {t("Dedicated human support in every time zone")}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
