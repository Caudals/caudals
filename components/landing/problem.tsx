import type { Locale } from "@/lib/i18n/config";
import { createScopedTranslator } from "@/lib/i18n/messages";

/** The problem and our answer in two sentences: companies find out late; we find it first and build the fix. */
export function ProblemSection({ locale }: { locale: Locale }) {
  const t = createScopedTranslator(locale, "problem");

  return (
    <section className="lp-wrap lp-problem">
      <p className="lp-rv">
        {t("lead")} <span className="solution">{t("solution")}</span>
      </p>
    </section>
  );
}
