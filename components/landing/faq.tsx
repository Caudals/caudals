import type { Locale } from "@/lib/i18n/config";
import { createScopedTranslator } from "@/lib/i18n/messages";
import { HOME_FAQ_IDS } from "@/lib/public/home-faq";

/** A short, centred FAQ: what we do, how it works for a non-technical buyer, and why they can trust it. */
export function FAQSection({ locale }: { locale: Locale }) {
  const t = createScopedTranslator(locale, "faq");

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
            </summary>
            <p>{t(`${id}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
