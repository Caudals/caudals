import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { ClientMessages } from "@/components/i18n/client-messages";
import { DemoCtaButton } from "@/components/landing/demo-cta";
import { HeroChat } from "@/components/landing/hero-chat";
import { heroChatMessages } from "@/components/landing/hero-chat-data";
import type { Locale } from "@/lib/i18n/config";
import { createScopedTranslator } from "@/lib/i18n/messages";
import { splitMarked } from "@/lib/marked-text";

/** The landing hero, rendered on the server; only the checked conversations hydrate (launch L-24b). */
export function HeroSection({ locale, demoPublic }: { locale: Locale; demoPublic: boolean }) {
  const t = createScopedTranslator(locale, "hero");
  // Each locale marks its own serif-italic word with asterisks.
  const headline = splitMarked(t("headline"));

  return (
    <section className="lp-wrap lp-hero">
      <div>
        <h1 className="lp-h1 lp-lift">
          {headline.before}
          {headline.marked ? <em>{headline.marked}</em> : null}
          {headline.after}
        </h1>
        <p className="lp-sub lp-lift" style={{ ["--d" as string]: 0.08 }}>
          {t("subtitle")}
        </p>
        <div className="lp-hero-act lp-rise" style={{ ["--d" as string]: 0.16 }}>
          {demoPublic ? (
            <DemoCtaButton />
          ) : (
            <Link href="/contact?offer=reality-check" className="lp-btn">
              {t("primaryCta")}
              <span className="lp-arr" aria-hidden="true">
                →
              </span>
            </Link>
          )}
          <Link href="/call" className="lp-hero-call">
            {t("secondaryCta")}
          </Link>
        </div>
      </div>
      <div className="lp-rise" style={{ ["--d" as string]: 0.24 }}>
        <ClientMessages locale={locale} groups={heroChatMessages()}>
          <HeroChat />
        </ClientMessages>
      </div>
    </section>
  );
}
