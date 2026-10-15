import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { DemoCtaButton } from "@/components/landing/demo-cta";
import type { Locale } from "@/lib/i18n/config";
import { createScopedTranslator } from "@/lib/i18n/messages";
import { PILOT_REQUEST_PATH } from "@/lib/public/pilot-request";

type CTASectionProps = {
  locale: Locale;
  /** `DEMO_PUBLIC` (`lib/public/front-door.ts`), read by the page on the server. */
  demoPublic: boolean;
  /** Overrides for a page with its own closing line, such as a sector page. */
  title?: string;
  /** Describes the manual diagnostic, so it gives way to the free test's line once the demo is public. */
  subtitle?: string;
  /** Where the free diagnostic is requested while the demo is not public; a sector page preselects its sector. */
  diagnosticHref?: string;
  /** Where a pilot is requested once the demo is public; a sector page preselects its sector. */
  pilotHref?: string;
  /** The line before "Request a pilot"; a sector page names its own reviewers. */
  pilotPrompt?: string;
};

/**
 * Closing call to action, over a blurred black-and-white office at night (a
 * CSS background, see landing.css). With `DEMO_PUBLIC` the free test leads,
 * the call follows, and a pilot request stays one quiet link away (launch
 * L-04, L-30).
 */
export function CTASection({
  locale,
  demoPublic,
  title,
  subtitle,
  diagnosticHref = "/contact?offer=reality-check",
  pilotHref = PILOT_REQUEST_PATH,
  pilotPrompt,
}: CTASectionProps) {
  const t = createScopedTranslator(locale, "cta");

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
            {pilotPrompt ?? t("pilotPrompt")} <Link href={pilotHref}>{t("pilotLink")}</Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
