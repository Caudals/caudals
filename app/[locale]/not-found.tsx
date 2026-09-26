"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { LandingShell } from "@/components/landing/landing-shell";
import { useTranslations } from "@/lib/i18n/context";

/** The public 404, in the Paper language and the reader's locale. */
export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <LandingShell>
      <title>{`${t("metaTitle")} | Caudals`}</title>
      <meta name="robots" content="noindex" />
      <section className="lp-wrap sx-404">
        <p className="lp-label">{t("label")}</p>
        <h1 className="lp-h1 sx-h1">{t("title")}</h1>
        <p className="lp-sub">{t("body")}</p>
        <div className="lp-hero-act">
          <Link href="/" className="lp-btn">
            {t("home")}
            <span className="lp-arr" aria-hidden="true">
              →
            </span>
          </Link>
          <Link href="/sectors" className="lp-hero-call">
            {t("sectors")}
          </Link>
        </div>
      </section>
    </LandingShell>
  );
}
