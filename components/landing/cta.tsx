"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useTranslations } from "@/lib/i18n/context";

/** Closing call to action, over a blurred black-and-white office at night (a CSS background, see landing.css). */
export function CTASection() {
  const t = useTranslations("cta");

  return (
    <section className="lp-wrap lp-cta" aria-labelledby="cta-title">
      <div className="lp-cta-card">
        <h2 id="cta-title" className="lp-cta-h">
          {t("title")}
        </h2>
        <p className="lp-cta-p">{t("subtitle")}</p>
        <div className="lp-cta-act">
          <Link href="/contact?offer=reality-check" className="lp-btn">
            {t("primaryCta")}
            <span className="lp-arr" aria-hidden="true">
              →
            </span>
          </Link>
          <Link href="/call" className="lp-btn lp-btn-ghost">
            {t("secondaryCta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
