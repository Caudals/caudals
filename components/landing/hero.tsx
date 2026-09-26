"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { HeroChat } from "@/components/landing/hero-chat";
import { splitMarked } from "@/components/landing/marks";
import { useTranslations } from "@/lib/i18n/context";

export function HeroSection() {
  const t = useTranslations("hero");
  // Each locale marks its own serif-italic word with asterisks.
  const headline = splitMarked(t("headline"));

  return (
    <section className="lp-wrap lp-hero">
      <div>
        <h1 className="lp-h1 lp-rise">
          {headline.before}
          {headline.marked ? <em>{headline.marked}</em> : null}
          {headline.after}
        </h1>
        <p className="lp-sub lp-rise" style={{ ["--d" as string]: 0.08 }}>
          {t("subtitle")}
        </p>
        <div className="lp-hero-act lp-rise" style={{ ["--d" as string]: 0.16 }}>
          <Link href="/contact?offer=reality-check" className="lp-btn">
            {t("primaryCta")}
            <span className="lp-arr" aria-hidden="true">
              →
            </span>
          </Link>
          <Link href="/call" className="lp-hero-call">
            {t("secondaryCta")}
          </Link>
        </div>
      </div>
      <div className="lp-rise" style={{ ["--d" as string]: 0.24 }}>
        <HeroChat />
      </div>
    </section>
  );
}
