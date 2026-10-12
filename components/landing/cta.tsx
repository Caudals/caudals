"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { DemoCtaButton } from "@/components/landing/demo-cta";
import { useFrontDoor } from "@/components/public/front-door";
import { useTranslations } from "@/lib/i18n/context";

type CTASectionProps = {
  /** Overrides for a page with its own closing line, such as a sector page. */
  title?: string;
  /** Describes the manual diagnostic, so it gives way to the free test's line once the demo is public. */
  subtitle?: string;
  /** Where the free diagnostic is requested; a sector page preselects its sector. */
  diagnosticHref?: string;
};

/**
 * Closing call to action, over a blurred black-and-white office at night (a
 * CSS background, see landing.css). With `DEMO_PUBLIC` the free test leads and
 * the manual diagnostic stays one quiet link away (launch L-04).
 */
export function CTASection({
  title,
  subtitle,
  diagnosticHref = "/contact?offer=reality-check",
}: CTASectionProps = {}) {
  const t = useTranslations("cta");
  const { demoPublic } = useFrontDoor();

  return (
    <section className="lp-wrap lp-cta" aria-labelledby="cta-title">
      <div className="lp-cta-card">
        <h2 id="cta-title" className="lp-cta-h">
          {title ?? t("title")}
        </h2>
        <p className="lp-cta-p">{demoPublic ? t("demoSubtitle") : (subtitle ?? t("subtitle"))}</p>
        <div className="lp-cta-act">
          {demoPublic ? (
            <DemoCtaButton />
          ) : (
            <Link href={diagnosticHref} className="lp-btn">
              {t("primaryCta")}
              <span className="lp-arr" aria-hidden="true">
                →
              </span>
            </Link>
          )}
          <Link href="/call" className="lp-btn lp-btn-ghost">
            {t("secondaryCta")}
          </Link>
        </div>
        {demoPublic ? (
          <p className="lp-cta-alt">
            {t("diagnosticPrompt")}{" "}
            <Link href={diagnosticHref}>{t("diagnosticLink")}</Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
