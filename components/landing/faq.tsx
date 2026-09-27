"use client";

import { useTranslations } from "@/lib/i18n/context";
import { HOME_FAQ_IDS } from "@/lib/public/home-faq";

/** A short, centred FAQ: what we do, how it works for a non-technical buyer, and why they can trust it. */
export function FAQSection() {
  const t = useTranslations("faq");

  return (
    <section id="faq" className="lp-wrap lp-faq" aria-labelledby="faq-title">
      <h2 id="faq-title" className="lp-h2 lp-rv">
        {t("title")}
      </h2>
      <div className="lp-faq-list lp-rv">
        {HOME_FAQ_IDS.map((id) => (
          <details key={id}>
            <summary>
              <h3>{t(`${id}.q`)}</h3>
              <span className="sx-faq-mark" aria-hidden="true" />
            </summary>
            <p>{t(`${id}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
