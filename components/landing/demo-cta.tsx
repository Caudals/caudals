"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useTranslations } from "@/lib/i18n/context";

/**
 * The free test as the primary CTA (launch L-04): one pill that carries its
 * own small print, read as "Test your assistant free — 8 questions, about 3
 * minutes". Used by the hero, the sector heroes and the closing card.
 */
export function DemoCtaButton() {
  const t = useTranslations("hero");
  return (
    <Link href="/demo" className="lp-btn lp-btn-demo">
      <span className="lp-btn-lines">
        <span>{t("demoCta")}</span>
        <span className="sr-only"> — </span>
        <span className="lp-btn-note">{t("demoCtaDetail")}</span>
      </span>
      <span className="lp-arr" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
