"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useTranslations } from "@/lib/i18n/context";

type CTASectionProps = {
  /** Overrides for a page with its own closing line, such as a sector page. */
  title?: string;
  subtitle?: string;
  /** Where the primary button leads; a sector page preselects its sector. */
  primaryHref?: string;
};

/** Closing call to action, over a blurred black-and-white office at night (a CSS background, see landing.css). */
export function CTASection({
  title,
  subtitle,
  primaryHref = "/contact?offer=reality-check",
}: CTASectionProps = {}) {
  const t = useTranslations("cta");

  return (
    <section className="lp-wrap lp-cta" aria-labelledby="cta-title">
      <div className="lp-cta-card">
        <h2 id="cta-title" className="lp-cta-h">
          {title ?? t("title")}
        </h2>
        <p className="lp-cta-p">{subtitle ?? t("subtitle")}</p>
        <div className="lp-cta-act">
          <Link href={primaryHref} className="lp-btn">
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
