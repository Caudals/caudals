"use client";

import { useTranslations } from "@/lib/i18n/context";

/** The problem in two sentences: how companies find out, and what it has cost by then. */
export function ProblemSection() {
  const t = useTranslations("problem");

  return (
    <section className="lp-wrap lp-problem">
      <p className="lp-rv">
        {t("lead")} <span className="cost">{t("cost")}</span>
      </p>
    </section>
  );
}
