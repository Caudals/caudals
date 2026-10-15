import { CTASection } from "@/components/landing/cta";
import { FAQSection } from "@/components/landing/faq";
import { HeroSection } from "@/components/landing/hero";
import { LandingShell } from "@/components/landing/landing-shell";
import { PartnerLogos } from "@/components/landing/partner-logos";
import { ProblemSection } from "@/components/landing/problem";
import { StepsSection } from "@/components/landing/steps";
import type { Locale } from "@/lib/i18n/config";

/**
 * The home page. Its sections render on the server; the header, the hero chat
 * and the animated figures are the only parts that hydrate (launch L-24b).
 * `demoPublic` is `DEMO_PUBLIC`, read by the page on the server.
 */
export function HomePage({ locale, demoPublic }: { locale: Locale; demoPublic: boolean }) {
  return (
    <LandingShell>
      <HeroSection locale={locale} demoPublic={demoPublic} />
      <PartnerLogos locale={locale} />
      <ProblemSection locale={locale} />
      <StepsSection locale={locale} />
      <FAQSection locale={locale} />
      <CTASection locale={locale} demoPublic={demoPublic} />
    </LandingShell>
  );
}
