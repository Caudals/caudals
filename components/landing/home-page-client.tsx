"use client";

import { CTASection } from "@/components/landing/cta";
import { FAQSection } from "@/components/landing/faq";
import { HeroSection } from "@/components/landing/hero";
import { LandingShell } from "@/components/landing/landing-shell";
import { PartnerLogos } from "@/components/landing/partner-logos";
import { ProblemSection } from "@/components/landing/problem";
import { StepsSection } from "@/components/landing/steps";

export function HomePageClient() {
  return (
    <LandingShell>
      <HeroSection />
      <PartnerLogos />
      <ProblemSection />
      <StepsSection />
      <FAQSection />
      <CTASection />
    </LandingShell>
  );
}
