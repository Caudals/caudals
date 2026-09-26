"use client";

import { useTranslations } from "@/lib/i18n/context";

/** The problem and our answer in two sentences: companies find out late; we find it first and build the fix. */
export function ProblemSection() {
  const t = useTranslations("problem");

  return (
    <section className="lp-wrap lp-problem">
      <p className="lp-rv">
        {t("lead")} <span className="solution">{t("solution")}</span>
      </p>
    </section>
  );
}
