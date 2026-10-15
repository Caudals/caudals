"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { DemoCtaButton } from "@/components/landing/demo-cta";
import { LandingShell } from "@/components/landing/landing-shell";
import { useFrontDoor } from "@/components/public/front-door";
import { useTranslations } from "@/lib/i18n/context";

/**
 * The public 404, in the Paper language and the reader's locale. With the
 * demo public, the free test is the way on (launch L-30), and the home page
 * and the sectors stay one quiet link away.
 *
 * Rendered on the server for any URL that matches no page
 * (`app/global-not-found.tsx`, launch L-24c) and by `app/[locale]/not-found.tsx`
 * when a public page calls `notFound()`.
 */
export function NotFoundView() {
  const t = useTranslations("notFound");
  const { demoPublic } = useFrontDoor();

  return (
    <LandingShell>
      <section className="lp-wrap sx-404">
        <p className="lp-label">{t("label")}</p>
        <h1 className="lp-h1 sx-h1">{t("title")}</h1>
        <p className="lp-sub">{t("body")}</p>
        <div className="lp-hero-act">
          {demoPublic ? (
            <>
              <DemoCtaButton />
              <Link href="/" className="lp-hero-call">
                {t("home")}
              </Link>
            </>
          ) : (
            <Link href="/" className="lp-btn">
              {t("home")}
              <span className="lp-arr" aria-hidden="true">
                →
              </span>
            </Link>
          )}
          <Link href="/sectors" className="lp-hero-call">
            {t("sectors")}
          </Link>
        </div>
      </section>
    </LandingShell>
  );
}
